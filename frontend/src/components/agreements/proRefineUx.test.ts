import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatProRefineRejectedShortInline,
  PRO_REFINE_REJECTED_SHORT_PRIMARY,
  PRO_REFINE_SURGICAL_REJECTED_SHORT_EXHAUSTED,
} from "./premiumRefineAcceptance";

describe("Pro refine rejection copy (rejected_short)", () => {
  it("exposes a clear unchanged-document message", () => {
    expect(PRO_REFINE_REJECTED_SHORT_PRIMARY).toContain("LawDog tried to change too much");
    expect(PRO_REFINE_REJECTED_SHORT_PRIMARY).toContain("not changed");
    const inline = formatProRefineRejectedShortInline();
    expect(inline).toContain("Edit wording");
    expect(inline).toContain("LawDog tried to change too much");
  });

  it("exposes surgical exhausted copy after retry + fallbacks", () => {
    expect(PRO_REFINE_SURGICAL_REJECTED_SHORT_EXHAUSTED).toContain("could not safely apply");
    expect(PRO_REFINE_SURGICAL_REJECTED_SHORT_EXHAUSTED).toContain("Edit wording");
  });

  it("shows rejected_short inline near post-checkout refine (AgreementBuilderIntake)", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("isProRefineRejectedShortMessage");
    expect(s).toContain("Apply change");
    expect(s).toContain("Want to adjust this agreement?");
  });

  it("sets displayPhase to review on premium immediate visible commit (no intake fallback)", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const m = s.match(
      /commitAuthoritativePremiumVisibleSurface\s*=[\s\S]*?setDisplayPhase\("review"\)/,
    );
    expect(m).not.toBeNull();
  });

  it("CreateDraftReviewCard supports Pro eyebrow copy (not Draft preview only)", () => {
    const p = join(__dirname, "CreateDraftReviewCard.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("eyebrowLabel");
    expect(s).toContain("LawDog Pro agreement summary");
  });

  it("recipient-stage card passes LawDog Pro agreement when render source is server_full_document_text", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain('premiumPaidReadonlyPick.sourceUsed === "server_full_document_text"');
    expect(s).toContain('"LawDog Pro agreement"');
  });
});
