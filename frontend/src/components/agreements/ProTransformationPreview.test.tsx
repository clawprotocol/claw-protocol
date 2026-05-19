import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EARN_CTA_START, EARN_HERO_TITLE } from "../../launch/simpleProduct/proConversionCopy";
import {
  PRO_CAN_IMPROVE_HEADING,
  PRO_TRANSFORMATION_PREVIEW_FOOTNOTE,
  PRO_TRANSFORMATION_PREVIEW_LABEL,
  PRO_TRANSFORMATION_PREVIEW_SAMPLE,
  STALE_PRO_IMPROVED_SECTION_LABEL,
} from "../../launch/simpleProduct/proTransformationCopy";

const preview = readFileSync(join(__dirname, "ProTransformationPreview.tsx"), "utf8");
const draft = readFileSync(join(__dirname, "StarterDraftDocumentSurface.tsx"), "utf8");
const card = readFileSync(join(__dirname, "ProConversionComparisonCard.tsx"), "utf8");
const opportunity = readFileSync(join(__dirname, "../../launch/affiliate/ClawOpportunityPage.tsx"), "utf8");

describe("ProTransformationPreview (static)", () => {
  it("uses upgrade teaser copy and styling separate from agreement paper", () => {
    expect(preview).toContain("PRO_CAN_IMPROVE_HEADING");
    expect(preview).toContain("pro-upgrade-teaser-preview");
    expect(preview).toContain("font-sans");
    expect(preview).not.toContain('variant="paper"');
    expect(preview).not.toContain("font-serif");
    expect(PRO_CAN_IMPROVE_HEADING).toBe("What Pro can improve");
    expect(PRO_TRANSFORMATION_PREVIEW_LABEL).toBe("Example upgrade preview");
    expect(PRO_TRANSFORMATION_PREVIEW_FOOTNOTE).toBe(
      "Preview only — your Pro agreement unlocks after upgrade.",
    );
    expect(PRO_TRANSFORMATION_PREVIEW_SAMPLE).toContain("Parties");
    expect(STALE_PRO_IMPROVED_SECTION_LABEL).toBe("Pro improved this section");
    expect(preview).not.toContain(STALE_PRO_IMPROVED_SECTION_LABEL);
  });

  it("renders only on Pro conversion card, not inside free draft document", () => {
    expect(card).toContain("ProTransformationPreview");
    expect(draft).not.toContain("ProTransformationPreview");
    expect(draft).not.toContain("pro-transformation-preview");
    expect(draft).not.toContain("pro-upgrade-teaser-preview");
  });
});

describe("Genesis Dogs partner page (static)", () => {
  it("uses Genesis Dogs partner framing without stale Doginal copy", () => {
    expect(opportunity).toContain("EARN_HERO_TITLE");
    expect(EARN_HERO_TITLE).toBe("Genesis Dogs Partner Access");
    expect(opportunity).toContain("compactFooter");
    expect(opportunity).not.toContain("Doginal Dog holders");
    expect(opportunity).not.toContain("Start earning");
    expect(opportunity).toContain("EARN_CTA_START");
    expect(EARN_CTA_START).toBe("Request partner access");
    expect(opportunity).toContain("overflow-x-hidden");
  });
});
