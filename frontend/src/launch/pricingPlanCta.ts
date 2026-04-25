import type { PricingCadence } from "./pricingCadenceStorage";

export function tierCheckoutButtonLabel(
  cadence: PricingCadence,
  context: "send_return" | "billing_default",
): string {
  const tail = context === "send_return" ? " and send agreement" : "";
  return cadence === "annual" ? `Start annual plan${tail}` : `Start monthly plan${tail}`;
}
