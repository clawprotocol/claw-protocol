import { describe, expect, it } from "vitest";
import { buildClauseSuggestionCardsFromUploadText } from "./recipientClauseSuggestionsFromText";

describe("buildClauseSuggestionCardsFromUploadText", () => {
  it("parses dash bullets into cards", () => {
    const raw = ["- Payment timing", "  Clarifies invoice due dates.", "", "- Scope", "  Limits extra work."].join("\n");
    const cards = buildClauseSuggestionCardsFromUploadText(raw);
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(cards[0]?.title).toMatch(/Payment timing/i);
    expect(cards[1]?.title).toMatch(/Scope/i);
  });
});
