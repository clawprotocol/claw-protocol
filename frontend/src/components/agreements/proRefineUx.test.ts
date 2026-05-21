import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatProRefineRejectedShortInline,
  PRO_REFINE_ADVISORY_APPEND_SUCCESS_SUMMARY,
  PRO_REFINE_REJECTED_SHORT_PRIMARY,
  PRO_REFINE_REVISE_HELPER,
  PRO_REFINE_SURGICAL_REJECTED_SHORT_EXHAUSTED,
  shouldUseProRefineAdvisoryAppendSuccessCopy,
} from "./premiumRefineAcceptance";
import { PAID_PRO_REFINE_INSTRUCTION_PLACEHOLDER } from "./reviewRefineUserCopy";

describe("Paid Pro refine textarea helper + placeholder", () => {
  it("matches unified edits + reviewer-notes copy across constants and surfaces", () => {
    expect(PAID_PRO_REFINE_INSTRUCTION_PLACEHOLDER).toContain("Edit the agreement OR add notes for the reviewer");
    expect(PAID_PRO_REFINE_INSTRUCTION_PLACEHOLDER).toContain("Add late fee");
    expect(PRO_REFINE_REVISE_HELPER).toContain("one at a time");
    expect(PAID_PRO_REFINE_INSTRUCTION_PLACEHOLDER).toContain("Edit the agreement");
    const finalize = readFileSync(join(__dirname, "FinalizeYourAgreementPanel.tsx"), "utf8");
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(PRO_REFINE_ADVISORY_APPEND_SUCCESS_SUMMARY).toContain("Appended reviewer note");
    expect(
      shouldUseProRefineAdvisoryAppendSuccessCopy({
        userInstruction: "List items the other party should review.",
        usedAppendReviewerNotePreserve: false,
        refineApplyDecision: null,
      }),
    ).toBe(true);
    expect(finalize).toContain("resolvePremiumRefineSuccessUx");
    expect(finalize).toContain("shouldUseProRefineAdvisoryAppendSuccessCopy");
    expect(intake).toContain("shouldUseProRefineAdvisoryAppendSuccessCopy");
    expect(intake).toContain("PRO_REFINE_ADVISORY_APPEND_SUCCESS_SUMMARY");
    expect(finalize).toContain("PRO_REFINE_REVISE_HELPER");
    expect(finalize).toContain("PAID_PRO_REFINE_INSTRUCTION_PLACEHOLDER");
    expect(intake).toContain("GuidedDealCompletionPanel");
    expect(intake).toContain("PAID_PRO_REFINE_INSTRUCTION_PLACEHOLDER");
  });
});

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
