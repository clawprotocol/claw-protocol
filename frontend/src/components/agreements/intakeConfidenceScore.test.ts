import { describe, expect, it } from "vitest";
import type { LivePreviewModel } from "./liveDraftHeuristics";
import {
  computeIntakeConfidenceScore,
  CONFIDENCE_DISPLAY_MIN,
  hasAtLeastTwoParties,
  MAX_RAW_TOTAL,
  paymentCompletionMet,
} from "./intakeConfidenceScore";

function emptyModel(over: Partial<LivePreviewModel> = {}): LivePreviewModel {
  return {
    docTitle: "Agreement",
    partiesLine: null,
    partiesUncertain: undefined,
    scopeLine: null,
    servicesLine: null,
    termLine: null,
    obligationsLine: null,
    compensationLine: null,
    scheduleLine: null,
    signerPlaceholdersLine: null,
    hasStructuredSignal: true,
    payment: { amount: null, cadence: null, valid: true },
    ...over,
  };
}

describe("deterministic completion rules", () => {
  it("requires >= 2 parties for parties credit", () => {
    const raw = "Consulting agreement between Acme LLC and Beta Inc. Payment $1,000.";
    const model = emptyModel({ partiesLine: "Acme LLC and Beta Inc." });
    expect(hasAtLeastTwoParties(raw, model)).toBe(true);
    expect(hasAtLeastTwoParties("Solo contractor work for $500.", emptyModel({ partiesLine: "Jane" }))).toBe(false);
  });

  it("payment complete with amount or no payment", () => {
    expect(paymentCompletionMet("$500 monthly retainer.", emptyModel())).toBe(true);
    expect(paymentCompletionMet("This is pro bono with no payment.", emptyModel())).toBe(true);
    expect(paymentCompletionMet("We might pay later.", emptyModel())).toBe(false);
  });

  it("floors legacy display percent at 40 when raw is zero; nominal stays honest", () => {
    const { rawTotal, nominalPercent, displayPercent } = computeIntakeConfidenceScore(emptyModel(), "");
    expect(rawTotal).toBe(0);
    expect(nominalPercent).toBe(0);
    expect(displayPercent).toBe(CONFIDENCE_DISPLAY_MIN);
  });

  it("reaches 100% display when all weighted points are earned", () => {
    const raw = [
      "Services agreement between Alpha LLC and Omega Co.",
      "Governing law: California.",
      "Termination: either party may terminate with 30 days notice.",
      "Late fee: 1.5% per month on overdue amounts.",
      "Disputes: binding arbitration in San Francisco.",
      "Payment: $10,000.",
      "Scope: Deliverables: (1) API integration; (2) acceptance testing; milestones in Exhibit A.",
      "Term: effective March 1, 2026 for 24 months.",
    ].join("\n\n");

    const model = emptyModel({
      partiesLine: "Alpha LLC and Omega Co.",
      scheduleLine: "$10,000",
      scopeLine:
        "Deliverables: (1) API integration; (2) acceptance testing; milestones in Exhibit A.",
      termLine: "effective March 1, 2026 for 24 months",
    });

    const { rawTotal, nominalPercent, displayPercent, breakdown } = computeIntakeConfidenceScore(model, raw);
    expect(rawTotal).toBe(MAX_RAW_TOTAL);
    expect(nominalPercent).toBe(100);
    expect(displayPercent).toBe(100);
    expect(breakdown.parties).toBe(20);
    expect(breakdown.payment).toBe(20);
    expect(breakdown.scope).toBe(20);
    expect(breakdown.term).toBe(20);
    expect(breakdown.governingLaw).toBe(10);
    expect(breakdown.termination).toBe(10);
    expect(breakdown.lateFee).toBe(5);
    expect(breakdown.disputeResolution).toBe(5);
  });
});
