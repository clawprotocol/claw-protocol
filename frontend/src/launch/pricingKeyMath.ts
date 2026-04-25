import type { LaunchPricingTier } from "./pricingTiersData";
import type { PricingCadence } from "./pricingCadenceStorage";

/** Whole-dollar USD for display (e.g. $1,000). */
export function formatMoneyUsdWhole(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** One upfront annual charge = 10 monthly installments (two months comped vs paying monthly × 12). */
export function annualPrepayUsd(monthlyUsd: number): number {
  return monthlyUsd * 10;
}

/** Versus 12 separate monthly payments at list price. */
export function annualSavingsVsMonthlyUsd(monthlyUsd: number): number {
  return monthlyUsd * 12 - annualPrepayUsd(monthlyUsd);
}

export function tierAnnualPrepayUsd(tier: LaunchPricingTier): number | null {
  if (tier.monthlyPriceUsd == null) return null;
  return annualPrepayUsd(tier.monthlyPriceUsd);
}

export function tierAnnualSavingsPhrase(tier: LaunchPricingTier): string | null {
  if (tier.monthlyPriceUsd == null) return null;
  const s = annualSavingsVsMonthlyUsd(tier.monthlyPriceUsd);
  return `Save ~${formatMoneyUsdWhole(s)} annually`;
}

/** Invoice amount for checkout (monthly cycle vs annual prepay). */
export function checkoutInvoiceUsd(tier: LaunchPricingTier, cadence: PricingCadence): number | null {
  if (tier.monthlyPriceUsd == null) return null;
  return cadence === "annual" ? annualPrepayUsd(tier.monthlyPriceUsd) : tier.monthlyPriceUsd;
}

/** Display stablecoin units as 1:1 USD. */
export function formatStablecoinFromUsd(amountUsd: number): string {
  return amountUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
