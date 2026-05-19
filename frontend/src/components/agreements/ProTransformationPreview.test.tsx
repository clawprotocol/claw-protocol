import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRO_TRANSFORMATION_PREVIEW_FOOTNOTE,
  PRO_TRANSFORMATION_PREVIEW_LABEL,
  PRO_TRANSFORMATION_PREVIEW_SAMPLE,
} from "../../launch/simpleProduct/proTransformationCopy";

const preview = readFileSync(join(__dirname, "ProTransformationPreview.tsx"), "utf8");

describe("ProTransformationPreview (static)", () => {
  it("renders preview label, sample snippet, and preview-only footnote from copy module", () => {
    expect(preview).toContain("PRO_TRANSFORMATION_PREVIEW_LABEL");
    expect(preview).toContain("PRO_TRANSFORMATION_PREVIEW_SAMPLE");
    expect(preview).toContain("PRO_TRANSFORMATION_PREVIEW_FOOTNOTE");
    expect(preview).toContain('data-testid="pro-transformation-preview"');
    expect(PRO_TRANSFORMATION_PREVIEW_LABEL).toBe("Pro improved this section");
    expect(PRO_TRANSFORMATION_PREVIEW_SAMPLE).toContain("Parties");
    expect(PRO_TRANSFORMATION_PREVIEW_FOOTNOTE).toMatch(/preview only/i);
  });

  it("supports paper and dark variants without exposing full draft unlock", () => {
    expect(preview).toContain('variant === "paper"');
    expect(preview.toLowerCase()).not.toMatch(/full pro draft download|unlock entire agreement/i);
  });
});
