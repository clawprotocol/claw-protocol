import { describe, expect, it } from "vitest";
import {
  canActivateGuidedCompletionPhase,
  guidedPhaseBlocksStarterGenerating,
  GUIDED_COMPLETION_PHASE_INACTIVE,
  resolveStarterIsGenerating,
} from "./starterCreateHandoff";

describe("starterCreateHandoff (homepage regression)", () => {
  it("defaults guided completion to inactive and does not block starter generating", () => {
    expect(GUIDED_COMPLETION_PHASE_INACTIVE).toBe("inactive");
    expect(
      guidedPhaseBlocksStarterGenerating({
        guidedCompletionPhase: "inactive",
        premiumPaidDocumentSurface: false,
      }),
    ).toBe(false);
    expect(
      resolveStarterIsGenerating({
        guidedCompletionPhase: "inactive",
        premiumPaidDocumentSurface: false,
        displayPhase: "generating_draft",
        loading: true,
      }),
    ).toBe(true);
  });

  it("collecting_answers blocks generating only on premium paid surface", () => {
    expect(
      guidedPhaseBlocksStarterGenerating({
        guidedCompletionPhase: "collecting_answers",
        premiumPaidDocumentSurface: false,
      }),
    ).toBe(false);
    expect(
      resolveStarterIsGenerating({
        guidedCompletionPhase: "collecting_answers",
        premiumPaidDocumentSurface: false,
        displayPhase: "generating_draft",
        loading: true,
      }),
    ).toBe(true);
    expect(
      resolveStarterIsGenerating({
        guidedCompletionPhase: "collecting_answers",
        premiumPaidDocumentSurface: true,
        displayPhase: "generating_draft",
        loading: true,
      }),
    ).toBe(false);
  });

  it("guided completion activates only with usable paid body", () => {
    expect(
      canActivateGuidedCompletionPhase({
        premiumPaidDocumentSurface: false,
        paidBodyLen: 10_000,
      }),
    ).toBe(false);
    expect(
      canActivateGuidedCompletionPhase({
        premiumPaidDocumentSurface: true,
        paidBodyLen: 100,
      }),
    ).toBe(false);
    expect(
      canActivateGuidedCompletionPhase({
        premiumPaidDocumentSurface: true,
        paidBodyLen: 500,
      }),
    ).toBe(true);
  });
});
