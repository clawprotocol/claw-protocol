import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./premiumRefineApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./premiumRefineApi")>();
  return {
    ...actual,
    postPremiumRefine: vi.fn(),
  };
});

import { postPremiumRefine } from "./premiumRefineApi";
import {
  augmentPremiumRefineUserPromptWithChecklist,
  executePremiumRefineUpdate,
  tryAppendReviewerNotePreserveDocument,
} from "./premiumRefineLateFeeFallback";
import { evaluatePremiumRefineCandidate, looksLikeReviewerNoteOrCommentIntent } from "./premiumRefineAcceptance";

function longBaseline(): string {
  return "AGREEMENT\n\n" + Array.from({ length: 900 }, (_, i) => `Section line ${i} with text and obligations.\n`).join("");
}

describe("looksLikeReviewerNoteOrCommentIntent", () => {
  it("matches production-style QA prompt", () => {
    expect(
      looksLikeReviewerNoteOrCommentIntent(
        "Make note of the best for these and make note of the reviewer based on best practice issues",
      ),
    ).toBe(true);
  });

  it("matches explicit reviewer + best practice phrasing", () => {
    expect(
      looksLikeReviewerNoteOrCommentIntent("make note for reviewer based on the best practice issues"),
    ).toBe(true);
  });

  it("does not match generic indemnity rewrite", () => {
    expect(looksLikeReviewerNoteOrCommentIntent("Replace the indemnity cap with a mutual cap throughout.")).toBe(
      false,
    );
  });
});

describe("tryAppendReviewerNotePreserveDocument", () => {
  it("prefix-preserves baseline and appends reviewer heading", () => {
    const baseline = longBaseline();
    const short =
      "Suggested follow-ups:\n- Clarify payment timing\n- Add data retention for CRM exports\n";
    const r = tryAppendReviewerNotePreserveDocument({
      currentDocumentText: baseline,
      userInstruction: "Make note of the best for these and make note of the reviewer",
      shortCandidate: short,
      checklistLines: ["Weak: governing law", "Question: SLA credits"],
    });
    expect(r).not.toBeNull();
    expect(r!.text.startsWith(baseline)).toBe(true);
    expect(r!.text.length).toBeGreaterThan(baseline.length + 200);
    expect(r!.text).toContain("REVIEWER NOTE / REQUESTED REVIEW ITEMS");
    expect(r!.text).toContain("Weak: governing law");
    const acc = evaluatePremiumRefineCandidate(r!.text, baseline, baseline.length, undefined, "make reviewer notes");
    expect(acc.decision).toBe("accepted");
  });
});

describe("executePremiumRefineUpdate reviewer-note append path", () => {
  beforeEach(() => {
    vi.mocked(postPremiumRefine).mockReset();
  });

  it("uses append_reviewer_note_preserve_document when API returns short body twice", async () => {
    const baseline = longBaseline();
    expect(baseline.length).toBeGreaterThan(14_000);
    const instruction =
      "Make note of the best for these and make note of the reviewer based on best practice issues";
    const short = baseline.slice(0, Math.floor(baseline.length * 0.26)) + "\n\n(Model summary only.)\n";

    vi.mocked(postPremiumRefine)
      .mockResolvedValueOnce({
        updated_document_text: short,
        summary_changes: ["Attempt"],
        readiness_score: 55,
        suggested_next_step: "review",
      })
      .mockResolvedValueOnce({
        updated_document_text: short,
        summary_changes: ["Retry"],
        readiness_score: 55,
        suggested_next_step: "review",
      });

    const out = await executePremiumRefineUpdate({
      baselineText: baseline,
      baselineLen: baseline.length,
      intakeText: "B2B services.",
      userInstruction: instruction,
      refineChecklistBullets: ["Item A from checklist", "Item B"],
    });

    expect(out.refineApplyDecision).toBe("append_reviewer_note_preserve_document");
    expect(out.usedAppendReviewerNotePreserve).toBe(true);
    expect(out.acceptance.decision).toBe("accepted");
    expect(out.finalText.startsWith(baseline)).toBe(true);
    expect(out.finalText).toContain("REVIEWER NOTE / REQUESTED REVIEW ITEMS");
    expect(postPremiumRefine).toHaveBeenCalledTimes(2);
  });

  it("still rejects unsafe short replacement for non-reviewer instructions", async () => {
    const baseline = longBaseline();
    const short = baseline.slice(0, Math.floor(baseline.length * 0.26));
    vi.mocked(postPremiumRefine)
      .mockResolvedValueOnce({
        updated_document_text: short,
        summary_changes: ["x"],
        readiness_score: 50,
        suggested_next_step: "review",
      })
      .mockResolvedValueOnce({
        updated_document_text: short,
        summary_changes: ["y"],
        readiness_score: 50,
        suggested_next_step: "review",
      });

    const out = await executePremiumRefineUpdate({
      baselineText: baseline,
      baselineLen: baseline.length,
      intakeText: "Deal.",
      userInstruction: "Replace the entire confidentiality article with a one-paragraph summary.",
    });
    expect(out.usedAppendReviewerNotePreserve).toBe(false);
    expect(out.refineApplyDecision).toBeNull();
    expect(out.acceptance.decision).toBe("rejected_short");
  });
});

describe("augmentPremiumRefineUserPromptWithChecklist", () => {
  it("appends checklist block for backend context", () => {
    const p = augmentPremiumRefineUserPromptWithChecklist("Add reviewer notes", ["Gap: payment terms", "Gap: IP"]);
    expect(p).toContain("Add reviewer notes");
    expect(p).toContain("Gap: payment terms");
    expect(p).toContain("reviewer-note");
  });
});
