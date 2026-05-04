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

  it("uses executePremiumRefineUpdate and shows inline What changed caption", () => {
    const p = join(__dirname, "FinalizeYourAgreementPanel.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("executePremiumRefineUpdate");
    expect(s).toContain("userInstruction:");
    expect(s).toContain("refineWhatChangedCaption");
    expect(s).toContain("What changed: </span>");
  });
});

describe("FinalizeYourAgreementPanel send-for-review framing (copy only)", () => {
  it("surfaces delivery choice heading, conversion framing, and paid Pro signature continue + sender-first hooks", () => {
    const p = join(__dirname, "FinalizeYourAgreementPanel.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("PRO_REFINE_REVISE_SECTION_HEADING");
    expect(s).toContain("Choose how to deliver");
    expect(s).toContain("Recommended next step");
    expect(s).toContain(
      "Send this agreement for review so both sides can confirm details before signing.",
    );
    expect(s).toContain("Most agreements are reviewed by all parties before signing.");
    expect(s).toContain("Send for review");
    expect(s).toContain("Send for signature");
    expect(s).not.toContain("Send for signature instead");
    expect(s).not.toMatch(/>\s*Review first\s*</);
    expect(s).toContain("showSignatureRecipientContinue");
    expect(s).toContain("Add recipient emails");
    expect(s).toContain("I&apos;ll sign first");
    expect(s).toContain("formatRouteConfidenceLabel");
    expect(s).toContain('return "solid for review"');
    expect(s).toContain("deliveryCtasOnDraftCard");
    expect(s).toContain("FINALIZE_REFINE_ROUTE_HINT_DRAFT_CARD_DELIVERY");
  });
});
