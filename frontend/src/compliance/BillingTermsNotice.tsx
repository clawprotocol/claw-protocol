import {
  DISCLOSURE_COPY,
  DOWNGRADE_ACCESS_SHORT,
  PAID_ANNUAL_SUBSCRIPTION_MATERIAL_SHORT,
  PAID_MONTHLY_SUBSCRIPTION_MATERIAL_SHORT,
  TAX_VAT_LOCATION_NEUTRAL,
} from "./disclosureCopy";
import { SpaLink } from "../launch/SpaLink";

/**
 * Narrow billing context — not primary pricing UI; keeps renewal / allowance language honest.
 */
export function BillingTermsNotice() {
  return (
    <section
      className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-4 text-left"
      aria-labelledby="billing-terms-heading"
    >
      <h2 id="billing-terms-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Billing &amp; allowances
      </h2>
      <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-400">
        <li>Prices follow the billing interval you choose at checkout (monthly or annual unless stated otherwise).</li>
        <li>{PAID_MONTHLY_SUBSCRIPTION_MATERIAL_SHORT}</li>
        <li>{PAID_ANNUAL_SUBSCRIPTION_MATERIAL_SHORT}</li>
        <li>
          To cancel, change plans, or update payment, contact{" "}
          <a
            href="mailto:support@lawdog.me"
            className="font-medium text-emerald-400/95 underline-offset-2 hover:text-emerald-300 hover:underline"
          >
            support@lawdog.me
          </a>
          .
        </li>
        <li>{DOWNGRADE_ACCESS_SHORT}</li>
        <li>Included capacity resets each billing period; unused capacity does not roll over unless stated at purchase.</li>
        <li>
          Heavy use beyond included capacity may incur additional charges per your order summary — not represented on the cards above.
        </li>
        <li>{TAX_VAT_LOCATION_NEUTRAL}</li>
      </ul>
      <p className="mt-3 text-xs text-slate-500">{DISCLOSURE_COPY.pricingNoGuarantee}</p>
      <nav
        className="mt-4 flex flex-wrap gap-x-3 gap-y-2 border-t border-slate-800/60 pt-3 text-xs"
        aria-label="Terms and privacy"
      >
        <SpaLink
          to="/terms"
          className="font-medium text-emerald-400/95 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Terms of Service
        </SpaLink>
        <SpaLink
          to="/privacy"
          className="font-medium text-emerald-400/95 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Privacy Policy
        </SpaLink>
        <SpaLink
          to="/privacy#privacy-contact"
          className="font-medium text-emerald-400/95 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Data &amp; privacy requests
        </SpaLink>
        <SpaLink
          to="/privacy#privacy-cookies-choices"
          className="font-medium text-emerald-400/95 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Cookie &amp; storage choices
        </SpaLink>
      </nav>
    </section>
  );
}
