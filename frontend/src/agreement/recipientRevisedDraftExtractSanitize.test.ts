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

  it("pulls inline reviewer commentary paragraphs out of the agreement body", () => {
    const raw = [
      "1. Payment\nNet 30.",
      "",
      "Reasoning: sender should accept by Friday.",
      "",
      "2. Term\nOne year.",
    ].join("\n\n");
    const r = sanitizeRecipientImportedRevisionText(raw);
    expect(r.agreementText).toContain("1. Payment");
    expect(r.agreementText).toContain("2. Term");
    expect(r.agreementText).not.toMatch(/Reasoning:/i);
    expect(r.reviewerNotes).toMatch(/Reasoning:/i);
  });

  it("dedupes identical leading paragraphs from PDF extraction", () => {
    const para = "Master Services Agreement between Client and Developer.";
    const raw = [para, "", para, "", para, "", "3. Fees\nNet 30."].join("\n\n");
    const r = sanitizeRecipientImportedRevisionText(raw);
    const count = r.agreementText.split(para).length - 1;
    expect(count).toBe(1);
  });
});
