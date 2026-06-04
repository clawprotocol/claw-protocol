import { describe, expect, it } from "vitest";
import {
  buildPaidProNormalizedSurfaceDiffPayload,
  classifyPaidProNormalizedSurfaceDiff,
} from "./paidProNormalizedSurfaceDiff";

describe("paidProNormalizedSurfaceDiff", () => {
  it("classifies trailing whitespace-only drift as whitespace_only", () => {
    const canonical = "Alpha agreement.\n\nIN WITNESS WHEREOF.\n";
    const normalized = `${canonical}   \n`;
    expect(classifyPaidProNormalizedSurfaceDiff(canonical, normalized)).toBe("whitespace_only");
    const payload = buildPaidProNormalizedSurfaceDiffPayload({
      surface: "review",
      canonicalText: canonical,
      normalizedText: normalized,
    });
    expect(payload.classification).toBe("whitespace_only");
    expect(payload.lenDelta).toBeGreaterThan(0);
  });

  it("classifies underscore signature line width drift separately from substantive edits", () => {
    const canonical = "Name: Jane Doe\nTitle: CEO\nSignature: _______________";
    const normalized = "Name: Jane Doe\nTitle: CEO\nSignature: _________________________";
    expect(classifyPaidProNormalizedSurfaceDiff(canonical, normalized)).toBe(
      "signature_line_width_only",
    );
  });

  it("flags substantive clause removal", () => {
    const canonical = "Section 1. Fee is $8,500.\nSection 2. Delaware law governs.";
    const normalized = "Section 1. Fee is $8,500.";
    expect(classifyPaidProNormalizedSurfaceDiff(canonical, normalized)).toBe("substantive");
    const payload = buildPaidProNormalizedSurfaceDiffPayload({
      surface: "copy",
      canonicalText: canonical,
      normalizedText: normalized,
    });
    expect(payload.firstDiffOffset).not.toBeNull();
    expect(payload.removedSnippet).toMatch(/Delaware/i);
  });
});
