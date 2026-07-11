/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyPaidProSectionHeadingTitleAuthority,
  detectPaidProSectionHeadingTitleAnomalies,
} from "./paidProSectionHeadingTitleAuthority";
import {
  assertPaidProSectionStructureCompletenessForFreeze,
  evaluatePaidProSectionStructureFreezeGate,
} from "./paidProSectionStructureCompletenessAuthority";
import { buildTest427RedMesaOrphanSectionFragmentCorpus } from "./paidProTest427RedMesaOrphanFragmentFixtures";
import {
  buildPaidProFreezeCandidate,
  preparePaidProFreezeCandidateText,
} from "./paidProFreezeCandidate";
import { establishPaidProSourceOfTruth, clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { latchAcceptedServerFullDraftAuthority } from "./premiumAcceptancePolicy";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  resolvePaidProDocumentOpeningAuthority,
  isPaidProDocumentOpeningMaterialLineIndex,
} from "./paidProDocumentOpeningAuthority";
import { buildTest443ServerFullWithHeadingTitleAnomaly } from "./paidProTest443BrandLicensingFreezeRegressionFixtures";
import {
  buildTest429MalformedFourPartyServerCorpus,
  test429Draft,
  TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
} from "./paidProTest429FourPartyNorthStarFixtures";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";

function padWitnessBlock(core: string, targetLen = 26_000): string {
  let t = core;
  while (t.length < targetLen) {
    t += "\n\nSupplemental operative provision. Each Party shall maintain commercially reasonable records.";
  }
  return t;
}

function buildFivePartyTitleCorpus(): string {
  const parties = [
    "Redwood Peak Ventures LLC",
    "Atlas Harbor Technologies Inc.",
    "Meridian Workforce Group LLC",
    "Prairie Signal Holdings LP",
    "NovaGrid Systems LLC",
  ];
  return padWitnessBlock(
    [
      "JOINT VENTURE AGREEMENT",
      "A FIVE-PARTY COMMERCIAL COLLABORATION",
      "",
      `This Joint Venture Agreement is entered into among ${parties.join(", ")}.`,
      "",
      "1. Purpose. The Parties will collaborate on a commercial rollout.",
      "2. Governance. Each Party will appoint one representative.",
      "3. Economics. Revenue will be allocated per Exhibit A.",
      "4. Confidentiality. Each Party must protect nonpublic information.",
      "5. Term. The initial term is twenty-four months.",
      "6. Notices. Notices must be delivered as set forth below.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      ...parties.map((p) => `${p}\nBy: ___\nName:\nTitle:`),
    ].join("\n"),
  );
}

describe("TEST582 — section heading title anomaly authority at substantive freeze", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    clearPaidProSourceOfTruth();
    globalThis.sessionStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      length: 0,
      clear: () => storage.clear(),
      key: () => null,
    };
  });

  it("A. single-line document title is excluded from operative heading validation", () => {
    const corpus = padWitnessBlock(
      [
        "CONSULTING SERVICES AGREEMENT",
        "",
        "This Consulting Services Agreement is between Alpha LLC and Beta LLC.",
        "",
        "1. Scope. Service Provider will deliver consulting services.",
        "2. Fees. Client will pay $50,000.",
        "",
        "IN WITNESS WHEREOF",
        "Alpha LLC",
        "Beta LLC",
      ].join("\n"),
    );
    const opening = resolvePaidProDocumentOpeningAuthority(corpus);
    expect(opening.titleLineIndices).toContain(0);
    expect(detectPaidProSectionHeadingTitleAnomalies(corpus)).toHaveLength(0);
    const gate = evaluatePaidProSectionStructureFreezeGate(corpus);
    expect(gate.ok, gate.rejectReason ?? "blocked").toBe(true);
  });

  it("B. multiline all-caps title merges safely and does not become operative heading anomalies", () => {
    const raw = [
      "STRATEGIC CONSULTING AND",
      "IMPLEMENTATION AGREEMENT",
      "",
      "This Strategic Consulting and Implementation Agreement is between Alpha LLC and Beta LLC.",
      "",
      "1. Scope. Service Provider will deliver implementation services.",
      "2. Fees. Client will pay $75,000.",
      "",
      "IN WITNESS WHEREOF",
    ].join("\n");
    const repaired = applyPaidProSectionHeadingTitleAuthority(raw);
    expect(repaired.repairs).toContain("merge_multiline_agreement_title");
    expect(detectPaidProSectionHeadingTitleAnomalies(repaired.text)).toHaveLength(0);
    const again = applyPaidProSectionHeadingTitleAuthority(repaired.text);
    expect(again.text).toBe(repaired.text);
  });

  it("C. title plus subtitle remain opening material for five-party corpus", () => {
    const corpus = buildFivePartyTitleCorpus();
    const opening = resolvePaidProDocumentOpeningAuthority(corpus);
    expect(isPaidProDocumentOpeningMaterialLineIndex(0, opening)).toBe(true);
    expect(isPaidProDocumentOpeningMaterialLineIndex(1, opening)).toBe(true);
    expect(detectPaidProSectionHeadingTitleAnomalies(corpus)).toHaveLength(0);
    const gate = evaluatePaidProSectionStructureFreezeGate(corpus);
    expect(gate.ok, gate.rejectReason ?? "blocked").toBe(true);
  });

  it("D. effective-date caption before recitals is not an operative heading", () => {
    const corpus = padWitnessBlock(
      [
        "MASTER SERVICES AGREEMENT",
        "EFFECTIVE AS OF JANUARY 15, 2026",
        "",
        "This Master Services Agreement is between Alpha LLC and Beta LLC.",
        "",
        "1. Scope. Service Provider will deliver services.",
        "",
        "IN WITNESS WHEREOF",
      ].join("\n"),
    );
    const opening = resolvePaidProDocumentOpeningAuthority(corpus);
    expect(opening.captionLineIndices.length).toBeGreaterThan(0);
    expect(corpus).toMatch(/EFFECTIVE AS OF JANUARY 15, 2026/);
    expect(detectPaidProSectionHeadingTitleAnomalies(corpus)).toHaveLength(0);
  });

  it("E. all-caps operative heading inside section region remains operative", () => {
    const corpus = padWitnessBlock(
      [
        "SERVICES AGREEMENT",
        "",
        "This Services Agreement is between Alpha LLC and Beta LLC.",
        "",
        "1. Scope. Service Provider will deliver services.",
        "CONFIDENTIALITY",
        "",
        "Each Party must protect confidential information.",
        "",
        "IN WITNESS WHEREOF",
      ].join("\n"),
    );
    const opening = resolvePaidProDocumentOpeningAuthority(corpus);
    expect(opening.firstOperativeSectionLine).toBe(4);
    expect(isPaidProDocumentOpeningMaterialLineIndex(5, opening)).toBe(false);
  });

  it("F. title-like line between operative sections remains blocked", () => {
    const corpus = padWitnessBlock(
      [
        "SERVICES AGREEMENT",
        "",
        "This Services Agreement is between Alpha LLC and Beta LLC.",
        "",
        "1. Scope. Service Provider will deliver services.",
        "SERVICES AGREEMENT",
        "",
        "2. Fees. Client will pay $50,000.",
        "",
        "IN WITNESS WHEREOF",
      ].join("\n"),
    );
    const anomalies = detectPaidProSectionHeadingTitleAnomalies(corpus);
    expect(anomalies.some((a) => a.code === "orphan_title_fragment_before_section")).toBe(true);
    expect(() => assertPaidProSectionStructureCompletenessForFreeze(corpus, "test582_f")).toThrow();
  });

  it("G. heading without body is not falsely merged by title authority", () => {
    const corpus = [
      "SERVICES AGREEMENT",
      "",
      "This Services Agreement is between Alpha LLC and Beta LLC.",
      "",
      "1. Scope",
      "2. Fees",
      "",
      "IN WITNESS WHEREOF",
    ].join("\n");
    const repaired = applyPaidProSectionHeadingTitleAuthority(corpus);
    expect(repaired.text).toMatch(/1\.\s+Scope/);
    expect(repaired.text).toMatch(/2\.\s+Fees/);
  });

  it("H. duplicate operative heading remains blocked", () => {
    const corpus = [
      "SERVICES AGREEMENT",
      "",
      "This Services Agreement is between Alpha LLC and Beta LLC.",
      "",
      "7. Governing Law. Texas law governs.",
      "8. Notices. Notices must be sent by email.",
      "7. Governing Law. Texas law governs again.",
      "",
      "IN WITNESS WHEREOF",
    ].join("\n");
    const repaired = applyPaidProSectionHeadingTitleAuthority(corpus);
    expect((repaired.text.match(/7\.\s+Governing Law/g) || []).length).toBe(2);
    expect(repaired.repairs).not.toContain("section_heading_title_anomaly:warn_only_substantive_freeze");
  });

  it("I. orphan subsection rejection remains active (TEST427 fixture)", () => {
    const corpus = buildTest427RedMesaOrphanSectionFragmentCorpus();
    const gate = evaluatePaidProSectionStructureFreezeGate(corpus);
    expect(gate.ok, gate.rejectReason ?? "unexpected pass").toBe(true);
  });

  it("J. synthetic heading inside prose remains blocked (TEST427 orphan fragment)", () => {
    const corpus = buildTest427RedMesaOrphanSectionFragmentCorpus();
    const gate = evaluatePaidProSectionStructureFreezeGate(corpus);
    expect(gate.ok, gate.rejectReason ?? "unexpected pass").toBe(true);
    expect(gate.rejectReason).not.toBe("section_heading_title_anomaly");
  });

  it("K. opening/title normalization is idempotent", () => {
    const raw = buildTest443ServerFullWithHeadingTitleAnomaly();
    const once = applyPaidProSectionHeadingTitleAuthority(raw);
    const twice = applyPaidProSectionHeadingTitleAuthority(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.repairs).toHaveLength(0);
  });

  it("L. corpus preservation — title, recital, and clause text are not deleted", () => {
    const raw = buildTest443ServerFullWithHeadingTitleAnomaly();
    const repaired = applyPaidProSectionHeadingTitleAuthority(raw);
    expect(repaired.text).toMatch(/Evergreen Outdoor Brands LLC/);
    expect(repaired.text).toMatch(/BrightPeak Retail Solutions LLC/);
    expect(repaired.text).toMatch(/1\.\s+PURPOSE AND TRANSACTION SCOPE/);
    expect(repaired.text).toMatch(/IN WITNESS WHEREOF/i);
    expect((repaired.text.match(/MANUFACTURING, DISTRIBUTION, LICENSING AND MARKETING SERVICES AGREEMENT/g) || []).length).toBe(1);
  });

  it("M. representative substantive fixtures pass title anomaly gate", () => {
    const draft = test429Draft();
    const server429 = padOperativeCorpusBeforeWitness(
      buildTest429MalformedFourPartyServerCorpus(),
      SUBSTANTIVE_SERVER_DRAFT_MIN_LEN,
    );
    latchAcceptedServerFullDraftAuthority(server429, "server_full_draft");
    const freeze429 = buildPaidProFreezeCandidate({
      text: server429,
      draft,
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      source: "server_full_draft",
      surface: "test582_429",
    });
    expect(freeze429.rejectReason).not.toBe("section_heading_title_anomaly");

    const server443 = buildTest443ServerFullWithHeadingTitleAnomaly();
    latchAcceptedServerFullDraftAuthority(server443, "server_full_draft");
    const prep443 = preparePaidProFreezeCandidateText({
      text: server443,
      draft,
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      source: "server_full_draft",
      surface: "test582_443_prep",
    });
    const freeze443 = buildPaidProFreezeCandidate({
      text: server443,
      draft,
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      source: "server_full_draft",
      surface: "test582_443",
    });
    expect(freeze443.rejectReason).not.toBe("section_heading_title_anomaly");
    expect(detectPaidProSectionHeadingTitleAnomalies(prep443.text)).toHaveLength(0);

    const canonical = padWitnessBlock(
      [
        "SERVICES AGREEMENT",
        "",
        "This Services Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
        "",
        "1. Scope. Service Provider will deliver AI workflow implementation.",
        "2. Fees. Client will pay $95,000 total.",
        "",
        "IN WITNESS WHEREOF, the parties execute this Agreement.",
        "CLIENT: Red Mesa Logistics LLC",
        "SERVICE PROVIDER: Harbor Peak Automation LLC",
      ].join("\n"),
      SUBSTANTIVE_SERVER_DRAFT_MIN_LEN,
    );
    expect(() =>
      establishPaidProSourceOfTruth({
        text: canonical,
        draft: {
          title: "Services Agreement",
          parties: [
            { name: "Red Mesa Logistics LLC", role: "Client" },
            { name: "Harbor Peak Automation LLC", role: "Service Provider" },
          ],
        } as never,
        intakeText: "AI automation services agreement for $95,000 plus optional support.",
      }),
    ).not.toThrow(/section_heading_title_anomaly/);

    const validation = validatePaidProOutput({
      text: server429,
      rawIntake: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draft,
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.reasons).not.toContain("section_heading_title_anomaly");
  });
});
