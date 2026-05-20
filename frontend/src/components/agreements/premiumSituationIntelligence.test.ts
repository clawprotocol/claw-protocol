import { describe, expect, it } from "vitest";
import {
  buildPremiumContradictionDocumentNote,
  buildPremiumReviewCardIntro,
  buildPremiumSituationProfile,
  detectPremiumSituationKind,
  resolveProReviewDocumentPanelHeading,
  softenProDocumentTone,
} from "./premiumSituationIntelligence";

describe("premiumSituationIntelligence", () => {
  it("detects creator and settlement situations", () => {
    expect(detectPremiumSituationKind("paid TikTok package for skincare brand")).toBe("creator");
    expect(detectPremiumSituationKind("mutual release after partnership split")).toBe("settlement");
  });

  it("builds executive framing for SaaS", () => {
    const p = buildPremiumSituationProfile("B2B SaaS subscription $49/mo stripe");
    expect(p.kind).toBe("saas");
    expect(p.executiveLine).toMatch(/Software/i);
  });

  it("acknowledges contradictions in document note without alarm", () => {
    const note = buildPremiumContradictionDocumentNote(
      "non-exclusive license but exclusive in North America forever",
    );
    expect(note).toMatch(/exclusive/i);
    expect(note).not.toMatch(/ERROR|FAIL/i);
  });

  it("softens aggressive litigation phrasing", () => {
    const out = softenProDocumentTone("Party shall be prosecuted to the fullest extent of the law.");
    expect(out).toMatch(/remedies permitted/i);
    expect(out).not.toMatch(/fullest extent/i);
  });

  it("uses agreement title for panel heading when substantive", () => {
    expect(resolveProReviewDocumentPanelHeading("consulting", "Master Services Agreement")).toBe(
      "Master Services Agreement",
    );
  });

  it("uses calm framing for emotional high-stakes intake", () => {
    const p = buildPremiumSituationProfile("my ex cofounder is ghosting me scared he'll steal clients");
    expect(p.situationLabel).toBe("Sensitive arrangement");
    expect(p.executiveLine).toMatch(/Neutral/i);
    expect(p.executiveLine).not.toMatch(/sue|destroy/i);
  });

  it("builds review card intro combining situation and contradiction", () => {
    const intro = buildPremiumReviewCardIntro(
      "influencer deal 3 posts, non-exclusive but exclusive in US, $2k",
    );
    expect(intro).toMatch(/creator|brand/i);
    expect(intro).toMatch(/exclusive|different directions|adjust/i);
  });
});
