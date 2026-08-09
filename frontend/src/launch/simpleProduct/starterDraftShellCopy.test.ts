import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHIP_STATE_READY } from "../../components/agreements/draftPreviewLabels";
import { STARTER_PRO_REFINE_IMPROVEMENT_CTA } from "../../components/agreements/reviewRefineUserCopy";
import {
  FUNNEL_FREE_STARTER_BODY,
  FUNNEL_FREE_STARTER_HEADLINE,
  FUNNEL_FREE_STARTER_HELPER,
} from "../pricingContent";
import { AGREEMENT_LIFECYCLE_PROGRESS_LABELS } from "../../agreement/agreementLifecycleRail";
import {
  SIMPLE_CREATE_STARTER_CONTROL_LINE,
  SIMPLE_CREATE_STARTER_HERO_SUBHEAD,
  SIMPLE_CREATE_STARTER_HERO_TITLE,
} from "./simpleCreatePaidProReviewShell";

describe("starter draft shell copy", () => {
  it("exports lifecycle-aware hero and control line", () => {
    expect(SIMPLE_CREATE_STARTER_HERO_TITLE).toMatch(/Draft it fast/i);
    expect(SIMPLE_CREATE_STARTER_HERO_SUBHEAD).toMatch(/party review|track-changes/i);
    expect(SIMPLE_CREATE_STARTER_HERO_SUBHEAD).toMatch(/prepare for signing/i);
    expect(SIMPLE_CREATE_STARTER_CONTROL_LINE).toMatch(/review, improve, share, sign, or stop/i);
    expect(FUNNEL_FREE_STARTER_HEADLINE).toBe("Your agreement is ready");
    expect(FUNNEL_FREE_STARTER_BODY).toMatch(/Review and edit everything/i);
    expect(FUNNEL_FREE_STARTER_HELPER).toMatch(/Nothing is sent, signed, or shared/i);
    expect(CHIP_STATE_READY).toBe("Draft ready to review");
    expect(STARTER_PRO_REFINE_IMPROVEMENT_CTA).toBe("Continue with Pro");
  });

  it("starter create uses universal lifecycle rail with Draft active first", () => {
    expect(AGREEMENT_LIFECYCLE_PROGRESS_LABELS).toEqual(["Draft", "Review", "Sign", "Proof"]);
    expect(AGREEMENT_LIFECYCLE_PROGRESS_LABELS).not.toContain("Send");
  });
});

describe("SimpleCreatePage starter copy (static)", () => {
  it("does not use stale send-first hero or Send with LawDog Pro", () => {
    const page = readFileSync(join(__dirname, "SimpleCreatePage.tsx"), "utf8");
    expect(page).toContain("SIMPLE_CREATE_STARTER_HERO_TITLE");
    expect(page).toContain("AGREEMENT_LIFECYCLE_PROGRESS_LABELS");
    expect(page).toContain("shellProgressLabels");
    expect(page).not.toContain("Review before anything is sent");
    expect(page).not.toContain("Send with LawDog Pro");
    expect(page).not.toMatch(/step=\{3\}/);
    expect(page).toContain("PRODUCT_NOT_LAW_FIRM");
    expect(page).toContain("NO_ATTORNEY_CLIENT");
    expect(page).toContain("STRUCTURED_DRAFT_ASSIST_SHORT");
    expect(page).not.toContain("Simple NDA between two parties");
    expect(page).not.toContain("Tap a starter or describe");
  });
});

describe("AgreementBuilderIntake starter copy (static)", () => {
  it("uses Continue with Pro CTA on streamline path", () => {
    const intake = readFileSync(
      join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"),
      "utf8",
    );
    expect(intake).toContain("PRO_CTA_CONTINUE");
    expect(intake).not.toContain("Send with LawDog Pro");
    expect(intake).toContain("ProConversionComparisonCard");
    expect(intake).toContain("STARTER_REVIEW_HELPER");
    expect(intake).toContain("performKeepReviewingFocus");
    const surface = readFileSync(
      join(__dirname, "../../components/agreements/StarterDraftDocumentSurface.tsx"),
      "utf8",
    );
    expect(intake).toContain("StarterDraftDocumentSurface");
    expect(surface).toContain("starter-draft-copy-text");
    expect(surface).toContain("logFreeDraftCopyText");
    expect(intake).not.toMatch(/label:\s*["']Upgrade to send["']/);
  });
});
