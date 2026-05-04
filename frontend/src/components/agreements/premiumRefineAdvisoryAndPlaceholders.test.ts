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
  buildAdvisoryAppendPreserveDocument,
  executePremiumRefineUpdate,
} from "./premiumRefineLateFeeFallback";
import {
  classifyPremiumRefineRevisionIntent,
  evaluatePremiumRefineCandidate,
  isAdvisoryNoteOrCommentIntent,
  premiumRefineTextContainsPlaceholderCorruption,
  PREMIUM_REFINE_EVAL_APPEND_ONLY_INSTR,
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
