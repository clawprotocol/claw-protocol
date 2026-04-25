import { describe, expect, it } from "vitest";
import { formatPartiesJoinedLine, formatPartySegmentForPreview } from "./partyFormat";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";

describe("formatPartySegmentForPreview", () => {
  it("title-cases entity and normalizes LLC with state in parentheses", () => {
    expect(formatPartySegmentForPreview("peaceful Journey LLC (ok)")).toBe("Peaceful Journey LLC (Oklahoma)");
  });

  it("strips duplicate LLC before state suffix", () => {
    expect(formatPartySegmentForPreview("peaceful Journey LLC LLC (Oklahoma)")).toBe("Peaceful Journey LLC (Oklahoma)");
  });

  it("removes duplicate state from entity when state is in parentheses", () => {
    expect(formatPartySegmentForPreview("Peaceful Journey Oklahoma LLC (Oklahoma)")).toBe("Peaceful Journey LLC (Oklahoma)");
  });
});

describe("formatPartiesJoinedLine", () => {
  it("formats two parties separated by and", () => {
    expect(formatPartiesJoinedLine("acme corp and jane doe")).toBe("Acme Corp. and Jane Doe");
  });
});

describe("buildLiveDraftPreview parties line", () => {
  it("formats between clause with state and title case", () => {
    const live = buildLiveDraftPreview(
      "Services agreement between peaceful Journey LLC (ok) and Anthem Blanchard for lawn care.",
    );
    expect(live.partiesLine).toContain("Peaceful Journey LLC (Oklahoma)");
    expect(live.partiesLine).toContain("Anthem Blanchard");
  });
});
