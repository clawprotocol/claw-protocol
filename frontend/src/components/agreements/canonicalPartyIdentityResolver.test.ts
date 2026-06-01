import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalPartyIdentitiesFromRecords,
  definedOpeningLine,
  intakeHasFullLegalEntityParties,
  intakeSpecifiesSimpleFixedFee,
  repairCanonicalPartyIdentityInCorpus,
  replaceTruncatedPartyRefsWithRoleLabels,
  resolveCanonicalPartyIdentitiesFromSources,
  resolveCanonicalPartyIdentitiesFromIntake,
  shouldSuppressPartyLegalNamesGuidedQuestion,
  stripIrrelevantFixedFeeBoilerplate,
} from "./canonicalPartyIdentityResolver";
import { extractDealVariables } from "./guidedDealCompletion/missingVariableExtractor";
import { isGuidedVariableSatisfiedByIntake } from "./guidedDealCompletion/guidedIntakeFactPrefill";
import { shortFormsFromLegalName } from "./paidProPartyNamePreserve";

const INTAKE =
  "Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup services. Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.";

describe("canonicalPartyIdentityResolver", () => {
  it("extracts full legal names from minimal services intake", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE);
    expect(records).toHaveLength(2);
    expect(records[0]?.fullLegalName).toBe("Red Mesa Logistics LLC");
    expect(records[1]?.fullLegalName).toBe("Harbor Peak Automation LLC");
    expect(intakeHasFullLegalEntityParties(INTAKE)).toBe(true);
  });

  it("does not unconditionally spam canonical party source candidates in production", () => {
    const source = readFileSync(join(__dirname, "canonicalPartyIdentityResolver.ts"), "utf8");
    const fnIdx = source.indexOf("export function logCanonicalPartySourceCandidates");
    const block = source.slice(fnIdx, fnIdx + 900);
    expect(block).toContain("!import.meta.env?.DEV");
    expect(block).toContain("loggedCanonicalPartySourceCandidates.has(key)");
    expect(block).toContain("loggedCanonicalPartySourceCandidates.add(key)");
  });

  it("does not repeat canonical party preserved logs on every render", () => {
    const source = readFileSync(join(__dirname, "canonicalPartyIdentityResolver.ts"), "utf8");
    const fnIdx = source.indexOf("export function logCanonicalPartyIdentityPreserved");
    const block = source.slice(fnIdx, fnIdx + 900);
    expect(block).toContain("!import.meta.env?.DEV");
    expect(block).toContain("loggedCanonicalPartyIdentityPreserved.has(key)");
    expect(block).toContain("loggedCanonicalPartyIdentityPreserved.add(key)");
  });

  it("raw intake full legal entities override shortened starter party labels", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(
      INTAKE,
      ["Red Mesa", "Harbor Peak"],
      ["Client", "Service Provider"],
    );
    expect(records[0]?.fullLegalName).toBe("Red Mesa Logistics LLC");
    expect(records[1]?.fullLegalName).toBe("Harbor Peak Automation LLC");
  });

  it("rejects heading-like generated body phrases as canonical parties", () => {
    const records = resolveCanonicalPartyIdentitiesFromSources({
      generatedBody:
        "Effective Date Services Term\n\nGoverning Law This Agreement\n\nPayment Terms Electronic Signatures",
      starterNames: ["Effective Date Services Term", "Governing Law This Agreement"],
    });
    expect(records).toEqual([]);
  });

  it("does not promote generated body names without legal suffixes", () => {
    const records = resolveCanonicalPartyIdentitiesFromSources({
      generatedBody: "This Agreement is between Red Mesa and Harbor Peak. Red Mesa will pay Harbor Peak.",
      starterNames: ["Red Mesa", "Harbor Peak"],
    });
    expect(records).toEqual([]);
  });

  it("preserves LLC, Inc, and LP suffixes as canonical legal names", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(
      "Create an agreement between Northstar Robotics Inc. and Prairie Signal Holdings LP for implementation services.",
    );
    expect(records[0]?.fullLegalName).toBe("Northstar Robotics Inc.");
    expect(records[1]?.fullLegalName).toBe("Prairie Signal Holdings LP");
    const canonical = canonicalPartyIdentitiesFromRecords(records);
    expect(canonical[0]?.canonicalLegalName).toBe("Northstar Robotics Inc.");
    expect(canonical[1]?.canonicalLegalName).toBe("Prairie Signal Holdings LP");
    expect(canonical[0]?.shortDisplayName).not.toBe(canonical[0]?.canonicalLegalName);
  });

  it("does not strip LLC/Inc/Corp/LP entity suffixes from short-form derivation inputs", () => {
    const shorts = shortFormsFromLegalName("Harbor Peak Automation LLC");
    expect(shorts.some((s) => s === "Harbor Peak")).toBe(true);
    expect(shorts).not.toContain("Harbor Peak Automation LLC");
    expect(shorts.every((s) => !/\bLLC\b/i.test(s))).toBe(true);
  });

  it("suppresses party legal-name guided question when intake has full entities", () => {
    expect(shouldSuppressPartyLegalNamesGuidedQuestion(INTAKE)).toBe(true);
    expect(isGuidedVariableSatisfiedByIntake("party_legal_names", INTAKE)).toBe(true);
    const vars = extractDealVariables({ intakeRaw: INTAKE, body: "x".repeat(600) });
    expect(vars.some((v) => v.id === "party_legal_names")).toBe(false);
  });

  it("builds defined opening with full legal names and role labels", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE)!;
    const line = definedOpeningLine(records[0]!, records[1]!);
    expect(line).toBe(
      'This Agreement is between Red Mesa Logistics LLC ("Client") and Harbor Peak Automation LLC ("Service Provider").',
    );
  });

  it("replaces truncated party names in body with role labels", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE)!;
    const body =
      "Red Mesa is engaging Harbor Peak to perform services. Red Mesa will pay Harbor Peak $5,000 upon completion.";
    const { text, repairs } = replaceTruncatedPartyRefsWithRoleLabels(body, records);
    expect(repairs.length).toBeGreaterThan(0);
    expect(text).toMatch(/Client is engaging Service Provider/i);
    expect(text).toMatch(/Client will pay Service Provider/i);
    expect(text).not.toMatch(/\bRed Mesa will pay Harbor Peak\b/i);
  });

  it("does not replace paid Pro mutual consulting by-and-between recital with definedOpeningLine", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE)!;
    const draft = [
      "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
      "",
      `This Mutual Consulting and Implementation Agreement (this "Agreement") is entered into as of the Effective Date by and between ${records[0]!.fullLegalName} ("Client") and ${records[1]!.fullLegalName} ("Service Provider"). Client and Service Provider may be referred to individually as a "Party" and collectively as the "Parties."`,
      "",
      "1. Services",
    ].join("\n");
    const { text, repairs } = repairCanonicalPartyIdentityInCorpus(draft, records, { intakeRaw: INTAKE });
    expect(repairs).not.toContain("party_identity:defined_opening");
    expect(text).toMatch(/by and between/i);
    expect(text).not.toMatch(/Effective Date This Agreement is between/i);
    expect(text).toMatch(/collectively as the ["']Parties/i);
  });

  it("repairs opening and expands shorts to full legal names in corpus", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE)!;
    const draft = [
      "SERVICES AGREEMENT",
      "",
      "This Agreement is between Red Mesa and Harbor Peak.",
      "",
      "1. Services",
      "Red Mesa will pay Harbor Peak $5,000.",
      "",
      "IN WITNESS WHEREOF",
      "CLIENT: Red Mesa",
      "SERVICE PROVIDER: Harbor Peak Automation LLC",
    ].join("\n");
    const { text } = repairCanonicalPartyIdentityInCorpus(draft, records, { intakeRaw: INTAKE });
    expect(text).toContain('Red Mesa Logistics LLC ("Client")');
    expect(text).toContain('Harbor Peak Automation LLC ("Service Provider")');
    expect(text).toMatch(/Client will pay Service Provider/i);
    expect(text).toContain("CLIENT: Red Mesa Logistics LLC");
  });

  it("repairs malformed embedded signature party lines with full legal names", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE, ["Red Mesa", "Harbor Peak"])!;
    const draft = [
      "SERVICES AGREEMENT",
      "",
      "This Agreement is between Red Mesa and Harbor Peak.",
      "",
      "1. Services",
      "Red Mesa will pay Harbor Peak $5,000.",
      "",
      "IN WITNESS WHEREOF, the parties execute.",
      "",
      'Harbor Peak ("Service Provider").',
      "By: ____________________",
    ].join("\n");
    const { text } = repairCanonicalPartyIdentityInCorpus(draft, records, { intakeRaw: INTAKE });
    expect(text).toContain('Red Mesa Logistics LLC ("Client")');
    expect(text).toContain('Harbor Peak Automation LLC ("Service Provider")');
    expect(text).not.toContain('Harbor Peak ("Service Provider").');
  });

  it("strips unsupplied party address placeholders", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE)!;
    const draft =
      'This Agreement is between Red Mesa Logistics LLC, with principal place of business at [Client Address], and Harbor Peak Automation LLC, with principal place of business at [Service Provider Address].';
    const { text } = repairCanonicalPartyIdentityInCorpus(draft, records, { intakeRaw: INTAKE });
    expect(text).not.toMatch(/\[Client Address\]|\[Service Provider Address\]|principal place of business/i);
    expect(text).toContain('Red Mesa Logistics LLC ("Client")');
    expect(text).toContain('Harbor Peak Automation LLC ("Service Provider")');
  });

  it("includes optional partyAddress only when provided", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE)!;
    records[0]!.partyAddress = "100 Mesa Drive, Austin, Texas";
    const line = definedOpeningLine(records[0]!, records[1]!);
    expect(line).toContain("100 Mesa Drive, Austin, Texas");
    expect(line).not.toMatch(/\[Client Address\]|\[Service Provider Address\]/i);
  });

  it("detects simple fixed-fee intake without milestones", () => {
    expect(intakeSpecifiesSimpleFixedFee(INTAKE)).toBe(true);
    expect(
      intakeSpecifiesSimpleFixedFee(
        "MSA with $50k across milestones per Schedule A phase acceptance",
        "",
      ),
    ).toBe(false);
  });

  it("strips Schedule A milestone lines for simple fixed-fee intake", () => {
    const body = [
      "2. Fees",
      "Payments are due according to the milestone and phase acceptance triggers stated in Schedule A.",
      "- Service Provider will provide the services and deliverables described in this Agreement.",
    ].join("\n");
    const { text, repairs } = stripIrrelevantFixedFeeBoilerplate(body, INTAKE);
    expect(repairs.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/Schedule A/i);
    expect(text).not.toMatch(/will provide the services and deliverables described/i);
  });

  it("strips monthly arrears language for simple fixed-fee intake", () => {
    const body = "2. Fees\nClient shall pay $5,000.\nFees are payable monthly in arrears within thirty days.";
    const { text, repairs } = stripIrrelevantFixedFeeBoilerplate(body, INTAKE);
    expect(repairs.some((r) => r.includes("monthly_arrears"))).toBe(true);
    expect(text).not.toMatch(/monthly in arrears/i);
    expect(text).toContain("$5,000");
  });
});
