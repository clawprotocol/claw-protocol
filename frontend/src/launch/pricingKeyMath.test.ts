import { describe, expect, it } from "vitest";
import { annualPrepayUsd, annualSavingsVsMonthlyUsd, formatMoneyUsdWhole } from "./pricingKeyMath";

describe("pricingKeyMath", () => {
  it("formats whole USD", () => {
    expect(formatMoneyUsdWhole(1000)).toMatch(/1,000/);
  });

  it("annual prepay equals 10 months list (two months free)", () => {
    expect(annualPrepayUsd(1000)).toBe(10_000);
    expect(annualPrepayUsd(10_000)).toBe(100_000);
  });

  it("annual savings vs twelve monthlies is two month list prices", () => {
    expect(annualSavingsVsMonthlyUsd(1000)).toBe(2000);
    expect(annualSavingsVsMonthlyUsd(10_000)).toBe(20_000);
  });
});
