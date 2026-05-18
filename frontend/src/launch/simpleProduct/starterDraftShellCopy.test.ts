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
import {
  SIMPLE_CREATE_STARTER_CONTROL_LINE,
  SIMPLE_CREATE_STARTER_HERO_SUBHEAD,
  SIMPLE_CREATE_STARTER_HERO_TITLE,
  SIMPLE_CREATE_STARTER_PROGRESS_LABELS,
} from "./simpleCreatePaidProReviewShell";

describe("starter draft shell copy", () => {
  it("exports lifecycle-aware hero and control line", () => {
    expect(SIMPLE_CREATE_STARTER_HERO_TITLE).toMatch(/Draft it fast/i);
    expect(SIMPLE_CREATE_STARTER_HERO_SUBHEAD).toMatch(/share for review/i);
    expect(SIMPLE_CREATE_STARTER_HERO_SUBHEAD).toMatch(/prepare for signing/i);
    expect(SIMPLE_CREATE_STARTER_CONTROL_LINE).toMatch(/review, improve, share, sign, or stop/i);
    expect(FUNNEL_FREE_STARTER_HEADLINE).toBe("Starter draft");
    expect(FUNNEL_FREE_STARTER_BODY).toMatch(/improve it with LawDog Pro/i);
    expect(FUNNEL_FREE_STARTER_HELPER).toMatch(/Nothing is sent, signed, or shared/i);
    expect(CHIP_STATE_READY).toBe("Draft ready to review");
    expect(STARTER_PRO_REFINE_IMPROVEMENT_CTA).toBe("Upgrade and strengthen draft");
  });

  it("starter progress labels use Review before Share/Sign and keep Draft as step 1", () => {
    expect(SIMPLE_CREATE_STARTER_PROGRESS_LABELS[0]).toBe("Draft");
    expect(SIMPLE_CREATE_STARTER_PROGRESS_LABELS[1]).toBe("Review");
    expect(SIMPLE_CREATE_STARTER_PROGRESS_LABELS[2]).toBe("Share/Sign");
    expect(SIMPLE_CREATE_STARTER_PROGRESS_LABELS).not.toContain("Send");
  });
});

describe("SimpleCreatePage starter copy (static)", () => {
  it("does not use stale send-first hero or Send with LawDog Pro", () => {
    const page = readFileSync(join(__dirname, "SimpleCreatePage.tsx"), "utf8");
    expect(page).toContain("SIMPLE_CREATE_STARTER_HERO_TITLE");
    expect(page).toContain("SIMPLE_CREATE_STARTER_PROGRESS_LABELS");
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
  it("uses Continue with LawDog Pro and upgrade strengthen CTA on streamline path", () => {
    const intake = readFileSync(
      join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"),
      "utf8",
    );
    expect(intake).toContain("Continue with LawDog Pro");
    expect(intake).not.toContain("Send with LawDog Pro");
    expect(intake).toContain("STARTER_PRO_REFINE_IMPROVEMENT_CTA");
    expect(intake).toContain("FUNNEL_FREE_STARTER_HELPER");
    expect(intake).not.toContain("upgrade to send, collect signatures");
  });
});
