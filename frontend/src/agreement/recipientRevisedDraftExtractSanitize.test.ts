import { describe, expect, it } from "vitest";
import { sanitizeRecipientImportedRevisionText } from "./recipientRevisedDraftExtractSanitize";

describe("sanitizeRecipientImportedRevisionText", () => {
  it("splits reviewer notes for sender from agreement body", () => {
    const raw = [
      "1. Scope\nWork to be done.",
      "",
      "REVIEWER NOTES FOR SENDER — NOT PART OF AGREEMENT",
      "Please confirm Net 15.",
    ].join("\n\n");
    const r = sanitizeRecipientImportedRevisionText(raw);
    expect(r.agreementText).toContain("1. Scope");
    expect(r.agreementText).not.toMatch(/NOT PART OF AGREEMENT/i);
    expect(r.reviewerNotes).toMatch(/REVIEWER NOTES FOR SENDER/i);
    expect(r.reviewerNotes).toMatch(/Net 15/i);
  });

  it("strips repeated page-style header lines", () => {
    const raw = [
      "Sarah Collins revised draft for LawDog QA - Page 1",
      "",
      "1. Parties\nAlice and Bob.",
      "",
      "Sarah Collins revised draft for LawDog QA - Page 2",
      "",
      "2. Payment\nNet 15.",
    ].join("\n\n");
    const r = sanitizeRecipientImportedRevisionText(raw);
    expect(r.agreementText).not.toMatch(/Sarah Collins revised draft/i);
    expect(r.agreementText).toContain("1. Parties");
    expect(r.agreementText).toContain("2. Payment");
    expect(r.artifactsRemoved.length).toBeGreaterThan(0);
  });

  it("dedupes identical leading paragraphs from PDF extraction", () => {
    const para = "Master Services Agreement between Client and Developer.";
    const raw = [para, "", para, "", para, "", "3. Fees\nNet 30."].join("\n\n");
    const r = sanitizeRecipientImportedRevisionText(raw);
    const count = r.agreementText.split(para).length - 1;
    expect(count).toBe(1);
  });
});
