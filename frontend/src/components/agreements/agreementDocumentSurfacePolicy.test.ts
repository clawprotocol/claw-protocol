import { describe, expect, it } from "vitest";
import { isStarterDocumentSurface, shouldSkipPaidProPolish } from "./agreementDocumentSurfacePolicy";

describe("agreementDocumentSurfacePolicy", () => {
  it("treats preview_starter and free tier as starter", () => {
    expect(isStarterDocumentSurface({ surface: "preview_starter" })).toBe(true);
    expect(isStarterDocumentSurface({ surface: "free_starter" })).toBe(true);
    expect(isStarterDocumentSurface({ tier: "free", starterPreview: true })).toBe(true);
    expect(shouldSkipPaidProPolish({ surface: "preview_premium_deliverable" })).toBe(false);
  });
});
