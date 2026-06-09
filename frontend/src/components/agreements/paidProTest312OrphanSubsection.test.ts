import { afterEach, describe, expect, it } from "vitest";
import {
  detectPaidProOrphanSubsections,
  normalizePaidProOrphanSubsections,
  resetPaidProOrphanSubsectionNormalizerLogsForTests,
} from "./normalizePaidProOrphanSubsections";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";

function buildCorpusWithOrphanSections(): string {
  const pad = "Operative clause text for commercial substance. ".repeat(60);
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "This Agreement is between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
    "6. Limitation of Liability",
    "6.1 Neither party shall be liable for indirect damages.",
    "6.2 Direct damages are capped as stated herein.",
    "7. Governing Law",
    "7.1 This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to conflict of law principles.",
    "8. Notices",
    "8.1 Notices shall be sent to the addresses on file.",
    "9. Miscellaneous",
    "9.1 Entire agreement.",
    "9.2 Severability.",
    "9.3 Counterparts.",
    pad,
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    "Blue Canyon Analytics LLC",
    "By: __________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "SERVICE PROVIDER:",
    "Iron Vale Systems Inc.",
    "By: __________________________",
    "Name: Michael Torres",
    "Title: President",
  ].join("\n\n");
}

describe("TEST312 orphan subsection architecture", () => {
  afterEach(() => {
    resetPaidProOrphanSubsectionNormalizerLogsForTests();
    clearPaidProSourceOfTruth();
  });

  it("Case A: lone 7.1 is detected and repaired", () => {
    const input = ["7. Governing Law", "7.1 This Agreement shall be governed by Delaware law."].join("\n\n");
    expect(detectPaidProOrphanSubsections(input).sectionNumbers).toEqual([7]);
    const result = normalizePaidProOrphanSubsections(input, { source: "test312" });
    expect(result.orphanSectionsRepaired).toBe(1);
    expect(result.text).toContain("This Agreement shall be governed by Delaware law.");
    expect(result.text).not.toMatch(/^7\.1\s/m);
  });

  it("Case B: lone 8.1 is detected and repaired", () => {
    const input = ["8. Notices", "8.1 Notices shall be sent to the addresses on file."].join("\n\n");
    expect(detectPaidProOrphanSubsections(input).sectionNumbers).toEqual([8]);
    const result = normalizePaidProOrphanSubsections(input, { source: "test312" });
    expect(result.orphanSectionsRepaired).toBe(1);
    expect(result.text).toContain("Notices shall be sent to the addresses on file.");
    expect(result.text).not.toMatch(/^8\.1\s/m);
  });

  it("Case C: 6.1 + 6.2 is preserved", () => {
    const input = [
      "6. Limitation of Liability",
      "6.1 Neither party shall be liable for indirect damages.",
      "6.2 Direct damages are capped as stated herein.",
    ].join("\n\n");
    expect(detectPaidProOrphanSubsections(input).orphanSectionsFound).toBe(0);
    const result = normalizePaidProOrphanSubsections(input, { source: "test312" });
    expect(result.orphanSectionsRepaired).toBe(0);
    expect(result.text).toMatch(/^6\.1\s/m);
    expect(result.text).toMatch(/^6\.2\s/m);
  });

  it("Case D: 9.1 + 9.2 + 9.3 is preserved", () => {
    const input = [
      "9. Miscellaneous",
      "9.1 Entire agreement.",
      "9.2 Severability.",
      "9.3 Counterparts.",
    ].join("\n\n");
    expect(detectPaidProOrphanSubsections(input).orphanSectionsFound).toBe(0);
    const result = normalizePaidProOrphanSubsections(input, { source: "test312" });
    expect(result.orphanSectionsRepaired).toBe(0);
    expect(result.text).toMatch(/^9\.1\s/m);
    expect(result.text).toMatch(/^9\.2\s/m);
    expect(result.text).toMatch(/^9\.3\s/m);
  });

  it("Case E: inline Section 7.1 references are preserved when orphan is repaired", () => {
    const input = [
      "7. Governing Law",
      "7.1 This Agreement shall be governed by Delaware law.",
      "The parties acknowledge Section 7.1 shall survive termination.",
    ].join("\n\n");
    const result = normalizePaidProOrphanSubsections(input, { source: "test312" });
    expect(result.text).toContain("Section 7.1 shall survive termination.");
  });

  it("Case F: execution/signature block is untouched", () => {
    const input = [
      "7. Governing Law",
      "7.1 Delaware law governs.",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "CLIENT:",
      "Blue Canyon Analytics LLC",
      "By: __________________________",
      "Name: Sarah Mitchell",
      "Title: CEO",
      "SERVICE PROVIDER:",
      "Iron Vale Systems Inc.",
      "By: __________________________",
      "Name: Michael Torres",
      "Title: President",
    ].join("\n\n");
    const result = normalizePaidProOrphanSubsections(input, { source: "test312" });
    expect(result.text).toContain("IN WITNESS WHEREOF");
    expect(result.text).toContain("Sarah Mitchell");
    expect(result.text).toContain("Michael Torres");
    expect(result.text).toContain("Iron Vale Systems Inc.");
  });

  it("pre-freeze SoT stores repaired corpus with no post-freeze structural drift", () => {
    const raw = buildCorpusWithOrphanSections();
    establishPaidProSourceOfTruth({ text: raw, source: "server_full_draft" });

    const sot = getPaidProSourceOfTruthText();
    expect(sot).toContain("7. Governing Law");
    expect(sot).toContain("This Agreement shall be governed by and construed");
    expect(sot).not.toMatch(/^7\.1\s/m);
    expect(sot).not.toMatch(/^8\.1\s/m);
    expect(detectPaidProOrphanSubsections(sot).orphanSectionsFound).toBe(0);

    const frozen = getFrozenCanonicalAgreementCorpus()?.canonicalText ?? "";
    expect(hashPaidProCorpus(frozen)).toBe(hashPaidProCorpus(sot));

    const review = resolvePaidProReviewRenderPlain();
    expect(hashPaidProCorpus(review)).toBe(hashPaidProCorpus(sot));
  });

  it("review/copy/display/signer_setup surfaces stay in parity after pre-freeze repair", () => {
    establishPaidProSourceOfTruth({ text: buildCorpusWithOrphanSections(), source: "server_full_draft" });

    const review = getPaidProDocumentForSurface("review")!.text;
    const copy = getPaidProDocumentForSurface("copy")!.text;
    const display = getPaidProDocumentForSurface("display")!.text;
    const exportText = getPaidProDocumentForSurface("finalized")!.text;
    const signerSetup = getPaidProDocumentForSurface("signer_setup")!.text;

    const reviewHash = hashPaidProCorpus(review);
    expect(hashPaidProCorpus(copy)).toBe(reviewHash);
    expect(hashPaidProCorpus(display)).toBe(reviewHash);
    expect(hashPaidProCorpus(exportText)).toBe(reviewHash);
    expect(hashPaidProCorpus(signerSetup)).toBe(reviewHash);
    expect(analyzePaidProExecutionBlockInvariant(review).executionBlockCount).toBe(1);
  });
});
