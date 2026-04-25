import { describe, expect, it } from "vitest";
import {
  buildIntakeClauseSuggestionRowItems,
  chipLabelForContext,
  INTAKE_CLAUSE_SUGGESTION_ROW_MAX,
} from "./clauseSuggestionRowModel";
import type { ContextRankedSuggestion } from "./intakeContextAutoSuggestions";
import { MAIN_CLAUSE_SUGGESTIONS } from "./intakeMainClauseSuggestions";
import type { LivePreviewSmartSuggestion } from "./livePreviewSmartSuggestions";

const baseCtx = (over: Partial<ContextRankedSuggestion>): ContextRankedSuggestion => ({
  id: "ctx_x",
  label: "Test?",
  clauseText: "Clause body.",
  baseWeight: 5,
  contextScore: 1,
  dependencyScore: 0,
  typeWeight: 0,
  totalScore: 6,
  reasons: [],
  clauseFamily: "late_fee",
  ...over,
});

describe("buildIntakeClauseSuggestionRowItems", () => {
  it(`returns at most ${INTAKE_CLAUSE_SUGGESTION_ROW_MAX} items`, () => {
    const ctx = [
      baseCtx({ id: "c1", clauseFamily: "ip_ownership" }),
      baseCtx({ id: "c2", clauseFamily: "termination" }),
      baseCtx({ id: "c3", clauseFamily: "late_fee" }),
      baseCtx({ id: "c4", clauseFamily: "governing_law" }),
    ];
    const items = buildIntakeClauseSuggestionRowItems({
      contextTop: ctx,
      smart: [],
      mains: MAIN_CLAUSE_SUGGESTIONS,
      usedContextIds: new Set(),
      usedSmartIds: new Set(),
      usedMainIds: new Set(),
    });
    expect(items).toHaveLength(INTAKE_CLAUSE_SUGGESTION_ROW_MAX);
    expect(items.every((i) => i.kind === "context")).toBe(true);
  });

  it("fills with main clauses after context when room remains", () => {
    const ctx = [baseCtx({ id: "c1", clauseFamily: "deliverables" })];
    const items = buildIntakeClauseSuggestionRowItems({
      contextTop: ctx,
      smart: [],
      mains: MAIN_CLAUSE_SUGGESTIONS,
      usedContextIds: new Set(),
      usedSmartIds: new Set(),
      usedMainIds: new Set(),
    });
    expect(items[0]?.kind).toBe("context");
    expect(items.slice(1).every((i) => i.kind === "main")).toBe(true);
    expect(items.length).toBeLessThanOrEqual(INTAKE_CLAUSE_SUGGESTION_ROW_MAX);
  });

  it("skips main late_fee when smart late-fee chip is included", () => {
    const smart: LivePreviewSmartSuggestion[] = [
      {
        id: "suggest-late-fee",
        section: "Payment",
        label: "Add late fee",
        append: "Late payment text.",
      },
    ];
    const items = buildIntakeClauseSuggestionRowItems({
      contextTop: [],
      smart,
      mains: MAIN_CLAUSE_SUGGESTIONS,
      usedContextIds: new Set(),
      usedSmartIds: new Set(),
      usedMainIds: new Set(),
    });
    expect(items.some((i) => i.kind === "smart" && i.suggestion.id === "suggest-late-fee")).toBe(true);
    expect(items.some((i) => i.kind === "main" && i.suggestion.id === "late_fee")).toBe(false);
  });
});

describe("chipLabelForContext", () => {
  it("maps ip_ownership family to a short chip", () => {
    expect(
      chipLabelForContext(
        baseCtx({ id: "x", clauseFamily: "ip_ownership", label: "Long label that would otherwise show?" }),
      ),
    ).toBe("IP ownership");
  });
});
