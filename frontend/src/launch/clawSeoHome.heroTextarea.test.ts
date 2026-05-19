import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(__dirname, "LaunchHomePage.tsx"), "utf8");
const css = readFileSync(join(__dirname, "clawSeoHome.css"), "utf8");

describe("homepage hero textarea mobile readability (static)", () => {
  it("uses mic clearance padding and gutter-only fade markup", () => {
    expect(page).toContain("pb-16");
    expect(page).toContain("pr-16");
    expect(page).toContain("claw-seo-hero-intake-fade--gutter");
    expect(page).toContain('data-testid="hero-intake-bottom-fade"');
    expect(page).not.toContain("bottom-12 h-5");
  });

  it("hides decorative fade in CSS below 480px", () => {
    expect(css).toContain("claw-seo-hero-intake-fade--gutter");
    expect(css).toMatch(/max-width:\s*479px/);
    expect(css).toContain("display: none");
  });

  it("uses restrained hero input focus and tertiary example chips", () => {
    expect(page).toContain("data-height-tier");
    expect(page).toContain("claw-seo-example-chip");
    expect(css).toMatch(/claw-seo-input:focus[\s\S]*94a3b8/);
    expect(css).toContain("claw-seo-example-chip");
  });
});
