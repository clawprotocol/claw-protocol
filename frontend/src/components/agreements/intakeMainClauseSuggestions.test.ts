import { describe, expect, it } from "vitest";
import { MAIN_CLAUSE_SUGGESTIONS } from "./intakeMainClauseSuggestions";

describe("MAIN_CLAUSE_SUGGESTIONS", () => {
  it("has four stable ids and non-empty clause stubs", () => {
    expect(MAIN_CLAUSE_SUGGESTIONS).toHaveLength(4);
    const ids = new Set(MAIN_CLAUSE_SUGGESTIONS.map((s) => s.id));
    expect(ids.size).toBe(4);
    for (const s of MAIN_CLAUSE_SUGGESTIONS) {
      expect(s.label.trim().length).toBeGreaterThan(3);
      expect(s.append.trim().length).toBeGreaterThan(10);
    }
  });
});
