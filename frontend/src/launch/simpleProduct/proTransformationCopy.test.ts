import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHECKOUT_CARD_ACTIVATION_LINE,
  CHECKOUT_CARD_PROCESSING_LINE,
  CHECKOUT_PRO_CONTEXT_LINES,
  CHECKOUT_PRO_CONTEXT_TITLE,
  PRO_IMPROVED_BULLETS,
  PRO_IMPROVED_HEADING,
  PRO_TRANSFORMATION_PREVIEW_FOOTNOTE,
  PRO_TRANSFORMATION_PREVIEW_LABEL,
  PRO_TRANSFORMATION_PREVIEW_SAMPLE,
  STALE_CHECKOUT_PRO_HELPS_BULLETS,
} from "./proTransformationCopy";

const TRANSFORMATION_SURFACE_PATHS: readonly string[] = [
  join(__dirname, "../../components/agreements/ProConversionComparisonCard.tsx"),
  join(__dirname, "../../components/agreements/ProImprovedSummary.tsx"),
  join(__dirname, "../../components/agreements/ProTransformationPreview.tsx"),
  join(__dirname, "../../components/agreements/StarterDraftDocumentSurface.tsx"),
  join(__dirname, "../../components/agreements/AgreementCompletionCheckoutContext.tsx"),
  join(__dirname, "SimpleCheckoutPage.tsx"),
];

describe("proTransformationCopy", () => {
  it("exports compact pro-improved summary and preview cue copy", () => {
    expect(PRO_IMPROVED_HEADING).toBe("What Pro can improve");
    expect(PRO_IMPROVED_BULLETS).toHaveLength(5);
    expect(PRO_IMPROVED_BULLETS.join(" ").toLowerCase()).not.toMatch(/ai-powered|guarantee/);
    expect(PRO_TRANSFORMATION_PREVIEW_LABEL).toBe("Example upgrade preview");
    expect(PRO_TRANSFORMATION_PREVIEW_SAMPLE.length).toBeGreaterThan(40);
    expect(PRO_TRANSFORMATION_PREVIEW_FOOTNOTE).toMatch(/preview only/i);
  });

  it("exports compressed checkout context and warmer payment lines", () => {
    expect(CHECKOUT_PRO_CONTEXT_TITLE).toBe("Pro for this agreement");
    expect(CHECKOUT_PRO_CONTEXT_LINES.length).toBeGreaterThanOrEqual(2);
    expect(CHECKOUT_CARD_PROCESSING_LINE).toBe("Payments are processed securely.");
    expect(CHECKOUT_CARD_ACTIVATION_LINE).toMatch(/activates after payment/i);
  });

  it("primary surfaces wire transformation preview and improved summary", () => {
    const card = readFileSync(
      join(__dirname, "../../components/agreements/ProConversionComparisonCard.tsx"),
      "utf8",
    );
    expect(card).toContain("ProImprovedSummary");
    expect(card).toContain("ProTransformationPreview");
    expect(card).toContain("pro-conversion-comparison-card");

    const draft = readFileSync(
      join(__dirname, "../../components/agreements/StarterDraftDocumentSurface.tsx"),
      "utf8",
    );
    expect(draft).not.toContain("ProTransformationPreview");
    expect(draft).not.toContain("pro-upgrade-teaser-preview");
  });

  it("does not expose full pro draft unlock language on conversion surfaces", () => {
    for (const path of TRANSFORMATION_SURFACE_PATHS) {
      const src = readFileSync(path, "utf8");
      expect(src.toLowerCase()).not.toMatch(/full pro draft download|unlock entire agreement/i);
    }
  });

  it("checkout context and page avoid stale long LawDog Pro helps bullets", () => {
    for (const path of [
      join(__dirname, "../../components/agreements/AgreementCompletionCheckoutContext.tsx"),
      join(__dirname, "SimpleCheckoutPage.tsx"),
    ]) {
      const src = readFileSync(path, "utf8");
      for (const stale of STALE_CHECKOUT_PRO_HELPS_BULLETS) {
        expect(src.includes(stale), `${path} must not include "${stale}"`).toBe(false);
      }
      expect(src).not.toContain("Use your card on file with your payment provider");
    }
  });
});
