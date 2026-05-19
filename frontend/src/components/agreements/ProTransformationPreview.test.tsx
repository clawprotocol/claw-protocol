/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EARN_CTA_START, EARN_HERO_TITLE } from "../../launch/simpleProduct/proConversionCopy";
import {
  PRO_CAN_TIGHTEN_BULLETS,
  PRO_CAN_TIGHTEN_FOOTNOTE,
  PRO_CAN_TIGHTEN_HEADING,
  STALE_PRO_TRANSFORMATION_PREVIEW_STRINGS,
  STALE_PRO_IMPROVED_SECTION_LABEL,
} from "../../launch/simpleProduct/proTransformationCopy";
import { ProTransformationPreview } from "./ProTransformationPreview";

const draft = readFileSync(join(__dirname, "StarterDraftDocumentSurface.tsx"), "utf8");
const card = readFileSync(join(__dirname, "ProConversionComparisonCard.tsx"), "utf8");
const opportunity = readFileSync(join(__dirname, "../../launch/affiliate/ClawOpportunityPage.tsx"), "utf8");

describe("ProTransformationPreview", () => {
  it("renders compact tighten value block without fake contract sample", () => {
    render(<ProTransformationPreview />);
    expect(screen.getByTestId("pro-upgrade-value-block")).toBeTruthy();
    expect(screen.getByText(PRO_CAN_TIGHTEN_HEADING)).toBeTruthy();
    for (const bullet of PRO_CAN_TIGHTEN_BULLETS) {
      expect(screen.getByText(bullet)).toBeTruthy();
    }
    expect(screen.getByText(PRO_CAN_TIGHTEN_FOOTNOTE)).toBeTruthy();
    for (const stale of STALE_PRO_TRANSFORMATION_PREVIEW_STRINGS) {
      expect(document.body.textContent).not.toContain(stale);
    }
  });

  it("uses value-block styling separate from agreement paper", () => {
    const src = readFileSync(join(__dirname, "ProTransformationPreview.tsx"), "utf8");
    expect(src).toContain("pro-upgrade-value-block");
    expect(src).not.toContain('variant="paper"');
    expect(src).not.toContain("font-serif");
    expect(STALE_PRO_IMPROVED_SECTION_LABEL).toBe("Pro improved this section");
    expect(src).not.toContain(STALE_PRO_IMPROVED_SECTION_LABEL);
  });

  it("renders only on Pro conversion card, not inside free draft document", () => {
    expect(card).toContain("ProTransformationPreview");
    expect(card).not.toContain("ProImprovedSummary");
    expect(draft).not.toContain("ProTransformationPreview");
    expect(draft).not.toContain("pro-upgrade-value-block");
  });
});

describe("Genesis Dogs partner page (static)", () => {
  it("uses Genesis Dogs partner framing with minimal app shell nav", () => {
    expect(opportunity).toContain("EARN_HERO_TITLE");
    expect(EARN_HERO_TITLE).toBe("Genesis Dogs Partner Access");
    expect(opportunity).toContain('navMode="minimal"');
    expect(opportunity).toContain("compactFooter");
    expect(opportunity).not.toContain("Doginal Dog holders");
    expect(opportunity).not.toContain("Start earning");
    expect(opportunity).toContain("EARN_CTA_START");
    expect(EARN_CTA_START).toBe("Request partner access");
    expect(opportunity).toContain("overflow-x-hidden");
  });
});
