import { afterEach, describe, expect, it } from "vitest";
import {
  normalizePaidProOrphanSubsections,
  resetPaidProOrphanSubsectionNormalizerLogsForTests,
} from "./normalizePaidProOrphanSubsections";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
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

describe("normalizePaidProOrphanSubsections", () => {
  afterEach(() => {
    resetPaidProOrphanSubsectionNormalizerLogsForTests();
    clearPaidProSourceOfTruth();
  });

  it("converts lone 7.1 and 8.1 into body paragraphs under main headings", () => {
    const input = [
      "7. Governing Law",
      "7.1 This Agreement shall be governed by Delaware law.",
      "8. Notices",
      "8.1 Notices shall be sent to the addresses on file.",
    ].join("\n\n");

    const result = normalizePaidProOrphanSubsections(input, { source: "test311" });
    expect(result.orphanSectionsRepaired).toBe(2);
    expect(result.sectionNumbers).toEqual(expect.arrayContaining([7, 8]));
    expect(result.text).toContain("7. Governing Law");
    expect(result.text).toContain("This Agreement shall be governed by Delaware law.");
    expect(result.text).not.toMatch(/^7\.1\s/m);
    expect(result.text).toContain("8. Notices");
    expect(result.text).toContain("Notices shall be sent to the addresses on file.");
    expect(result.text).not.toMatch(/^8\.1\s/m);
  });

  it("leaves valid multi-subsection structures untouched", () => {
    const input = [
      "6. Limitation of Liability",
      "6.1 Neither party shall be liable for indirect damages.",
      "6.2 Direct damages are capped as stated herein.",
      "9. Miscellaneous",
      "9.1 Entire agreement.",
      "9.2 Severability.",
      "9.3 Counterparts.",
    ].join("\n\n");

    const result = normalizePaidProOrphanSubsections(input, { source: "test311" });
    expect(result.orphanSectionsRepaired).toBe(0);
    expect(result.text).toMatch(/^6\.1\s/m);
    expect(result.text).toMatch(/^6\.2\s/m);
    expect(result.text).toMatch(/^9\.1\s/m);
    expect(result.text).toMatch(/^9\.2\s/m);
    expect(result.text).toMatch(/^9\.3\s/m);
  });

  it("does not alter inline body references to section numbers", () => {
    const input = [
      "7. Governing Law",
      "7.1 This Agreement shall be governed by Delaware law.",
      "The parties acknowledge Section 7.1 applies to all disputes.",
    ].join("\n\n");

    const result = normalizePaidProOrphanSubsections(input, { source: "test311" });
    expect(result.text).toContain("Section 7.1 applies to all disputes.");
  });

  it("does not alter signature block after witness clause", () => {
    const input = [
      "7. Governing Law",
      "7.1 Delaware law governs.",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "CLIENT:",
      "Blue Canyon Analytics LLC",
    ].join("\n\n");

    const result = normalizePaidProOrphanSubsections(input, { source: "test311" });
    expect(result.text).toContain("CLIENT:");
    expect(result.text).toContain("Blue Canyon Analytics LLC");
  });
});

describe("Test311 paid Pro orphan subsection surface parity", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("review/copy/export/signer_setup stay in parity after orphan normalization", () => {
    const raw = buildCorpusWithOrphanSections();
    establishPaidProSourceOfTruth({ text: raw, source: "server_full_draft" });

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

    expect(review).toContain("7. Governing Law");
    expect(review).toContain("This Agreement shall be governed by and construed");
    expect(review).not.toMatch(/^7\.1\s/m);
    expect(review).not.toMatch(/^8\.1\s/m);
    expect(review).toMatch(/^6\.1\s/m);
    expect(review).toMatch(/^6\.2\s/m);
    expect(review).toMatch(/^9\.1\s/m);
    expect(review).toMatch(/^9\.2\s/m);
    expect(review).toMatch(/^9\.3\s/m);
    expect(review).toContain("Sarah Mitchell");
    expect(review).toContain("Michael Torres");
  });

  it("resolvePaidProReviewRenderPlain preserves exactly one execution block", () => {
    const raw = buildCorpusWithOrphanSections();
    establishPaidProSourceOfTruth({ text: raw, source: "server_full_draft" });
    const review = resolvePaidProReviewRenderPlain();
    const invariant = analyzePaidProExecutionBlockInvariant(review);
    expect(invariant.executionBlockCount).toBe(1);
  });
});
