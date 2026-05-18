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

  it("example chips populate textarea only", () => {
    expect(page).toContain("logHomeExampleSelected");
    const chipBlock = page.slice(page.indexOf("HOME_EXAMPLE_PROMPTS.map"), page.indexOf("HOME_EXAMPLE_PROMPTS.map") + 700);
    expect(chipBlock).toContain("setHeroInput(ex.text)");
    expect(chipBlock).not.toContain("navigate(");
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

  it("keeps legal footer disclosures", () => {
    expect(page).toContain("DisclosureFooter");
    expect(page).toContain("NOT_LEGAL_ADVICE");
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
