import { describe, expect, it } from "vitest";
import {
  STARTER_GOVERNING_LAW_DISPLAY_FALLBACK,
  compressProseForStarterScope,
  isJurisdictionDisplayLowConfidence,
  sanitizeJurisdictionForStarterGoverningLaw,
} from "./starterAgreementPreviewNormalize";

describe("starterAgreementPreviewNormalize", () => {
  it("flags nonsense jurisdiction fragments", () => {
    expect(isJurisdictionDisplayLowConfidence("Their Lobby")).toBe(true);
    expect(isJurisdictionDisplayLowConfidence("Delaware")).toBe(false);
    expect(isJurisdictionDisplayLowConfidence("TX")).toBe(false);
  });

  it("sanitizes low-confidence jurisdiction to calm copy", () => {
    expect(sanitizeJurisdictionForStarterGoverningLaw("Their Lobby")).toBe(STARTER_GOVERNING_LAW_DISPLAY_FALLBACK);
    expect(sanitizeJurisdictionForStarterGoverningLaw("Texas")).toBe("Texas");
  });

  it("compresses long scope prose", () => {
    const long = "word ".repeat(120).trim();
    const out = compressProseForStarterScope(long, 120);
    expect(out.length).toBeLessThanOrEqual(125);
    expect(out.endsWith("…")).toBe(true);
  });
});
