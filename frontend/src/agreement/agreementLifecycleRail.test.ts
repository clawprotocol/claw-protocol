import { describe, expect, it } from "vitest";
import {
  AGREEMENT_LIFECYCLE_CONTROL_LINE,
  AGREEMENT_LIFECYCLE_PROGRESS_LABELS,
  lifecycleStepForStage,
} from "./agreementLifecycleRail";

describe("agreementLifecycleRail", () => {
  it("uses universal Draft → Review → Sign → Proof labels", () => {
    expect(AGREEMENT_LIFECYCLE_PROGRESS_LABELS).toEqual(["Draft", "Review", "Sign", "Proof"]);
    expect(AGREEMENT_LIFECYCLE_PROGRESS_LABELS).not.toContain("Send");
    expect(AGREEMENT_LIFECYCLE_PROGRESS_LABELS).not.toContain("Share/Sign");
  });

  it("maps lifecycle stages to shell step indices", () => {
    expect(lifecycleStepForStage("draft")).toBe(1);
    expect(lifecycleStepForStage("review")).toBe(2);
    expect(lifecycleStepForStage("sign")).toBe(3);
    expect(lifecycleStepForStage("proof")).toBe(4);
  });

  it("exposes one control-first reassurance line", () => {
    expect(AGREEMENT_LIFECYCLE_CONTROL_LINE).toBe(
      "Nothing is sent or signed until you choose the next step.",
    );
  });
});
