import { describe, expect, it } from "vitest";
import {
  classifyRecipientRevisedDraftUpload,
  splitReviewerNotesFromRevisedDraft,
} from "./recipientRevisedDraftReviewerNotes";

describe("splitReviewerNotesFromRevisedDraft", () => {
  it("returns full text as body when no reviewer heading", () => {
    const raw = "Section 1\n\nPayment Net 30.\n\nClosing.";
    const r = splitReviewerNotesFromRevisedDraft(raw);
    expect(r.reviewerNotes).toBeNull();
    expect(r.agreementBody).toBe(raw);
  });

  it("splits on Reviewer Notes and keeps body out of notes-only compare", () => {
    const raw = "AGREEMENT BODY\n\nReviewer Notes\nPlease accept.";
    const r = splitReviewerNotesFromRevisedDraft(raw);
    expect(r.agreementBody).toBe("AGREEMENT BODY");
    expect(r.reviewerNotes).toBe("Reviewer Notes\nPlease accept.");
  });

  it("matches markdown-style headings", () => {
    const raw = "Terms here.\n\n## Suggested message\nUse softer language.";
    const r = splitReviewerNotesFromRevisedDraft(raw);
    expect(r.agreementBody).toBe("Terms here.");
    expect(r.reviewerNotes).toContain("Suggested message");
  });

  it("does not split when heading is first line", () => {
    const raw = "Reviewer Notes\nOnly notes, no body.";
    const r = splitReviewerNotesFromRevisedDraft(raw);
    expect(r.reviewerNotes).toBeNull();
    expect(r.agreementBody).toBe(raw.trim());
  });
});

describe("classifyRecipientRevisedDraftUpload", () => {
  const orig = "x".repeat(800);

  it("classifies commentary with Recommendation heading as review_notes_only", () => {
    const uploaded = "Recommendation\n\nWe suggest Net 45 instead.";
    const r = classifyRecipientRevisedDraftUpload(orig, uploaded);
    expect(r.kind).toBe("review_notes_only");
    expect(r.agreementText).toBe("");
    expect(r.reviewerNotes).toContain("Recommendation");
  });

  it("classifies long filler body with trailing Reviewer Notes as mixed", () => {
    const body = "z".repeat(2000);
    const uploaded = `${body}\n\nReviewer Notes\nThanks.`;
    const r = classifyRecipientRevisedDraftUpload(orig, uploaded);
    expect(r.kind).toBe("mixed_notes_and_agreement");
    expect(r.agreementText.length).toBeGreaterThanOrEqual(1900);
    expect(r.reviewerNotes).toContain("Reviewer Notes");
    expect(r.agreementText).not.toContain("Thanks.");
  });

  it("classifies substantial agreement-like text as full", () => {
    const uploaded = [
      "SERVICES AGREEMENT",
      "",
      "1. Parties. Alice and Bob agree to the terms below.",
      "2. Term. One year from the Effective Date.",
      "3. Payment. Net thirty (30) days.",
      "",
      "IN WITNESS WHEREOF, the parties have executed this Agreement.",
    ].join("\n");
    const r = classifyRecipientRevisedDraftUpload(orig, uploaded);
    expect(r.kind).toBe("full_revised_agreement");
    expect(r.agreementText.length).toBeGreaterThan(100);
  });

  it("classifies very short non-heading paste as full (allow compare)", () => {
    const r = classifyRecipientRevisedDraftUpload("Short original.", "Tiny edit.");
    expect(r.kind).toBe("full_revised_agreement");
  });
});
