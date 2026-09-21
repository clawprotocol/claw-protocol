import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalPartyIdentitiesFromRecords,
  definedOpeningLine,
  intakeHasFullLegalEntityParties,
  intakeSpecifiesSimpleFixedFee,
  locateDefinedOpeningRecitalBoundary,
  repairCanonicalPartyIdentityInCorpus,
  repairFullAgreementPartyIdentity,
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

  it("maps generic draft party roles to Client / Service Provider in manifest", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(
      INTAKE,
      ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      ["party", "party"],
    );
    expect(records[0]?.roleLabel).toBe("Client");
    expect(records[1]?.roleLabel).toBe("Service Provider");
    const line = definedOpeningLine(records[0]!, records[1]!);
    expect(line).not.toMatch(/\("party"\)/i);
    expect(line).toContain('("Client")');
    expect(line).toContain('("Service Provider")');
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

  it("does not swallow an approved notices sentence into the defined opening", () => {
    const oak = "Oak Street Holdings LLC";
    const pine = "Pine Creek Manufacturing Inc.";
    const draft = [
      `This Agreement is between ${oak} ("Client") and ${pine} ("Supplier").`,
      "Send notices to legal@new-company.com within five days.",
    ].join("\n");
    const { text } = repairFullAgreementPartyIdentity({
      text: draft,
      intakeRaw: `Delaware supply agreement between ${oak} and ${pine}.\nlegal@old-company.com`,
      partyNames: [oak, pine],
    });
    expect(text).toContain("Send notices to legal@new-company.com within five days.");
    expect(text).not.toContain("legal@old-company.com");
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

  it("does not replace short forms that appear in other party names (Harbor defect)", () => {
    const intake = "Services agreement between Red Mesa Logistics LLC and Mesa Consulting Inc for pool services.";
    const records = resolveCanonicalPartyIdentitiesFromIntake(intake);
    expect(records).toHaveLength(2);
    expect(records[0]?.fullLegalName).toBe("Red Mesa Logistics LLC");
    expect(records[1]?.fullLegalName).toBe("Mesa Consulting Inc");
    const body = "Red Mesa Logistics LLC will work with Mesa Consulting Inc on the project.";
    const { text } = replaceTruncatedPartyRefsWithRoleLabels(body, records);
    expect(text).not.toMatch(/Red Service Provider Logistics/i);
    expect(text).not.toMatch(/Service Provider Logistics/i);
    expect(text).toContain("Red Mesa Logistics");
  });
});

describe("hirer versus hired company preamble slots", () => {
  const dump = "Jordan Hale hiring Pine Street Media LLC to run ads for The Daily Grind";

  it("canonical records are Jordan Hale Client vs Pine Street Media LLC Service Provider", () => {
    const records = resolveCanonicalPartyIdentitiesFromSources({ rawIntake: dump });
    expect(records).toHaveLength(2);
    expect(records[0]?.fullLegalName).toBe("Jordan Hale");
    expect(records[0]?.roleLabel).toMatch(/client/i);
    expect(records[1]?.fullLegalName).toBe("Pine Street Media LLC");
    expect(records[1]?.roleLabel).toMatch(/service provider/i);
    expect(records.filter((r) => /pine street/i.test(r.fullLegalName))).toHaveLength(1);
  });

  it("rewrites a company-vs-company painted preamble to hirer vs company", () => {
    const painted = [
      "SERVICES AGREEMENT",
      "",
      'This Services Agreement (the "Agreement") is entered into by and between Pine Street Media LLC ("Client") and Pine Street Media ("Service Provider").',
      "",
      "1. Scope. Pine Street Media will run ads for The Daily Grind.",
    ].join("\n");
    const { text } = repairFullAgreementPartyIdentity({
      text: painted,
      intakeRaw: dump,
    });
    const opening = definedOpeningLine(
      resolveCanonicalPartyIdentitiesFromSources({ rawIntake: dump })[0]!,
      resolveCanonicalPartyIdentitiesFromSources({ rawIntake: dump })[1]!,
    );
    expect(text).toContain("Jordan Hale");
    expect(text).toMatch(/Pine Street Media LLC/);
    expect(text).not.toMatch(/Pine Street Media LLC\s*\(["“']Client["”']\)\s+and\s+Pine Street Media\s*\(["“']Service Provider["”']\)/);
    expect(opening).toMatch(/Jordan Hale/);
    expect(opening).toMatch(/Pine Street Media LLC/);
    expect(opening).not.toMatch(/Pine Street Media LLC[\s\S]+Pine Street Media \(/);
  });
});

const OAK = "Oak Street Holdings LLC";
const PINE = "Pine Creek Manufacturing Inc.";
const OAK_PINE_OPENING = `This Agreement is between ${OAK} ("Client") and ${PINE} ("Supplier").`;
const OAK_PINE_INTAKE = `Delaware supply agreement between ${OAK} and ${PINE}.`;
const OPERATIVE_CLAUSES = [
  "Client shall pay $5,000 upon delivery.",
  "Supplier shall ship conforming goods FOB Wilmington.",
  "All deliverables remain owned by Client.",
  "Either party may terminate on thirty days written notice.",
] as const;

describe("defined-opening recital boundary", () => {
  function assertClauseOnce(text: string, clause: string) {
    expect(text).toContain(clause);
    expect(text.split(clause).length - 1).toBe(1);
  }

  it("bounds the Oak/Pine opening before a following operative sentence", () => {
    const clause = OPERATIVE_CLAUSES[0];
    const head = `${OAK_PINE_OPENING}\n${clause}`;
    const span = locateDefinedOpeningRecitalBoundary(head);
    expect(span).not.toBeNull();
    expect(head.slice(span!.start, span!.end)).toBe(OAK_PINE_OPENING);
    expect(head.slice(span!.end)).toContain(clause);
  });

  it.each([...OPERATIVE_CLAUSES])(
    "repairFullAgreementPartyIdentity keeps %s after a single newline",
    (clause) => {
      const draft = `${OAK_PINE_OPENING}\n${clause}`;
      const { text } = repairFullAgreementPartyIdentity({
        text: draft,
        intakeRaw: OAK_PINE_INTAKE,
        partyNames: [OAK, PINE],
      });
      assertClauseOnce(text, clause);
    },
  );

  it("preserves the same obligation in same-paragraph, single-newline, and blank-line layouts", () => {
    const clause = OPERATIVE_CLAUSES[1];
    const layouts = [
      `${OAK_PINE_OPENING} ${clause}`,
      `${OAK_PINE_OPENING}\n${clause}`,
      `${OAK_PINE_OPENING}\n\n${clause}`,
    ];
    for (const draft of layouts) {
      const { text } = repairFullAgreementPartyIdentity({
        text: draft,
        intakeRaw: OAK_PINE_INTAKE,
        partyNames: [OAK, PINE],
      });
      assertClauseOnce(text, clause);
    }
  });

  it("keeps the first operative clause and later numbered sections in a longer agreement", () => {
    const clause = OPERATIVE_CLAUSES[2];
    const draft = [
      OAK_PINE_OPENING,
      clause,
      "",
      "1. Scope",
      "Manufacturing will occur in Delaware under U.S. law.",
      "",
      "2. Fees",
      "Invoices are due net thirty days.",
    ].join("\n");
    const { text } = repairFullAgreementPartyIdentity({
      text: draft,
      intakeRaw: OAK_PINE_INTAKE,
      partyNames: [OAK, PINE],
    });
    assertClauseOnce(text, clause);
    expect(text).toContain("1. Scope");
    expect(text).toContain("Manufacturing will occur in Delaware under U.S. law.");
    expect(text).toContain("2. Fees");
    expect(text).toContain("Invoices are due net thirty days.");
  });

  it("keeps abbreviations, roles, addresses, dates, and collective definitions in a wrapped recital", () => {
    const recital = [
      `This Agreement is between ${OAK}, a Delaware limited liability company ("Client"), with a principal place of business at 1 Oak Street, Wilmington, DE 19801, dated March 3, 2026,`,
      `and ${PINE}, a Delaware corporation ("Supplier"), with a principal place of business at 9 Pine Creek Rd, Wilmington, DE 19802`,
      `(each a "Party" and collectively the "Parties").`,
    ].join("\n");
    const span = locateDefinedOpeningRecitalBoundary(recital);
    expect(span).not.toBeNull();
    const bounded = recital.slice(span!.start, span!.end);
    expect(bounded).toContain("Inc.");
    expect(bounded).toContain('("Client")');
    expect(bounded).toContain('("Supplier")');
    expect(bounded).toContain("1 Oak Street, Wilmington, DE 19801");
    expect(bounded).toContain("March 3, 2026");
    expect(bounded).toContain('collectively the "Parties"');
    const { text, repairs } = repairFullAgreementPartyIdentity({
      text: recital,
      intakeRaw: OAK_PINE_INTAKE,
      partyNames: [OAK, PINE],
    });
    expect(repairs).not.toContain("party_identity:defined_opening");
    expect(text).toMatch(/Inc\.?/);
    expect(text).toContain('("Client")');
    expect(text).toContain('("Supplier")');
    expect(text).toContain("March 3, 2026");
    expect(text).toContain('collectively the "Parties"');
    expect(text).toContain("Wilmington, DE 19801");
    expect(text).toContain("Wilmington, DE 19802");
  });

  it("does not rewrite three- or four-party recitals via defined opening replacement", () => {
    const three = [
      'This Agreement is among Stonebridge Wellness LLC ("Licensor"), NovaPath Learning Inc. ("Platform"), and ClearSpring Distribution LLC ("Distributor").',
      OPERATIVE_CLAUSES[0],
    ].join("\n");
    const four = [
      'This Agreement is among Ironclad Systems Group LLC ("Sponsor"), Harborline Data Solutions Inc. ("Vendor"), Northwind Automation Partners LLC ("Integrator"), and Silver Mesa Analytics LP ("Analyst").',
      OPERATIVE_CLAUSES[3],
    ].join("\n");
    const threeOut = repairFullAgreementPartyIdentity({
      text: three,
      intakeRaw:
        "Oklahoma license among Stonebridge Wellness LLC, NovaPath Learning Inc., and ClearSpring Distribution LLC.",
      partyNames: [
        "Stonebridge Wellness LLC",
        "NovaPath Learning Inc.",
        "ClearSpring Distribution LLC",
      ],
    });
    expect(threeOut.repairs).not.toContain("party_identity:defined_opening");
    expect(threeOut.text).toContain("Stonebridge Wellness LLC");
    expect(threeOut.text).toContain("NovaPath Learning Inc.");
    expect(threeOut.text).toContain("ClearSpring Distribution LLC");
    expect(threeOut.text).not.toMatch(/This Agreement is between /i);
    assertClauseOnce(threeOut.text, OPERATIVE_CLAUSES[0]);

    const fourOut = repairFullAgreementPartyIdentity({
      text: four,
      intakeRaw:
        "Joint rollout among Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, and Silver Mesa Analytics LP.",
      partyNames: [
        "Ironclad Systems Group LLC",
        "Harborline Data Solutions Inc.",
        "Northwind Automation Partners LLC",
        "Silver Mesa Analytics LP",
      ],
    });
    expect(fourOut.repairs).not.toContain("party_identity:defined_opening");
    expect(fourOut.text).toContain("Ironclad Systems Group LLC");
    expect(fourOut.text).toContain("Harborline Data Solutions Inc.");
    expect(fourOut.text).toContain("Northwind Automation Partners LLC");
    expect(fourOut.text).toContain("Silver Mesa Analytics LP");
    expect(fourOut.text).not.toMatch(/This Agreement is between /i);
    assertClauseOnce(fourOut.text, OPERATIVE_CLAUSES[3]);
  });
});

describe("party short-form contact preservation", () => {
  const oak = "Oak Street Holdings LLC";
  const pine = "Pine Creek Manufacturing Inc.";
  const oakAddr = "1 Oak Street, Wilmington, DE 19801";
  const pineAddr = "9 Pine Creek Rd, Wilmington, DE 19802";
  const wrapped = [
    `This Agreement is between ${oak}, a Delaware limited liability company ("Client"), with a principal place of business at ${oakAddr},`,
    `and ${pine}, a Delaware corporation ("Supplier"), with a principal place of business at ${pineAddr}`,
    `(each a "Party" and collectively the "Parties").`,
    "Client representative: Avery Oak.",
    "Supplier representative: Casey Pine.",
    "Oak Street shall provide access credentials.",
  ].join("\n");
  const intake = `Delaware supply agreement between ${oak} and ${pine}.`;

  function expectContacts(text: string) {
    expect(text).toContain("Client representative: Avery Oak.");
    expect(text).not.toContain("Avery Oak Street");
    expect(text).toContain("Supplier representative: Casey Pine.");
    expect(text).not.toContain("Casey Pine Creek");
    expect(text).toContain(oakAddr);
    expect(text.split(oakAddr).length - 1).toBe(1);
    expect(text).not.toContain("1 Client");
    expect(text).toContain(pineAddr);
    expect(text.split(pineAddr).length - 1).toBe(1);
    expect(text).not.toContain("9 Service Provider");
  }

  it("replaceTruncatedPartyRefsWithRoleLabels does not rewrite streets or surnames", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(intake, [oak, pine])!;
    const { text } = replaceTruncatedPartyRefsWithRoleLabels(wrapped, records);
    expectContacts(text);
    expect(text).toMatch(/Client shall provide access credentials/);
    expect(text).not.toMatch(/^Oak Street shall provide access credentials\./m);
  });

  it("repairFullAgreementPartyIdentity keeps the same contact lines", () => {
    const { text } = repairFullAgreementPartyIdentity({
      text: wrapped,
      intakeRaw: intake,
      partyNames: [oak, pine],
    });
    expectContacts(text);
    expect(text).toMatch(/Client shall provide access credentials/);
  });

  it("retains three- and four-party overlapping contact details", () => {
    const threeBody = [
      'This Agreement is among Stonebridge Wellness LLC ("Licensor"), NovaPath Learning Inc. ("Platform"), and ClearSpring Distribution LLC ("Distributor").',
      "Licensor address: 10 Stonebridge Way, Tulsa, OK 74103.",
      "Licensor representative: Jordan Stonebridge.",
      "Platform address: 22 NovaPath Ave, Norman, OK 73072.",
      "Platform representative: Sam NovaPath.",
    ].join("\n");
    const three = repairFullAgreementPartyIdentity({
      text: threeBody,
      intakeRaw:
        "Oklahoma license among Stonebridge Wellness LLC, NovaPath Learning Inc., and ClearSpring Distribution LLC.",
      partyNames: [
        "Stonebridge Wellness LLC",
        "NovaPath Learning Inc.",
        "ClearSpring Distribution LLC",
      ],
    });
    expect(three.text).toContain("Licensor address: 10 Stonebridge Way, Tulsa, OK 74103.");
    expect(three.text).toContain("Licensor representative: Jordan Stonebridge.");
    expect(three.text).not.toContain("Jordan Stonebridge Wellness");
    expect(three.text).toContain("Platform address: 22 NovaPath Ave, Norman, OK 73072.");
    expect(three.text).toContain("Platform representative: Sam NovaPath.");
    expect(three.text).not.toContain("Sam NovaPath Learning");

    const fourBody = [
      "This Agreement is among Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, and Silver Mesa Analytics LP.",
      "Sponsor representative: Pat Ironclad.",
      "Sponsor address: 3 Ironclad Way, Austin, TX 78701.",
    ].join("\n");
    const four = repairFullAgreementPartyIdentity({
      text: fourBody,
      intakeRaw:
        "Joint rollout among Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, and Silver Mesa Analytics LP.",
      partyNames: [
        "Ironclad Systems Group LLC",
        "Harborline Data Solutions Inc.",
        "Northwind Automation Partners LLC",
        "Silver Mesa Analytics LP",
      ],
    });
    expect(four.text).toContain("Sponsor representative: Pat Ironclad.");
    expect(four.text).not.toContain("Pat Ironclad Systems");
    expect(four.text).toContain("Sponsor address: 3 Ironclad Way, Austin, TX 78701.");
  });
});
