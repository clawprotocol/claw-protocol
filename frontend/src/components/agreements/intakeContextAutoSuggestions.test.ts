import { describe, expect, it } from "vitest";
import { computeContextAwareSuggestionResult } from "./intakeContextAutoSuggestions";
import type { LivePreviewModel } from "./liveDraftHeuristics";

const emptyModel: LivePreviewModel = {
  docTitle: "Agreement",
  partiesLine: null,
  scopeLine: null,
  servicesLine: null,
  termLine: null,
  obligationsLine: null,
  compensationLine: null,
  scheduleLine: null,
  signerPlaceholdersLine: null,
  hasStructuredSignal: false,
  payment: { amount: null, cadence: null, valid: true },
};

describe("computeContextAwareSuggestionResult", () => {
  it("suggests Oklahoma governing law when Oklahoma is mentioned without law language", () => {
    const r = computeContextAwareSuggestionResult(
      "Services between Acme and Bob in Oklahoma.",
      emptyModel,
      new Set(),
    );
    expect(r.topSuggestions.map((s) => s.id)).toContain("ctx_jurisdiction_oklahoma");
    const ok = r.topSuggestions.find((s) => s.id === "ctx_jurisdiction_oklahoma");
    expect(ok?.label).toBe("Set governing law to Oklahoma?");
    expect(ok?.clauseText).toContain("Oklahoma");
    expect(ok?.baseWeight).toBe(10);
    expect(ok?.contextScore).toBe(6);
    expect(ok?.reasons.length).toBeGreaterThan(0);
    expect(r.suppressMainClauseIds.has("governing_law")).toBe(true);
  });

  it("does not suggest Oklahoma when user already set governing law for Oklahoma", () => {
    const r = computeContextAwareSuggestionResult(
      "Work in Oklahoma. Governing law: Oklahoma.",
      emptyModel,
      new Set(),
    );
    expect(r.topSuggestions.find((s) => s.id === "ctx_jurisdiction_oklahoma")).toBeUndefined();
  });

  it("hides state governing law when any governing-law line exists (clause family)", () => {
    const r = computeContextAwareSuggestionResult(
      "Project in Oklahoma and Texas. Governing law: New York.",
      emptyModel,
      new Set(),
    );
    expect(r.topSuggestions.filter((s) => s.id.startsWith("ctx_jurisdiction_"))).toHaveLength(0);
  });

  it("suggests late fee when invoice cadence appears", () => {
    const r = computeContextAwareSuggestionResult("We invoice monthly for consulting.", emptyModel, new Set());
    const late = r.topSuggestions.find((s) => s.id === "ctx_payment_late_fee");
    expect(late).toBeDefined();
    expect(late?.label).toBe("Since payment is monthly, add a late fee?");
    expect(late?.clauseFamily).toBe("late_fee");
    expect(r.suppressMainClauseIds.has("late_fee")).toBe(true);
  });

  it("suggests contractor-related rows when consulting appears", () => {
    const r = computeContextAwareSuggestionResult(
      "Consulting agreement between parties for project Alpha.",
      emptyModel,
      new Set(),
    );
    expect(r.topSuggestions.some((s) => s.id.startsWith("ctx_contractor_"))).toBe(true);
  });

  it("returns at most three suggestions sorted by totalScore descending", () => {
    const raw =
      "Confidential NDA for a Texas software startup. Contractor consulting, monthly invoices, Oklahoma office.";
    const r = computeContextAwareSuggestionResult(raw, emptyModel, new Set());
    expect(r.topSuggestions.length).toBeLessThanOrEqual(3);
    const scores = r.topSuggestions.map((s) => s.totalScore);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });

  it("hides a suggestion after it was used (id in used set)", () => {
    const used = new Set(["ctx_jurisdiction_oklahoma"]);
    const r = computeContextAwareSuggestionResult("Project in Oklahoma between A and B.", emptyModel, used);
    expect(r.topSuggestions.find((s) => s.id === "ctx_jurisdiction_oklahoma")).toBeUndefined();
  });

  it("ranks Oklahoma + NDA above late fee when both qualify", () => {
    const raw = "Confidential NDA. Monthly invoices. Work performed in Oklahoma between Acme LLC and Bob.";
    const model: LivePreviewModel = {
      ...emptyModel,
      partiesLine: "Acme LLC and Bob",
      compensationLine: "$5,000 monthly",
      payment: { amount: 5000, cadence: "monthly", valid: true },
    };
    const r = computeContextAwareSuggestionResult(raw, model, new Set());
    expect(r.topSuggestions.length).toBeGreaterThanOrEqual(2);
    const first = r.topSuggestions[0];
    expect(first?.id).toBe("ctx_jurisdiction_oklahoma");
    expect((first?.totalScore ?? 0) >= (r.topSuggestions.find((s) => s.id === "ctx_payment_late_fee")?.totalScore ?? 0)).toBe(
      true,
    );
  });
});
