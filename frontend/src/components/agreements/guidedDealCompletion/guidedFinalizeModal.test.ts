import { describe, expect, it } from "vitest";
import {
  GUIDED_FINALIZE_MODAL_MIN_VISIBLE_MS,
  shouldShowGuidedFinalizeModalAfterDelay,
} from "./guidedFinalizeModal";

describe("guidedFinalizeModal (test38)", () => {
  it("suppresses modal flash for fast handoffs under 400ms", () => {
    expect(GUIDED_FINALIZE_MODAL_MIN_VISIBLE_MS).toBe(400);
    expect(shouldShowGuidedFinalizeModalAfterDelay(250)).toBe(false);
    expect(shouldShowGuidedFinalizeModalAfterDelay(450)).toBe(true);
  });
});
