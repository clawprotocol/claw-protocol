import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./premiumRefineApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./premiumRefineApi")>();
  return {
    ...actual,
    postPremiumRefine: vi.fn(),
  };
});

import { postPremiumRefine, PRO_REFINE_UNAVAILABLE_USER_MESSAGE } from "./premiumRefineApi";
import {
  buildAdvisoryAppendPreserveDocument,
  executePremiumRefineUpdate,
} from "./premiumRefineLateFeeFallback";
import {
  classifyPremiumRefineRevisionIntent,
  evaluatePremiumRefineCandidate,
  isAdvisoryNoteOrCommentIntent,
  premiumRefineTextContainsPlaceholderCorruption,
  PREMIUM_REFINE_EVAL_APPEND_ONLY_INSTR,
  sanitizeAdvisoryNoteTextForAppend,
  scanPremiumRefinePlaceholderCorruption,
} from "./premiumRefineAcceptance";

function longBaseline(): string {
  return "AGREEMENT\n\n" + Array.from({ length: 900 }, (_, i) => `Section line ${i} with text and obligations.\n`).join("");
}

describe("advisory / comment intent classification", () => {
  it("classifies exact QA prompt as advisory_note_or_comment", () => {
    const p = "Make note of anything that should be reviewed or improved in this agreement";
    expect(isAdvisoryNoteOrCommentIntent(p)).toBe(true);
    expect(classifyPremiumRefineRevisionIntent(p)).toBe("advisory_note_or_comment");
  });

  it("classifies reviewer comment prompts as advisory", () => {
    expect(classifyPremiumRefineRevisionIntent("Add comments for the reviewer")).toBe("advisory_note_or_comment");
    expect(classifyPremiumRefineRevisionIntent("Flag risks and open issues")).toBe("advisory_note_or_comment");
  });

  it('classifies "List items the other party should review." as advisory (placeholder copy)', () => {
    const p = "List items the other party should review.";
    expect(isAdvisoryNoteOrCommentIntent(p)).toBe(true);
    expect(classifyPremiumRefineRevisionIntent(p)).toBe("advisory_note_or_comment");
  });

  it("classifies related list / party-review phrases as advisory", () => {
    expect(classifyPremiumRefineRevisionIntent("List review items before we send.")).toBe("advisory_note_or_comment");
    expect(classifyPremiumRefineRevisionIntent("Counterparty should review indemnity and data.")).toBe(
      "advisory_note_or_comment",
    );
    expect(classifyPremiumRefineRevisionIntent("Signer should review the signature blocks.")).toBe(
      "advisory_note_or_comment",
    );
    expect(classifyPremiumRefineRevisionIntent("Items the other party should review include payment.")).toBe(
      "advisory_note_or_comment",
    );
  });

  it("keeps late-fee clause edits as surgical_revision", () => {
    expect(classifyPremiumRefineRevisionIntent("Add late fee of 5% after 10 days overdue")).toBe("surgical_revision");
  });
});

describe("placeholder corruption guard", () => {
  it("detects [ADDRESS_1], [PARTY_2], and money+bracket corruption", () => {
    expect(premiumRefineTextContainsPlaceholderCorruption("Ship to [ADDRESS_1] on time.")).toBe(true);
    expect(premiumRefineTextContainsPlaceholderCorruption("Between [PARTY_2] and Client.")).toBe(true);
    expect(premiumRefineTextContainsPlaceholderCorruption("US $4,[ADDRESS_6] per month")).toBe(true);
    expect(premiumRefineTextContainsPlaceholderCorruption("1.[ADDRESS_1] Street")).toBe(true);
  });

  it("allows normal addresses without placeholder pattern", () => {
    expect(premiumRefineTextContainsPlaceholderCorruption("123 Main Street, Austin, TX 78701")).toBe(false);
  });

  it("evaluatePremiumRefineCandidate rejects accepted-looking output with placeholder tokens", () => {
    const baseline = "x".repeat(15_000);
    const cand = "y".repeat(14_500) + "\n\nBad line [ADDRESS_1]\n";
    const r = evaluatePremiumRefineCandidate(cand, baseline, baseline.length, undefined, "Add governing law.");
    expect(r.decision).toBe("rejected_short");
  });
});

describe("material collapse prevention (surgical)", () => {
  it("rejects 15k baseline vs 6k candidate without explicit shorten permission", () => {
    const cur = 15_000;
    const cand = "z".repeat(6000);
    const r = evaluatePremiumRefineCandidate(cand, undefined, cur, undefined, "Add a small clarification.");
    expect(r.decision).toBe("rejected_short");
  });
});

describe("advisory preserve + append behavior", () => {
  it("15k baseline + long clean candidate => output >= baseline length and starts with baseline", () => {
    const baseline = longBaseline();
    expect(baseline.length).toBeGreaterThan(14_000);
    const longCand = "y".repeat(17_000);
    const built = buildAdvisoryAppendPreserveDocument({
      currentDocumentText: baseline,
      userInstruction: "Make note of anything that should be reviewed or improved in this agreement",
      modelOut: longCand,
      checklistLines: ["Gap: indemnity"],
    });
    expect(built.startsWith(baseline)).toBe(true);
    expect(built.length).toBeGreaterThanOrEqual(baseline.length);
    expect(built).toContain("REVIEWER NOTE / REQUESTED REVIEW ITEMS");
    const acc = evaluatePremiumRefineCandidate(
      built,
      baseline,
      baseline.length,
      undefined,
      PREMIUM_REFINE_EVAL_APPEND_ONLY_INSTR,
    );
    expect(acc.decision).toBe("accepted");
  });

  it("drops corrupt model output but still appends advisory section", () => {
    const baseline = longBaseline();
    const dirty = "Summary\n[ADDRESS_1]\nUS $4,[ADDRESS_6]\n";
    const built = buildAdvisoryAppendPreserveDocument({
      currentDocumentText: baseline,
      userInstruction: "Flag risks for reviewer",
      modelOut: dirty,
    });
    expect(built.startsWith(baseline)).toBe(true);
    expect(premiumRefineTextContainsPlaceholderCorruption(built)).toBe(false);
  });
});

describe("executePremiumRefineUpdate advisory fast path", () => {
  beforeEach(() => {
    vi.mocked(postPremiumRefine).mockReset();
  });

  it('"List items the other party should review." append-preserves baseline and sets append decision', async () => {
    const baseline = longBaseline();
    vi.mocked(postPremiumRefine).mockResolvedValueOnce({
      updated_document_text: "z".repeat(4000),
      summary_changes: ["Stub"],
      readiness_score: 50,
      suggested_next_step: "review",
    });
    const out = await executePremiumRefineUpdate({
      baselineText: baseline,
      baselineLen: baseline.length,
      intakeText: "B2B.",
      userInstruction: "List items the other party should review.",
    });
    expect(out.refineApplyDecision).toBe("append_reviewer_note_preserve_document");
    expect(out.usedAppendReviewerNotePreserve).toBe(true);
    expect(out.acceptance.decision).toBe("accepted");
    expect(out.finalText.startsWith(baseline)).toBe(true);
    expect(out.finalText).toContain("REVIEWER NOTE / REQUESTED REVIEW ITEMS");
    expect(postPremiumRefine).toHaveBeenCalledTimes(1);
  });

  it("advisory append still applies when API returns fail-open summary (prod QA)", async () => {
    const baseline = longBaseline();
    vi.mocked(postPremiumRefine).mockResolvedValueOnce({
      updated_document_text: baseline,
      summary_changes: [PRO_REFINE_UNAVAILABLE_USER_MESSAGE],
      readiness_score: 50,
      suggested_next_step: "review",
    });
    const out = await executePremiumRefineUpdate({
      baselineText: baseline,
      baselineLen: baseline.length,
      intakeText: "B2B.",
      userInstruction: "List items the other party should review.",
    });
    expect(out.acceptance.decision).toBe("accepted");
    expect(out.usedAppendReviewerNotePreserve).toBe(true);
    expect(out.finalText).toContain("## REVIEWER NOTE");
    expect(out.finalText.startsWith(baseline)).toBe(true);
    expect(postPremiumRefine).toHaveBeenCalledTimes(1);
  });

  it("QA prompt with 6k corrupt-like short response still append-preserves full baseline in one POST", async () => {
    const baseline = longBaseline();
    const short = "z".repeat(6000) + "\n[ADDRESS_1]\n";
    vi.mocked(postPremiumRefine).mockResolvedValueOnce({
      updated_document_text: short,
      summary_changes: ["Stub"],
      readiness_score: 50,
      suggested_next_step: "review",
    });
    const out = await executePremiumRefineUpdate({
      baselineText: baseline,
      baselineLen: baseline.length,
      intakeText: "B2B.",
      userInstruction: "Make note of anything that should be reviewed or improved in this agreement",
      refineChecklistBullets: ["Check: payment"],
    });
    expect(out.refineApplyDecision).toBe("append_reviewer_note_preserve_document");
    expect(out.usedAppendReviewerNotePreserve).toBe(true);
    expect(out.acceptance.decision).toBe("accepted");
    expect(out.finalText.startsWith(baseline)).toBe(true);
    expect(out.finalText.length).toBeGreaterThan(baseline.length);
    expect(premiumRefineTextContainsPlaceholderCorruption(out.finalText)).toBe(false);
    expect(postPremiumRefine).toHaveBeenCalledTimes(1);
  });
});

describe("scanPremiumRefinePlaceholderCorruption samples", () => {
  it("returns bounded samples without echoing long user text", () => {
    const s = scanPremiumRefinePlaceholderCorruption("[ADDRESS_1] and [PARTY_2] plus noise " + "x".repeat(5000));
    expect(s.count).toBeGreaterThanOrEqual(2);
    expect(s.samples.every((x) => x.length < 100)).toBe(true);
  });
});

describe("sanitizeAdvisoryNoteTextForAppend", () => {
  it("drops lines with bracket placeholders and collapses blank runs", () => {
    const raw = "Good line about payment.\nShip to [ADDRESS_1] on time.\nAnother good line.\n\n\n";
    expect(sanitizeAdvisoryNoteTextForAppend(raw)).toBe("Good line about payment.\nAnother good line.");
  });

  it("drops section-dot and money-comma corruption lines", () => {
    expect(sanitizeAdvisoryNoteTextForAppend("1.[ADDRESS_1] Street name")).toBe("");
    expect(sanitizeAdvisoryNoteTextForAppend("US $4,[ADDRESS_6] per month")).toBe("");
  });
});

describe("executePremiumRefineUpdate advisory placeholder sanitization", () => {
  beforeEach(() => {
    vi.mocked(postPremiumRefine).mockReset();
  });

  it("accepts advisory append when model output contains placeholder lines (sanitized)", async () => {
    const baseline = longBaseline();
    const dirtyModel =
      "Suggested review:\n- Clarify invoicing cadence\n- Fix ship-to [ADDRESS_1] before countersign\n- Confirm notice address\n";
    vi.mocked(postPremiumRefine).mockResolvedValueOnce({
      updated_document_text: dirtyModel,
      summary_changes: ["Stub"],
      readiness_score: 50,
      suggested_next_step: "review",
    });
    const out = await executePremiumRefineUpdate({
      baselineText: baseline,
      baselineLen: baseline.length,
      intakeText: "B2B.",
      userInstruction: "List items the other party should review.",
    });
    expect(out.acceptance.decision).toBe("accepted");
    expect(out.refineApplyDecision).toBe("append_reviewer_note_preserve_document");
    expect(out.usedAppendReviewerNotePreserve).toBe(true);
    expect(out.finalText.startsWith(baseline)).toBe(true);
    expect(out.finalText).toContain("REVIEWER NOTE / REQUESTED REVIEW ITEMS");
    expect(out.finalText).not.toMatch(/\[ADDRESS_\d+\]/);
    expect(scanPremiumRefinePlaceholderCorruption(out.finalText).count).toBe(0);
    expect(out.finalText).toContain("Clarify invoicing cadence");
    expect(out.finalText).toContain("Confirm notice address");
  });

  it("drops corrupt checklist bullets but keeps clean ones", async () => {
    const baseline = longBaseline();
    vi.mocked(postPremiumRefine).mockResolvedValueOnce({
      updated_document_text: "z".repeat(4000),
      summary_changes: ["Stub"],
      readiness_score: 50,
      suggested_next_step: "review",
    });
    const out = await executePremiumRefineUpdate({
      baselineText: baseline,
      baselineLen: baseline.length,
      intakeText: "B2B.",
      userInstruction: "List items the other party should review.",
      refineChecklistBullets: ["Bad line [ADDRESS_1] here", "Good: review indemnity carve-outs"],
    });
    expect(out.acceptance.decision).toBe("accepted");
    expect(out.finalText).toContain("Good: review indemnity carve-outs");
    expect(out.finalText).not.toMatch(/\[ADDRESS_1\]/);
    expect(scanPremiumRefinePlaceholderCorruption(out.finalText).count).toBe(0);
  });

  it("falls back to minimal safe reviewer bullets when checklist and model sanitize to empty", async () => {
    const baseline = longBaseline();
    vi.mocked(postPremiumRefine).mockResolvedValueOnce({
      updated_document_text: "[ADDRESS_1]\n[PARTY_2]\n",
      summary_changes: ["Stub"],
      readiness_score: 50,
      suggested_next_step: "review",
    });
    const out = await executePremiumRefineUpdate({
      baselineText: baseline,
      baselineLen: baseline.length,
      intakeText: "B2B.",
      userInstruction: "List items the other party should review.",
      refineChecklistBullets: ["Only [ADDRESS_1] corrupt", "1.[ADDRESS_1] bad"],
    });
    expect(out.acceptance.decision).toBe("accepted");
    expect(out.finalText.startsWith(baseline)).toBe(true);
    expect(out.finalText).toContain("REVIEWER NOTE / REQUESTED REVIEW ITEMS");
    expect(out.finalText).toContain("Review final payment timing");
    expect(out.finalText).toContain("Review delivery, acceptance, and revision timing");
    expect(scanPremiumRefinePlaceholderCorruption(out.finalText).count).toBe(0);
  });
});
