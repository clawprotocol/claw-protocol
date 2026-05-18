import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRO_CTA_CONTINUE,
  PRO_CTA_KEEP_FREE_DRAFT,
  PRO_UPGRADE_CAN_HELP_BULLETS,
  PRO_UPGRADE_CARD_HEADING,
} from "./simpleProduct/proConversionCopy";
import {
  HOME_CREATE_TRANSITION_HEADING,
  REVIEW_AHA_CHIP,
  REVIEW_AHA_HEADING,
  STALE_FUNNEL_UI_STRINGS,
} from "./simpleProduct/guidedWorkflowCopy";
import { HOMEPAGE_CTA_VIEW_EXAMPLE } from "./pricingContent";

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");

describe("guided workflow copy", () => {
  it("uses concierge preparation and review aha headings", () => {
    expect(HOME_CREATE_TRANSITION_HEADING).toBe("Preparing your agreement");
    expect(REVIEW_AHA_HEADING).toBe("Your agreement is ready");
    expect(REVIEW_AHA_CHIP).toBe("Draft ready to review");
  });

  it("frames Pro as workflow continuation", () => {
    expect(PRO_UPGRADE_CARD_HEADING).toBe("Ready to share or sign?");
    expect(PRO_CTA_CONTINUE).toBe("Continue with Pro");
    expect(PRO_CTA_KEEP_FREE_DRAFT).toBe("Keep free draft");
    expect(PRO_UPGRADE_CAN_HELP_BULLETS[0]).toBe("Send a private review link");
  });
});

describe("LaunchHomePage guided UX (static)", () => {
  const page = read("LaunchHomePage.tsx");

  it("shows full-screen transition on submit with text", () => {
    expect(page).toContain("HomeCreateTransitionOverlay");
    expect(page).toContain("setHomeTransitionActive(true)");
    expect(page).toContain("useAutoResizeTextarea");
    expect(page).not.toContain("DRAFT_LOADING_STRUCTURING");
  });

  it("uses View example secondary CTA", () => {
    expect(page).toContain("HOMEPAGE_CTA_VIEW_EXAMPLE");
    expect(HOMEPAGE_CTA_VIEW_EXAMPLE).toBe("View example");
  });

  it("limits trust section to two cards", () => {
    expect(page).toContain("homepageTrustCards");
    expect(page).toContain(".slice(0, 2)");
  });
});

describe("AgreementBuilderIntake review UX (static)", () => {
  const intake = read("../components/agreements/AgreementBuilderIntake.tsx");

  it("hides starter draft version chip on streamline review", () => {
    expect(intake).toContain("REVIEW_AHA_CHIP");
    expect(intake).toContain('version: ""');
    expect(intake).toContain("StarterDraftDocumentSurface");
    expect(intake).toContain("logProContinuationCardVisible");
    expect(intake).toContain("hideStickyForStarterProContinuation");
    expect(intake).toContain("freeTrackBlocksRecipientAdvance");
    expect(intake).toContain('case "keep_reviewing"');
    expect(intake).toContain("logFreeReviewKeepReviewing");
    expect(intake).toContain("logFreeSendGatedToPro");
    expect(intake).not.toContain('label: "Keep reviewing"');
    expect(intake).toContain("logHomeAutoGenerateSkipped");
    expect(intake).toContain("homeAutoGenerateConsumedRef");
    expect(intake).toContain("STARTER_PRO_REFINE_EDIT_DRAFT_CTA");
  });

  it("does not surface stale funnel strings in primary review", () => {
    for (const stale of STALE_FUNNEL_UI_STRINGS) {
      expect(intake.includes(stale), `intake should not include "${stale}"`).toBe(false);
    }
  });
});

describe("SimpleCreatePage home transition (static)", () => {
  const page = read("simpleProduct/SimpleCreatePage.tsx");

  it("continues concierge overlay through auto-generate", () => {
    expect(page).toContain("HomeCreateTransitionOverlay");
    expect(page).toContain("onHomeGuidedTransitionPhase");
    expect(page).toContain("homeTransitionVisible");
  });
});
