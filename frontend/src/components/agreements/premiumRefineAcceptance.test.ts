import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  evaluatePremiumRefineCandidate,
  formatProRefineRejectedShortInline,
  pickAuthoritativeProCorpusForRefine,
  PREMIUM_REFINE_AUTHORITATIVE_PIPELINE_SOURCE,
  PREMIUM_REFINE_MIN_LENGTH_RATIO,
  PRO_REFINE_REJECTED_SHORT_PRIMARY,
} from "./premiumRefineAcceptance";

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

describe("evaluatePremiumRefineCandidate", () => {
  it("rejects ~15k → ~3.9k truncation regression", () => {
    const cur = 15_000;
    const cand = "x".repeat(3900);
    const r = evaluatePremiumRefineCandidate(cur, cand);
    expect(r.decision).toBe("rejected_short");
    expect(r.ratio).toBeLessThan(PREMIUM_REFINE_MIN_LENGTH_RATIO);
  });

  it("accepts ~15k → ~15.2k marginal expansion", () => {
    const cur = 15_000;
    const cand = "y".repeat(15_200);
    const r = evaluatePremiumRefineCandidate(cur, cand);
    expect(r.decision).toBe("accepted");
    expect(r.ratio).toBeGreaterThanOrEqual(PREMIUM_REFINE_MIN_LENGTH_RATIO);
  });

  it("rejects empty candidate", () => {
    expect(evaluatePremiumRefineCandidate(5000, "   ").decision).toBe("rejected_empty");
  });

  it("accepts marginal expansion when late-fee language is appended (mirrors server narrow patch)", () => {
    const cur = 16_083;
    const base = "x".repeat(cur);
    const block =
      "\n\nLate Payment. Any undisputed amount not paid within ten (10) days after it becomes due may accrue a late fee equal to five percent (5%) of the overdue amount.\n\n";
    const r = evaluatePremiumRefineCandidate(cur, base + block);
    expect(r.decision).toBe("accepted");
    expect(r.ratio).toBeGreaterThanOrEqual(PREMIUM_REFINE_MIN_LENGTH_RATIO);
  });
});

describe("formatProRefineRejectedShortInline", () => {
  it("includes primary and hint for UI", () => {
    const t = formatProRefineRejectedShortInline();
    expect(t).toContain(PRO_REFINE_REJECTED_SHORT_PRIMARY);
    expect(t).toContain("Edit wording");
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
