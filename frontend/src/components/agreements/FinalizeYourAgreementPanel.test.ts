import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("FinalizeYourAgreementPanel Pro refine → host summary", () => {
  it("declares optional onProRefineWhatChanged and invokes it when refine applies", () => {
    const p = join(__dirname, "FinalizeYourAgreementPanel.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("onProRefineWhatChanged?:");
    expect(s).toContain("onProRefineWhatChanged?.(");
    expect(s).toContain("summary_changes");
  });

  it("uses resolvePremiumRefineApplyOutcome + augment prompt and shows inline What changed caption", () => {
    const p = join(__dirname, "FinalizeYourAgreementPanel.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("resolvePremiumRefineApplyOutcome");
    expect(s).toContain("augmentPremiumRefineUserPrompt");
    expect(s).toContain("refineWhatChangedCaption");
    expect(s).toContain("What changed: </span>");
  });
});

describe("FinalizeYourAgreementPanel send-for-review framing (copy only)", () => {
  it("surfaces conversion framing, inevitability cue, and confidence label mapping", () => {
    const p = join(__dirname, "FinalizeYourAgreementPanel.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("Ready to send for review");
    expect(s).toContain("Recommended next step");
    expect(s).toContain(
      "Send this agreement for review so both sides can confirm details before signing.",
    );
    expect(s).toContain("Most agreements are reviewed before signing.");
    expect(s).toContain("Send for review →");
    expect(s).toContain("formatRouteConfidenceLabel");
    expect(s).toContain('return "solid for review"');
  });
});
