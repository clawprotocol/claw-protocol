import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  evaluatePremiumRefineCandidate,
  formatProRefineRejectedShortInline,
  instructionAllowsExtremeShrink,
  normalizePremiumRefineTextForCompare,
  pickAuthoritativeProCorpusForRefine,
  premiumRefineSummaryIsUnchangedFailOpen,
  PREMIUM_REFINE_AUTHORITATIVE_PIPELINE_SOURCE,
  PREMIUM_REFINE_FULL_ACCEPT_RATIO,
  PREMIUM_REFINE_HARD_SHRINK_FLOOR,
  PREMIUM_REFINE_MIN_LENGTH_RATIO,
  PRO_REFINE_REJECTED_SHORT_PRIMARY,
} from "./premiumRefineAcceptance";
import { PRO_REFINE_UNAVAILABLE_USER_MESSAGE } from "./premiumRefineApi";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

function baseDraft(over: Partial<ParsedDraftShape> = {}): ParsedDraftShape {
  return {
    title: "Services",
    jurisdiction: "CA",
    parties: [
      { name: "A", role: "party" },
      { name: "B", role: "party" },
    ],
    purpose: "Consulting",
    payment_terms: "$1",
    duration: "12m",
    due_date: null,
    effective_date: null,
    payment: emptyPayment,
    ...over,
  };
}

const SECTION_SPINE = `
THIS SERVICES AGREEMENT (this "Agreement") is entered into as of January 1, 2025 by and between Acme LLC ("Client") and Beta Corp ("Vendor").

1. Scope of Services. Vendor will deliver consulting services and deliverables described in Exhibit A.

2. Payment. Client shall pay fees of $5,000 within thirty (30) days of invoice.

3. Term. The initial term is twelve (12) months from the effective date with termination as set forth herein.

4. Confidentiality and Ownership. Each party acknowledges confidential information. All intellectual property and work product shall be owned by Client after full payment.
`.trim();

function padDocToLength(body: string, totalLen: number, fill: string): string {
  const b = body.trimEnd();
  if (b.length >= totalLen) return b.slice(0, totalLen);
  return b + fill.repeat(totalLen - b.length);
}

describe("evaluatePremiumRefineCandidate", () => {
  it("rejects ~15k → ~3.9k truncation regression", () => {
    const cur = 15_000;
    const cand = "x".repeat(3900);
    const r = evaluatePremiumRefineCandidate(cand, undefined, cur);
    expect(r.decision).toBe("rejected_short");
    expect(r.ratio).toBeLessThan(PREMIUM_REFINE_HARD_SHRINK_FLOOR);
    expect(r.requiredSectionsPresent).toBe(false);
  });

  it("accepts ~15k → ~10.1k when ratio ~0.64 and required agreement sections are present", () => {
    const cur = 15_759;
    const target = 10_143;
    const cand = padDocToLength(SECTION_SPINE, target, "z");
    expect(cand.length).toBe(target);
    const r = evaluatePremiumRefineCandidate(cand, undefined, cur);
    expect(r.ratio).toBeGreaterThan(0.63);
    expect(r.ratio).toBeLessThan(PREMIUM_REFINE_FULL_ACCEPT_RATIO);
    expect(r.requiredSectionsPresent).toBe(true);
    expect(r.decision).toBe("accepted");
  });

  it("rejects ~15.7k → ~10.1k when ratio ~0.64 but parties/scope sections are missing", () => {
    const cur = 15_759;
    const filler = `
Payment invoice amount due $500 within thirty days term duration twelve months termination upon notice.
Fees compensation for term of 90 calendar days.
`.trim();
    const target = 10_143;
    const cand = padDocToLength(filler, target, "n");
    expect(cand.length).toBe(target);
    const r = evaluatePremiumRefineCandidate(cand, undefined, cur);
    expect(r.decision).toBe("rejected_short");
    expect(r.requiredSectionsPresent).toBe(false);
  });

  it("accepts ~15k → ~15.2k marginal expansion", () => {
    const cur = 15_000;
    const cand = "y".repeat(15_200);
    const r = evaluatePremiumRefineCandidate(cand, undefined, cur);
    expect(r.decision).toBe("accepted");
    expect(r.ratio).toBeGreaterThanOrEqual(PREMIUM_REFINE_FULL_ACCEPT_RATIO);
    expect(r.ratio).toBeGreaterThanOrEqual(PREMIUM_REFINE_MIN_LENGTH_RATIO);
  });

  it("rejects empty candidate", () => {
    expect(evaluatePremiumRefineCandidate("   ", undefined, 5000).decision).toBe("rejected_empty");
  });

  it("accepts marginal expansion when late-fee language is appended (mirrors server narrow patch)", () => {
    const cur = 16_083;
    const base = "x".repeat(cur);
    const block =
      "\n\nLate Payment. Any undisputed amount not paid within ten (10) days after it becomes due may accrue a late fee equal to five percent (5%) of the overdue amount.\n\n";
    const r = evaluatePremiumRefineCandidate(base + block, undefined, cur);
    expect(r.decision).toBe("accepted");
    expect(r.ratio).toBeGreaterThanOrEqual(PREMIUM_REFINE_FULL_ACCEPT_RATIO);
  });

  it("accepts extreme shrink below 0.50 when user asks to summarize and spine is still present", () => {
    const cur = 12_000;
    const pad = "q".repeat(5000);
    const cand = `${SECTION_SPINE}\n\n${pad}`;
    expect(cand.length / cur).toBeLessThan(PREMIUM_REFINE_HARD_SHRINK_FLOOR);
    const r = evaluatePremiumRefineCandidate(cand, undefined, cur, undefined, "Please summarize this agreement.");
    expect(r.decision).toBe("accepted");
    expect(r.requiredSectionsPresent).toBe(true);
  });

  it("rejects identical refined text vs current Pro (no false-positive apply)", () => {
    const body = "Same\nparagraph\ncontent\n".repeat(200);
    const cur = body.length;
    const r = evaluatePremiumRefineCandidate(`${body}\n`, body, cur);
    expect(r.decision).toBe("rejected_unchanged");
    expect(r.refinedLen).toBeGreaterThan(cur - 5);
  });

  it("rejects when summary_changes contains fail-open unchanged message", () => {
    const cur = 5000;
    const same = "y".repeat(cur);
    const r = evaluatePremiumRefineCandidate(same, same, cur, [
      PRO_REFINE_UNAVAILABLE_USER_MESSAGE,
    ]);
    expect(r.decision).toBe("rejected_unchanged");
  });

  it("normalizePremiumRefineTextForCompare collapses whitespace for equality", () => {
    expect(normalizePremiumRefineTextForCompare("a  \n\tb")).toBe(normalizePremiumRefineTextForCompare(" a b "));
  });

  it("premiumRefineSummaryIsUnchangedFailOpen matches exact fail-open line", () => {
    expect(premiumRefineSummaryIsUnchangedFailOpen([PRO_REFINE_UNAVAILABLE_USER_MESSAGE])).toBe(true);
    expect(premiumRefineSummaryIsUnchangedFailOpen(["Some other summary"])).toBe(false);
  });
});

describe("instructionAllowsExtremeShrink", () => {
  it("detects shorten / summarize intent", () => {
    expect(instructionAllowsExtremeShrink("Please shorten the agreement")).toBe(true);
    expect(instructionAllowsExtremeShrink("Summarize payment only")).toBe(true);
    expect(instructionAllowsExtremeShrink("Add a governing-law clause")).toBe(false);
  });
});

describe("formatProRefineRejectedShortInline", () => {
  it("includes primary copy for UI", () => {
    const t = formatProRefineRejectedShortInline();
    expect(t).toContain(PRO_REFINE_REJECTED_SHORT_PRIMARY);
    expect(t).toContain("Edit wording");
    expect(t).toContain("LawDog made a shorter version");
  });
});

describe("pickAuthoritativeProCorpusForRefine", () => {
  it("prefers longest draft premium field over short agreement buffer", () => {
    const full = "p".repeat(15_000);
    const d = baseDraft({
      premium_server_full_document_text: full,
      premium_full_document_text: null,
    });
    const p = pickAuthoritativeProCorpusForRefine({
      draft: d,
      agreementDocumentText: "short preview only",
    });
    expect(p.len).toBe(15_000);
    expect(p.chosenSource).toBe("premium_server_full_document_text");
  });

  it("surfaces authoritative pipeline constant", () => {
    expect(PREMIUM_REFINE_AUTHORITATIVE_PIPELINE_SOURCE).toBe("server_full_document_text");
  });
});
