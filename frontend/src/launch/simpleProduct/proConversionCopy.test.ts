import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../../components/agreements/agreementAdvancedDraftAccess";
import {
  CHECKOUT_CTA,
  CHECKOUT_FOOTER,
  CHECKOUT_SUBTITLE,
  CHECKOUT_TITLE,
  DRAFT_LOADING_STRUCTURING,
  EARN_CTA_START,
  EARN_HERO_TITLE,
  PRO_CTA_CONTINUE,
  PRO_CTA_EDIT_FREE_DRAFT,
  PRO_CTA_KEEP_FREE_DRAFT,
  PRO_UPGRADE_CARD_HEADING,
  PRO_UPGRADE_FREE_BULLETS,
  PRO_UPGRADE_FREE_COLUMN_HELPER,
  PRO_UPGRADE_PRO_BULLETS,
  STALE_PRO_CONVERSION_STRINGS,
} from "./proConversionCopy";
import {
  CHECKOUT_STARTER_UPGRADE_SUBTITLE,
  resolveCheckoutFlowProgress,
  STARTER_UPGRADE_CHECKOUT_PROGRESS_LABELS,
} from "./checkoutFlowProgress";

const CONVERSION_SURFACE_PATHS: readonly string[] = [
  join(__dirname, "../../components/agreements/reviewRefineUserCopy.ts"),
  join(__dirname, "../../components/agreements/starterReviewPremiumUpsellCopy.ts"),
  join(__dirname, "../../components/agreements/FullDraftUpgradeDiffPreview.tsx"),
  join(__dirname, "../../components/agreements/AdvancedFullDraftPaywallModal.tsx"),
  join(__dirname, "../../components/agreements/AgreementCompletionCheckoutContext.tsx"),
  join(__dirname, "SimpleCheckoutPage.tsx"),
  join(__dirname, "checkoutTrustCopy.ts"),
  join(__dirname, "CheckoutTrustPanel.tsx"),
  join(__dirname, "checkoutFlowProgress.ts"),
  join(__dirname, "../affiliate/ClawOpportunityPage.tsx"),
  join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"),
  join(__dirname, "../../components/agreements/ProConversionComparisonCard.tsx"),
];

describe("proConversionCopy", () => {
  it("exports unified Pro and checkout strings", () => {
    expect(PRO_CTA_CONTINUE).toBe("Continue with Pro");
    expect(PRO_CTA_KEEP_FREE_DRAFT).toBe("Keep free draft");
    expect(PRO_CTA_EDIT_FREE_DRAFT).toBe("Edit free draft");
    expect(PRO_UPGRADE_CARD_HEADING).toMatch(/draft to deal/i);
    expect(PRO_UPGRADE_FREE_BULLETS).toContain("Copy your draft text");
    expect(PRO_UPGRADE_FREE_BULLETS.join(" ").toLowerCase()).not.toMatch(/download/);
    expect(PRO_UPGRADE_FREE_COLUMN_HELPER).toMatch(/proof records/i);
    expect(PRO_UPGRADE_PRO_BULLETS.length).toBeGreaterThan(0);
    expect(CHECKOUT_TITLE).toBe("Continue with Pro");
    expect(CHECKOUT_SUBTITLE).toMatch(/Review it before anything is shared, sent, or signed/i);
    expect(CHECKOUT_CTA).toBe("Continue with Pro");
    expect(CHECKOUT_FOOTER).toMatch(/Review before anything moves/i);
    expect(DRAFT_LOADING_STRUCTURING).toBe("Structuring key terms…");
    expect(EARN_HERO_TITLE).toBe("Earn with LawDog");
    expect(EARN_CTA_START).toBe("Start earning");
  });

  it("starter upgrade checkout stepper keeps Upgrade active", () => {
    const p = resolveCheckoutFlowProgress({
      agreementId: CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
      isSingleAgreementCheckout: false,
      returnTo: "/app/create?premiumCompletion=1",
    });
    expect(p.labels).toEqual([...STARTER_UPGRADE_CHECKOUT_PROGRESS_LABELS]);
    expect(p.step).toBe(2);
    expect(p.labels[1]).toBe("Review");
  });

  it("checkout subtitle matches shared copy module", () => {
    expect(CHECKOUT_STARTER_UPGRADE_SUBTITLE).toBe(CHECKOUT_SUBTITLE);
  });

  it("primary conversion surfaces do not contain stale CTA or fear headings", () => {
    for (const path of CONVERSION_SURFACE_PATHS) {
      const src = readFileSync(path, "utf8");
      for (const stale of STALE_PRO_CONVERSION_STRINGS) {
        expect(src.includes(stale), `${path} must not include "${stale}"`).toBe(false);
      }
    }
  });

  it("AgreementBuilderIntake uses calm draft loading copy, not parse/timeout labels", () => {
    const intake = readFileSync(join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("DRAFT_LOADING_STRUCTURING");
    expect(intake).not.toMatch(/label:\s*["']Parsing/i);
    expect(intake).not.toMatch(/label:\s*["'].*[Tt]imeout/i);
  });
});

describe("ClawOpportunityPage earn landing (static)", () => {
  it("renders simplified hero before Start earning expands details", () => {
    const page = readFileSync(join(__dirname, "../affiliate/ClawOpportunityPage.tsx"), "utf8");
    expect(page).toContain("EARN_HERO_TITLE");
    expect(page).toContain("EARN_CTA_START");
    expect(page).toContain("earnDetailsOpen");
    expect(page).not.toContain("OpportunityIntroCards");
    const affiliatePanelIdx = page.indexOf("<AffiliateDashboardPanel");
    const startIdx = page.indexOf("earnDetailsOpen");
    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(affiliatePanelIdx).toBeGreaterThan(startIdx);
  });
});
