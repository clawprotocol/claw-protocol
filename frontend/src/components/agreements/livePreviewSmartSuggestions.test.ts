import { describe, expect, it } from "vitest";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";
import { buildLivePreviewSmartSuggestions } from "./livePreviewSmartSuggestions";

describe("buildLivePreviewSmartSuggestions", () => {
  it("returns at most 3 suggestions", () => {
    const raw =
      "Consulting between Acme and Beta. Pay $5k monthly. Term 12 months. Do some work on the project. No governing law yet.";
    const model = buildLiveDraftPreview(raw);
    const s = buildLivePreviewSmartSuggestions({ model, rawIntake: raw, usedIds: new Set() });
    expect(s.length).toBeLessThanOrEqual(3);
  });

  it("hides a suggestion after it is marked used", () => {
    const raw = "Acme and Beta agree. Pay $1000 by the 1st. Term: 6 months. Scope: stuff.";
    const model = buildLiveDraftPreview(raw);
    const first = buildLivePreviewSmartSuggestions({ model, rawIntake: raw, usedIds: new Set() });
    expect(first.length).toBeGreaterThan(0);
    const id = first[0]!.id;
    const second = buildLivePreviewSmartSuggestions({ model, rawIntake: raw, usedIds: new Set([id]) });
    expect(second.find((x) => x.id === id)).toBeUndefined();
  });
});
