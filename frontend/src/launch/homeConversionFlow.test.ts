import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { meetsHomeDraftSubmitThreshold, logHomeCreateSubmit } from "./homeCreateSubmit";
import { HOME_EXAMPLE_PROMPTS, logHomeExampleSelected } from "./homeExamplePrompts";
import {
  HOMEPAGE_HERO_TITLE,
  HOMEPAGE_WHAT_HAPPENS_NEXT_BULLETS,
  LAWDOG_VALUE_BULLETS,
  PRICING_SUBHEAD,
} from "./pricingContent";

const STALE_HOMEPAGE_STRINGS = [
  "real agreements instantly",
  "No legal complexity required",
  "Like DocuSign, but you don't have to trust it",
  "Turn drafts into real agreements instantly",
] as const;

describe("homeCreateSubmit", () => {
  it("requires minimum meaningful length", () => {
    expect(meetsHomeDraftSubmitThreshold("short")).toBe(false);
    expect(meetsHomeDraftSubmitThreshold("six ok")).toBe(true);
  });

  it("logs home-create-submit with starter_review target", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logHomeCreateSubmit("Services agreement between two parties for $5k.");
    expect(spy).toHaveBeenCalledWith(
      "[home-create-submit]",
      expect.objectContaining({
        source: "home_textarea_current_value",
        target: "starter_review",
      }),
    );
    spy.mockRestore();
  });
});

describe("homeExamplePrompts", () => {
  it("exposes three low-friction examples", () => {
    expect(HOME_EXAMPLE_PROMPTS.map((e) => e.label)).toEqual([
      "Services agreement",
      "Simple NDA",
      "Contractor agreement",
    ]);
  });

  it("logs example selection with input length", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logHomeExampleSelected("simple_nda", 42);
    expect(spy).toHaveBeenCalledWith("[home-example-selected]", {
      exampleKey: "simple_nda",
      inputLenAfter: 42,
    });
    spy.mockRestore();
  });
});

describe("LaunchHomePage routing (static)", () => {
  const page = readFileSync(join(__dirname, "LaunchHomePage.tsx"), "utf8");

  it("submits with text using heroAutoGenerate handoff", () => {
    expect(page).toContain("heroAutoGenerate: true");
    expect(page).toContain("logHomeCreateSubmit");
    expect(page).toContain("meetsHomeDraftSubmitThreshold");
    expect(page).not.toMatch(/navigate\("\/app\/create"[^)]*\)\s*;\s*\/\/\s*prefill only/i);
  });

  it("routes empty submit to clean create without autoGenerate", () => {
    expect(page).toContain("openCleanCreateIntake");
    expect(page).toContain('navigate("/app/create")');
  });

  it("uses responsive grid for hero CTAs without flex-row width collapse", () => {
    expect(page).toContain("claw-seo-hero-cta-grid");
    expect(page).toContain('data-testid="hero-cta-row"');
    expect(page).toContain("grid-cols-1");
    expect(page).toContain("sm:grid-cols-2");
    expect(page).toContain("claw-seo-hero-cta-primary");
    expect(page).toContain("claw-seo-hero-cta-secondary");
    expect(page).not.toContain("sm:flex-row sm:items-center sm:gap-3");
    expect(page).not.toMatch(/claw-seo-btn-primary[\s\S]{0,200}flex-1/);
    expect(page).not.toContain("sm:min-w-[10.5rem]");
    expect(page).not.toContain("sm:flex-none");
    const ctaBlock = page.slice(page.indexOf("hero-cta-row"), page.indexOf("hero-cta-row") + 900);
    expect(ctaBlock).toContain("min-w-0");
  });

  it("example chips populate textarea only and sit below primary CTA", () => {
    expect(page).toContain("logHomeExampleSelected");
    const chipBlock = page.slice(page.indexOf("HOME_EXAMPLE_PROMPTS.map"), page.indexOf("HOME_EXAMPLE_PROMPTS.map") + 700);
    expect(chipBlock).toContain("setHeroInput(ex.text)");
    expect(chipBlock).toContain("claw-seo-example-chip");
    expect(chipBlock).not.toContain("navigate(");
    const ctaIdx = page.indexOf("claw-seo-btn-primary");
    const chipIdx = page.indexOf("claw-seo-example-chip");
    expect(ctaIdx).toBeGreaterThan(0);
    expect(chipIdx).toBeGreaterThan(ctaIdx);
  });

  it("uses simplified hero copy constants", () => {
    expect(page).toContain("HOMEPAGE_HERO_TITLE");
    expect(HOMEPAGE_HERO_TITLE).toBe("Create. Review. Send. Prove.");
    expect(page).toContain("HOMEPAGE_CTA_CREATE_FREE_DRAFT");
    expect(HOMEPAGE_WHAT_HAPPENS_NEXT_BULLETS[0]).toBe("Describe or upload");
  });

  it("does not include stale marketing strings", () => {
    for (const stale of STALE_HOMEPAGE_STRINGS) {
      expect(page.includes(stale), `LaunchHomePage must not include "${stale}"`).toBe(false);
    }
    for (const stale of STALE_HOMEPAGE_STRINGS) {
      expect(PRICING_SUBHEAD.includes(stale), `PRICING_SUBHEAD must not include "${stale}"`).toBe(false);
    }
    for (const stale of STALE_HOMEPAGE_STRINGS) {
      const hit = LAWDOG_VALUE_BULLETS.some((b) => b.includes(stale));
      expect(hit, `LAWDOG_VALUE_BULLETS must not include "${stale}"`).toBe(false);
    }
  });

  it("keeps legal footer disclosures with compressed mobile footer", () => {
    expect(page).toContain("DisclosureFooter");
    expect(page).toContain("NOT_LEGAL_ADVICE");
    expect(page).toContain("claw-seo-cta-legal");
    expect(page).toMatch(/DisclosureFooter[\s\S]*slim/);
  });

  it("uses responsive auto-resize textarea with smart-intake styling", () => {
    expect(page).toContain("useAutoResizeTextarea");
    expect(page).toContain("useResponsiveTextareaMaxPx");
    expect(page).toContain("HOMEPAGE_TEXTAREA_LARGE_LINE_THRESHOLD");
    expect(page).toContain('rows={3}');
    expect(page).toContain("claw-seo-input--hero");
    expect(page).toContain("claw-seo-hero-intake-wrap");
    expect(page).toContain("claw-seo-hero-intake-fade--gutter");
    expect(page).toContain("heroTextareaShowFade");
    expect(page).toContain("hero-intake-bottom-fade");
    expect(page).toContain("heroBottomFadeOverlayEnabled");
    expect(page).toContain("Large agreement detected");
    expect(page).toContain("resize-none");
    expect(page).toContain("pb-16");
    expect(page).toContain("pr-16");
    expect(page).toContain("data-height-tier");
    expect(page).toContain("heroViewportWidth");
    expect(page).toContain("claw-seo-example-chip");
    expect(page).toContain("claw-seo-btn-secondary--quiet");
    expect(page).toContain("claw-seo-cta-legal");
    expect(page).toContain("overflow-x-hidden");
    expect(page).not.toContain("min-h-[6.5rem]");
    expect(page).not.toMatch(/textarea[\s\S]*max-h-/);
    const textareaBlock = page.slice(page.indexOf('id="claw-hero-intake"'), page.indexOf('id="claw-hero-intake"') + 900);
    expect(textareaBlock).not.toMatch(/className="[^"]*overflow-hidden/);
  });
});

describe("AgreementBuilderIntake home auto-generate (static)", () => {
  const intake = readFileSync(
    join(__dirname, "../components/agreements/AgreementBuilderIntake.tsx"),
    "utf8",
  );

  it("auto-runs parse for home_create_submit handoff", () => {
    expect(intake).toContain("homeHeroAutoGenerate");
    expect(intake).toContain('handoffSource: "home_create_submit"');
    expect(intake).toContain("logHomeCreateSubmit");
  });

  it("commits free review surface after local parse (homepage + timeout paths)", () => {
    expect(intake).toContain("commitFreeDraftForReview");
    expect(intake).toContain('source: fromHomeHandoff ? "home_create_submit" : "local_parse"');
    expect(intake).toContain('source: "basic_parse_timeout"');
    expect(intake).toContain("logFreeReviewSurfaceResolved");
    expect(intake).toContain("StarterDraftDocumentSurface");
    expect(intake).toContain("hideStickyForStarterProContinuation");
  });
});

describe("ClawOpportunityPage earn landing (static)", () => {
  const page = readFileSync(join(__dirname, "affiliate/ClawOpportunityPage.tsx"), "utf8");

  it("hides dashboard until Start earning", () => {
    expect(page).toContain("earnDetailsOpen");
    expect(page).toContain("EARN_CTA_START");
    const panelIdx = page.indexOf("<AffiliateDashboardPanel");
    const startIdx = page.indexOf("earnDetailsOpen");
    expect(panelIdx).toBeGreaterThan(startIdx);
  });
});
