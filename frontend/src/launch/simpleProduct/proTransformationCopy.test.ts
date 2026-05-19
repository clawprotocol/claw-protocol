import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHECKOUT_CARD_ACTIVATION_LINE,
  CHECKOUT_CARD_PROCESSING_LINE,
  CHECKOUT_PRO_CONTEXT_LINES,
  CHECKOUT_PRO_CONTEXT_TITLE,
  PRO_CAN_TIGHTEN_BULLETS,
  PRO_CAN_TIGHTEN_FOOTNOTE,
  PRO_CAN_TIGHTEN_HEADING,
  STALE_CHECKOUT_PRO_HELPS_BULLETS,
  STALE_PRO_TRANSFORMATION_PREVIEW_STRINGS,
} from "./proTransformationCopy";

const TRANSFORMATION_SURFACE_PATHS: readonly string[] = [
  join(__dirname, "../../components/agreements/ProConversionComparisonCard.tsx"),
  join(__dirname, "../../components/agreements/ProTransformationPreview.tsx"),
  join(__dirname, "../../components/agreements/StarterDraftDocumentSurface.tsx"),
  join(__dirname, "../../components/agreements/AgreementCompletionCheckoutContext.tsx"),
  join(__dirname, "SimpleCheckoutPage.tsx"),
];

describe("proTransformationCopy", () => {
  it("exports compact pro-tighten value copy without fake sample parties", () => {
    expect(PRO_CAN_TIGHTEN_HEADING).toBe("What Pro can tighten");
    expect(PRO_CAN_TIGHTEN_BULLETS).toHaveLength(4);
    expect(PRO_CAN_TIGHTEN_BULLETS.join(" ").toLowerCase()).not.toMatch(/ai-powered|guarantee/);
    expect(PRO_CAN_TIGHTEN_FOOTNOTE).toMatch(/review the Pro version before anything is sent or signed/i);
    for (const stale of STALE_PRO_TRANSFORMATION_PREVIEW_STRINGS) {
      expect(PRO_CAN_TIGHTEN_BULLETS.join(" ")).not.toContain(stale);
      expect(PRO_CAN_TIGHTEN_FOOTNOTE).not.toContain(stale);
    }
  });

  it("exports compressed checkout context and warmer payment lines", () => {
    expect(CHECKOUT_PRO_CONTEXT_TITLE).toBe("Pro for this agreement");
    expect(CHECKOUT_PRO_CONTEXT_LINES.length).toBeGreaterThanOrEqual(2);
    expect(CHECKOUT_CARD_PROCESSING_LINE).toBe("Payments are processed securely.");
    expect(CHECKOUT_CARD_ACTIVATION_LINE).toMatch(/activates after payment/i);
  });

  it("primary surfaces wire transformation value block, not fake sample", () => {
    const card = readFileSync(
      join(__dirname, "../../components/agreements/ProConversionComparisonCard.tsx"),
      "utf8",
    );
    expect(card).toContain("ProTransformationPreview");
    expect(card).not.toContain("ProImprovedSummary");
    expect(card).toContain("pro-conversion-comparison-card");

    const draft = readFileSync(
      join(__dirname, "../../components/agreements/StarterDraftDocumentSurface.tsx"),
      "utf8",
    );
    expect(draft).not.toContain("ProTransformationPreview");
    expect(draft).not.toContain("pro-upgrade-value-block");
  });

  it("does not expose full pro draft unlock language on conversion surfaces", () => {
    for (const path of TRANSFORMATION_SURFACE_PATHS) {
      const src = readFileSync(path, "utf8");
      expect(src.toLowerCase()).not.toMatch(/full pro draft download|unlock entire agreement/i);
      for (const stale of STALE_PRO_TRANSFORMATION_PREVIEW_STRINGS) {
        expect(src.includes(stale), `${path} must not include "${stale}"`).toBe(false);
      }
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
