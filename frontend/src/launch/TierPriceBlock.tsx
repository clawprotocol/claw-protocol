import type { LaunchPricingTier } from "./pricingTiersData";
import type { PricingCadence } from "./pricingCadenceStorage";
import { formatMoneyUsdWhole, annualPrepayUsd } from "./pricingKeyMath";

export function TierPriceBlock(props: {
  tier: LaunchPricingTier;
  cadence: PricingCadence;
  density?: "default" | "compact";
}) {
  const { tier, cadence, density = "default" } = props;
  const top = density === "compact" ? "mt-2" : "mt-5";
  if (tier.monthlyPriceUsd == null) {
    return <p className={`${top} text-3xl font-semibold text-white`}>Let&apos;s talk</p>;
  }
  const m = tier.monthlyPriceUsd;
  const monthStr = formatMoneyUsdWhole(m);
  const yearStr = formatMoneyUsdWhole(annualPrepayUsd(m));
  if (cadence === "monthly") {
    return (
      <>
        <p className={`${top} text-2xl font-semibold text-white sm:text-3xl`}>
          {monthStr}
          <span className="text-base font-normal text-slate-400"> / month</span>
        </p>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">or {yearStr} / year when billed annually.</p>
      </>
    );
  }
  return (
    <>
      <p className={`${top} text-2xl font-semibold text-white sm:text-3xl`}>
        {yearStr}
        <span className="text-base font-normal text-slate-400"> / year</span>
      </p>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">or {monthStr} / month billed monthly.</p>
    </>
  );
}
