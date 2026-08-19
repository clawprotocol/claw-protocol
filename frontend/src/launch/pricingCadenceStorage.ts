export type PricingCadence = "monthly" | "annual";

const STORAGE_KEY = "claw_pricing_cadence";

export function getPricingCadencePreference(): PricingCadence {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v === "monthly" || v === "annual") return v;
  } catch {
    /* ignore */
  }
  // Paid-beta default: monthly. Annual requires affirmative selection.
  return "monthly";
}

export function setPricingCadencePreference(c: PricingCadence): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, c);
  } catch {
    /* ignore */
  }
}
