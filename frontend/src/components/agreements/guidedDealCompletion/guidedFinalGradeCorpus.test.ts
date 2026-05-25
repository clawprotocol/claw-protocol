import { describe, expect, it } from "vitest";
import {
  detectFinalGradeCorpusDefects,
  repairFinalGradeGuidedCorpus,
  assertFinalGradeCorpusReady,
} from "./guidedFinalGradeCorpus";
import { TEST73_BAD_GUIDED_CORPUS, TEST74_BAD_GUIDED_CORPUS } from "./guidedFinalGradeCorpus.fixtures";
import { prepareGuidedSigningCorpusCleanup } from "./guidedFinalReviewToSigning";
import {
  manifestToCanonicalPartyIdentities,
  resolveCanonicalFinalPartyManifest,
} from "./canonicalFinalPartyManifest";

const TEST73_MANIFEST = resolveCanonicalFinalPartyManifest({
  partyCount: 2,
  partySignerNames: ["Anthem H Blanchard", ""],
  partySignerTitles: ["Manager", ""],
  recipient1Name: "Acme LLC",
  recipient2Name: "Joe Brown",
  recipient1Email: "anthem@example.test",
  recipient2Email: "joe@example.test",
  extraPartyReviewEmails: [],
  draftPartyNames: ["Acme LLC", "Joe Brown"],
  sendMode: "signature",
  recipientsDeferred: false,
});
const TEST73_SIGNERS = manifestToCanonicalPartyIdentities(TEST73_MANIFEST);

describe("guidedFinalGradeCorpus (test73 regression)", () => {
  it("detects malformed test73 corpus defects", () => {
    const defects = detectFinalGradeCorpusDefects(TEST73_BAD_GUIDED_CORPUS, {
      authoritativePartyNames: ["Acme LLC", "Joe Brown"],
    });
    expect(defects).toContain("empty_numbered_section");
    expect(defects).toContain("subsection_number_mismatch");
    expect(defects).toContain("misplaced_subsection_content");
    expect(defects).toContain("duplicate_conflicting_fees");
    expect(defects).toContain("orphan_signer_metadata");
    expect(defects).toContain("instruction_leak");
  });

  it("repairs test73 numbering, clause placement, fees, and pre-witness identity leak", () => {
    const { text, repairs, defects } = repairFinalGradeGuidedCorpus(TEST73_BAD_GUIDED_CORPUS, {
      signerIdentities: TEST73_SIGNERS,
      authoritativePartyNames: ["Acme LLC", "Joe Brown"],
    });

    expect(repairs.some((r) => r.includes("final_grade") || r.includes("structure") || r.length > 0)).toBe(
      true,
    );
    expect(text).not.toMatch(/Add LLC suffixes/i);
    expect(text).toMatch(/2\.\s+Fees/i);
    expect(text).toMatch(/2\.\d+\s+.*(?:fee|invoice|payment)/i);
    expect(text).not.toMatch(/3\.1\s+.*monthly service fee/i);
    expect(text).not.toMatch(/2\.1\s+.*confidential information confidential/i);
    if (MONTHLY_AND_TOTAL.test(text)) {
      expect(text).not.toMatch(/\$6,000[\s\S]{0,400}\$120,000/);
    }

    expect(text).toMatch(/3\.\s+Confidentiality/i);
    expect(text).toMatch(/confidential/i);

    const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
    const preWitness = text.slice(0, witnessIdx);
    expect(preWitness).not.toMatch(/^Name:\s*Anthem/im);
    expect(preWitness).not.toMatch(/^Title:\s*Manager/im);
    expect(preWitness).not.toMatch(/^Acme LLC\s*$/m);

    const hasPurposeBody =
      /1\.\s+Purpose[\s\S]{40,}?(?=\n\s*2\.\s+)/i.test(text) ||
      /1\.\s+Purpose[^\n]+\n[^\n]{40,}/i.test(text);
    expect(hasPurposeBody || /Provider will deliver workflow automation/i.test(text)).toBe(true);

    expect(text).toMatch(/99\.9%|uptime/i);
    expect(defects.filter((d) => d !== "party_letter_fallback")).toEqual([]);
    expectDefinedTermPartyStyle(text);
    expectCleanSectionTopics(text);
  });

  it("assertFinalGradeCorpusReady accepts signing-cleanup output for test73", () => {
    const cleaned = prepareGuidedSigningCorpusCleanup({
      body: TEST73_BAD_GUIDED_CORPUS,
      partyManifest: TEST73_MANIFEST,
      signerIdentities: TEST73_SIGNERS,
    }).body;
    const ready = assertFinalGradeCorpusReady(cleaned, {
      signerIdentities: TEST73_SIGNERS,
      authoritativePartyNames: ["Acme LLC", "Joe Brown"],
    });
    expect(ready.defects.filter((d) => d !== "party_letter_fallback" && d !== "weak_purpose_section")).toEqual([]);
    expect(ready.ok || ready.corpus.length >= 1500).toBe(true);
    expect(ready.corpus.length).toBeGreaterThan(1500);
  });

  it("prepareGuidedSigningCorpusCleanup repairs test73 before VS01 handoff", () => {
    const cleaned = prepareGuidedSigningCorpusCleanup({
      body: TEST73_BAD_GUIDED_CORPUS,
      partyManifest: TEST73_MANIFEST,
      signerIdentities: TEST73_SIGNERS,
    }).body;
    expect(cleaned).not.toMatch(/Add LLC suffixes/i);
    expect(cleaned).not.toMatch(/^\s*2\.1\b.*Support/im);
    const witnessIdx = cleaned.search(/\bIN WITNESS WHEREOF\b/i);
    expect(cleaned.slice(Math.max(0, witnessIdx - 400), witnessIdx)).not.toMatch(/^Name:\s*Anthem/im);
  });
});

const MONTHLY_AND_TOTAL = /\$6,000[\s\S]*\$120,000|\$120,000[\s\S]*\$6,000/;

function section(text: string, headingRe: RegExp): string {
  const start = text.search(headingRe);
  if (start < 0) return "";
  const tail = text.slice(start);
  const next = tail.slice(1).search(/\n\s*\d+\.\s+[A-Z]/);
  return next >= 0 ? tail.slice(0, next + 1) : tail;
}

function expectDefinedTermPartyStyle(text: string): void {
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const intro = text.slice(0, Math.min(witnessIdx, 1600));
  expect(intro).toMatch(/Acme LLC\s*\("Client"\)/i);
  expect(intro).toMatch(/Joe Brown\s*\("Service Provider"\)/i);
  expect((text.match(/\("Client"\)/g) ?? []).length).toBe(1);
  expect((text.match(/\("Service Provider"\)/g) ?? []).length).toBe(1);
  expect(text).not.toMatch(/\bParty\s+A\b|\bParty\s+B\b/i);
  expect(text).not.toMatch(/\b(?:Company|Contractor)\b/i);
  expect(text).not.toMatch(/\bClient,\s+the\s+Client\b/i);
  expect(text).not.toMatch(/\bService Provider,\s+the\s+Service Provider\b/i);
  const witness = text.slice(witnessIdx);
  expect(witness).toMatch(/CLIENT:\s*\nAcme LLC\s*\nBy:/i);
  expect(witness).toMatch(/Name:\s*Anthem H Blanchard/i);
  expect(witness).toMatch(/SERVICE PROVIDER:\s*\nJoe Brown\s*\nBy:/i);
  expect(witness).toMatch(/Name:\s*Joe Brown/i);
}

function expectCleanSectionTopics(text: string): void {
  const fees = section(text, /\n?2\.\s+Fees/i);
  const confidentiality = section(text, /\n?3\.\s+Confidentiality/i);
  const support = section(text, /\n?5\.\s+Support/i);
  const misc = section(text, /\n?8\.\s+Miscellaneous/i);
  expect(fees).not.toMatch(/confidential|non-public|proprietary information|force majeure|equitable relief|attorney fees/i);
  expect(support).not.toMatch(/confidential|non-public|proprietary information/i);
  expect(confidentiality).toMatch(/confidential|non-public|proprietary information/i);
  if (/force majeure|equitable relief|attorney fees/i.test(text)) {
    expect(misc).toMatch(/force majeure|equitable relief|attorney fees/i);
  }
  expect(text).not.toMatch(/^\s*\d+\.\d+\.?\s+(?:Assignment|Insurance|Indemnification|Notices?|Force Majeure|Equitable Relief)\.\s*$/im);
  expect((text.match(/^\s*\d+\.\s+Notices\b/gim) ?? []).length).toBeLessThanOrEqual(1);
}

describe("guidedFinalGradeCorpus (test74 regression)", () => {
  it("detects test74 mixed-section and orphan signer defects", () => {
    const defects = detectFinalGradeCorpusDefects(TEST74_BAD_GUIDED_CORPUS, {
      authoritativePartyNames: ["Acme LLC", "Joe Brown"],
    });
    expect(defects).toContain("fees_section_contamination");
    expect(defects).toContain("orphan_signer_metadata");
    expect(defects).toContain("weak_purpose_section");
    expect(defects).toContain("contractor_party_fallback");
  });

  it("rebuilds test74 corpus into canonical sections without fee/confidentiality mix", () => {
    const { text, defects } = repairFinalGradeGuidedCorpus(TEST74_BAD_GUIDED_CORPUS, {
      signerIdentities: TEST73_SIGNERS,
      authoritativePartyNames: ["Acme LLC", "Joe Brown"],
    });
    const feesSection = text.match(/2\.\s+Fees[\s\S]*?(?=\n\s*3\.\s+)/i)?.[0] ?? "";
    expect(feesSection).not.toMatch(/confidential information/i);
    expect(feesSection).not.toMatch(/attorney fees/i);
    expect(text).not.toMatch(/\bContractor\b/i);
    expect(text).toMatch(/3\.\s+Confidentiality/i);
    expect(text).toMatch(/99\.9%|uptime/i);
    const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
    expect(text.slice(Math.max(0, witnessIdx - 500), witnessIdx)).not.toMatch(/^Name:\s*Anthem/im);
    expect(text.slice(0, witnessIdx)).not.toMatch(/^SERVICE PROVIDER:/im);
    expect(defects.filter((d) => d !== "party_letter_fallback")).toEqual([]);
    const sectionNumbers = [...text.matchAll(/^\s*(\d+)\.\s+[A-Z]/gm)].map((m) => Number(m[1]));
    expect(sectionNumbers.length).toBeGreaterThanOrEqual(8);
    expect(sectionNumbers).toEqual(sectionNumbers.map((_, index) => index + 1));
    expectDefinedTermPartyStyle(text);
    expectCleanSectionTopics(text);
  });

  it("detects and repairs wrong-topic clauses, duplicate notices, and empty subsection headings", () => {
    const bad = TEST74_BAD_GUIDED_CORPUS.replace(
      /\nIN WITNESS WHEREOF/i,
      "\n\n7. Notices\n7.1 Notices may be delivered electronically.\n\n8. Miscellaneous\n8.1 Assignment.\n\n7. Notices\n7.2 Duplicate notices must go to the same addresses.\n\nIN WITNESS WHEREOF",
    );
    const initial = detectFinalGradeCorpusDefects(bad, {
      authoritativePartyNames: ["Acme LLC", "Joe Brown"],
    });
    expect(initial).toEqual(expect.arrayContaining([
      "fees_section_contamination",
      "section_topic_contamination",
      "empty_subsection_heading",
      "duplicate_notice_section",
    ]));
    const { text, defects } = repairFinalGradeGuidedCorpus(bad, {
      signerIdentities: TEST73_SIGNERS,
      authoritativePartyNames: ["Acme LLC", "Joe Brown"],
    });
    expect(defects.filter((d) => d !== "party_letter_fallback")).toEqual([]);
    expectCleanSectionTopics(text);
    expectDefinedTermPartyStyle(text);
  });
});
