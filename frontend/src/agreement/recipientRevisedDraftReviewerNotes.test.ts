import { describe, expect, it } from "vitest";
import { splitReviewerNotesFromRevisedDraft } from "./recipientRevisedDraftReviewerNotes";

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
