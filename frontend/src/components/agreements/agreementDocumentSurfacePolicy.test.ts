import { describe, expect, it, vi, afterEach } from "vitest";
import * as paidProAuthoritativeRenderGate from "./paidProAuthoritativeRenderGate";
import { isStarterDocumentSurface, shouldSkipPaidProPolish } from "./agreementDocumentSurfacePolicy";

describe("agreementDocumentSurfacePolicy", () => {
  it("treats preview_starter and free tier as starter", () => {
    expect(isStarterDocumentSurface({ surface: "preview_starter" })).toBe(true);
    expect(isStarterDocumentSurface({ surface: "free_starter" })).toBe(true);
    expect(isStarterDocumentSurface({ tier: "free", starterPreview: true })).toBe(true);
    expect(shouldSkipPaidProPolish({ surface: "preview_premium_deliverable" })).toBe(false);
  });

  it("skips paid-Pro polish on premium deliverable after canonical freeze", () => {
    vi.spyOn(paidProAuthoritativeRenderGate, "shouldBlockPaidProStructuralMutationAfterAcceptance").mockReturnValue(
      true,
    );
    expect(shouldSkipPaidProPolish({ surface: "preview_premium_deliverable" })).toBe(true);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
