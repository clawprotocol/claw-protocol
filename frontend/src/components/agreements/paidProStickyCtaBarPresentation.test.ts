import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PAID_PRO_REVIEW_STICKY_BAR_SHELL_CLASS,
  PAID_PRO_REVIEW_STICKY_HELPER_CLASS,
  PAID_PRO_REVIEW_STICKY_PRIMARY_BUTTON_CLASS,
} from "./paidProStickyCtaBarPresentation";

describe("paidProStickyCtaBarPresentation", () => {
  it("uses light utility bar chrome instead of full-width emerald promo gradient", () => {
    expect(PAID_PRO_REVIEW_STICKY_BAR_SHELL_CLASS).toContain("bg-white");
    expect(PAID_PRO_REVIEW_STICKY_BAR_SHELL_CLASS).not.toMatch(/from-emerald-950/);
    expect(PAID_PRO_REVIEW_STICKY_BAR_SHELL_CLASS).toContain("pt-1.5");
  });

  it("de-emphasizes helper copy", () => {
    expect(PAID_PRO_REVIEW_STICKY_HELPER_CLASS).toMatch(/text-stone-500/);
    expect(PAID_PRO_REVIEW_STICKY_HELPER_CLASS).toMatch(/text-\[10px\]/);
    expect(PAID_PRO_REVIEW_STICKY_HELPER_CLASS).not.toMatch(/emerald/);
  });

  it("keeps primary button accessible with reduced height vs default sticky CTA", () => {
    expect(PAID_PRO_REVIEW_STICKY_PRIMARY_BUTTON_CLASS).toContain("min-h-[2.75rem]");
    expect(PAID_PRO_REVIEW_STICKY_PRIMARY_BUTTON_CLASS).not.toContain("min-h-[3.35rem]");
    expect(PAID_PRO_REVIEW_STICKY_PRIMARY_BUTTON_CLASS).toContain("bg-emerald-600");
  });

  it("intake wires utility bar flag and presentation classes on paid Pro sticky bar", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("paidProReviewUtilityStickyBar");
    expect(intake).toContain("data-paid-pro-review-utility-bar");
    expect(intake).toContain("PAID_PRO_REVIEW_STICKY_BAR_SHELL_CLASS");
    expect(intake).toContain("PAID_PRO_REVIEW_STICKY_HELPER_CLASS");
    expect(intake).toContain("PAID_PRO_REVIEW_STICKY_PRIMARY_BUTTON_CLASS");
  });

  it("defines fade transition classes for delayed reveal", () => {
    const presentation = readFileSync(join(__dirname, "paidProStickyCtaBarPresentation.ts"), "utf8");
    expect(presentation).toContain("duration-200");
    expect(presentation).toContain("motion-reduce:transition-none");
    expect(presentation).toContain("focus-within:opacity-100");
  });
});
