import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRO_CTA_EDIT_FREE_DRAFT,
  PRO_UPGRADE_BRIDGE_LINE,
  PRO_UPGRADE_CARD_BODY,
  PRO_UPGRADE_CARD_HEADING,
  PRO_UPGRADE_FREE_BULLETS,
  PRO_UPGRADE_FREE_COLUMN_HELPER,
  PRO_UPGRADE_FREE_COLUMN_LABEL,
  STALE_PRO_CONVERSION_STRINGS,
  PRO_UPGRADE_PRO_BULLETS,
  PRO_UPGRADE_PRO_COLUMN_LABEL,
  PRO_UPGRADE_REASSURANCE,
} from "../../launch/simpleProduct/proConversionCopy";

const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
const card = readFileSync(join(__dirname, "ProConversionComparisonCard.tsx"), "utf8");

describe("Pro conversion comparison copy", () => {
  it("exports draft-to-deal heading and free vs pro framing", () => {
    expect(PRO_UPGRADE_CARD_HEADING).toBe("Ready to move this from draft to deal?");
    expect(PRO_UPGRADE_CARD_BODY).toMatch(/Free gives you the draft\. Pro unlocks/i);
    expect(PRO_UPGRADE_BRIDGE_LINE).toMatch(/another person needs to review/i);
    expect(PRO_UPGRADE_REASSURANCE).toBe("You review everything before anything is shared.");
  });

  it("defines free and pro comparison columns without download language", () => {
    expect(PRO_UPGRADE_FREE_COLUMN_LABEL).toBe("Free");
    expect(PRO_UPGRADE_PRO_COLUMN_LABEL).toBe("Pro");
    expect(PRO_UPGRADE_FREE_BULLETS).toContain("Copy your draft text");
    expect(PRO_UPGRADE_FREE_BULLETS.join(" ").toLowerCase()).not.toMatch(/download/);
    expect(PRO_UPGRADE_FREE_COLUMN_HELPER).toMatch(/Free keeps drafting lightweight/i);
    expect(PRO_UPGRADE_FREE_COLUMN_HELPER).toMatch(/proof records/i);
    expect(PRO_UPGRADE_FREE_BULLETS).toContain("Nothing is shared automatically");
    expect(PRO_UPGRADE_PRO_BULLETS[0]).toMatch(/private review link/i);
    expect(PRO_UPGRADE_PRO_BULLETS.join(" ")).toMatch(/signature|proof/i);
    expect(PRO_CTA_EDIT_FREE_DRAFT).toBe("Edit free draft");
    for (const bullet of PRO_UPGRADE_FREE_BULLETS) {
      expect(bullet.toLowerCase()).not.toMatch(/download/);
    }
    expect(STALE_PRO_CONVERSION_STRINGS.some((s) => s.toLowerCase().includes("download"))).toBe(true);
  });

  it("renders comparison card with column labels in component", () => {
    expect(card).toContain("PRO_UPGRADE_FREE_COLUMN_LABEL");
    expect(card).toContain("PRO_UPGRADE_PRO_COLUMN_LABEL");
    expect(card).toContain("PRO_UPGRADE_CARD_HEADING");
    expect(card).toContain("PRO_UPGRADE_FREE_COLUMN_HELPER");
    expect(card).toContain("ProConversionComparisonCard");
    expect(card).toContain("ProImprovedSummary");
    expect(card).not.toContain("ProTransformationPreview");
    expect(card).toContain("pro-conversion-comparison-card");
    expect(card.toLowerCase()).not.toMatch(/download/);
  });
});

describe("AgreementBuilderIntake Pro conversion (static)", () => {
  it("uses unified comparison card and conversion logs", () => {
    expect(intake).toContain("ProConversionComparisonCard");
    expect(intake).toContain("logProConversionCardVisible");
    expect(intake).toContain("logProConversionPrimaryClick");
    expect(intake).toContain("logProConversionEditFreeClick");
    expect(intake).toContain("logProConversionKeepFreeClick");
    expect(intake).not.toContain("Ready to share or sign?");
  });

  it("hides sticky bar when pro conversion card is visible on free track", () => {
    expect(intake).toContain("hideStickyForStarterProContinuation");
    expect(intake).toMatch(/hideStickyForStarterProContinuation[\s\S]*showStarterProRefineUpsell/);
  });

  it("routes edit and keep free actions without checkout or recipients", () => {
    expect(intake).toContain('logProConversionEditFreeClick("starter_pro_refine_card")');
    expect(intake).toContain('performKeepReviewingFocus("pro_card_edit_draft")');
    expect(intake).toContain('logProConversionKeepFreeClick("starter_pro_refine_card")');
    expect(intake).toContain('case "keep_reviewing"');
    expect(intake).toContain("freeTrackBlocksRecipientAdvance");
    expect(intake).toContain("logFreeSendGatedToPro");
  });
});
