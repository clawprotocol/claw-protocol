import { useEffect } from "react";
import {
  CHECKOUT_AFTER_PAYMENT_STEPS,
  CHECKOUT_ANNUAL_RENEWAL_COPY,
  CHECKOUT_HUMAN_SUPPORT_LINE,
  CHECKOUT_LEGAL_DISCLAIMER,
  CHECKOUT_SECURE_MICROCOPY,
  CHECKOUT_SUPPORT_EMAIL,
  CHECKOUT_TRUST_STRIP_ITEMS,
  logCheckoutTrustCopyRendered,
} from "./checkoutTrustCopy";

type Props = {
  surface: string;
  cadence?: "monthly" | "annual";
  showAnnualRenewal?: boolean;
  className?: string;
};

export function CheckoutTrustPanel({ surface, cadence, showAnnualRenewal, className }: Props) {
  useEffect(() => {
    logCheckoutTrustCopyRendered(surface);
  }, [surface]);

  const supportParts = CHECKOUT_HUMAN_SUPPORT_LINE.split(CHECKOUT_SUPPORT_EMAIL);

  return (
    <div
      className={["min-w-0 space-y-4", className].filter(Boolean).join(" ")}
      data-testid="checkout-trust-panel"
    >
      <p className="text-sm leading-7 text-slate-300 sm:text-[15px]">{CHECKOUT_SECURE_MICROCOPY}</p>

      <ul
        className="grid grid-cols-1 gap-2 text-sm leading-snug text-slate-200 min-[480px]:grid-cols-2 sm:gap-2.5"
        aria-label="Checkout trust guarantees"
        data-testid="checkout-trust-strip"
      >
        {CHECKOUT_TRUST_STRIP_ITEMS.map((item) => (
          <li key={item} className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 shrink-0 text-emerald-400" aria-hidden>
              ✓
            </span>
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>

      <div
        className="rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-3 sm:px-4"
        aria-label="After payment"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">After payment</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-7 text-slate-300">
          {CHECKOUT_AFTER_PAYMENT_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      {showAnnualRenewal && cadence === "annual" ? (
        <p className="text-sm leading-7 text-slate-400">{CHECKOUT_ANNUAL_RENEWAL_COPY}</p>
      ) : null}

      <p className="text-sm leading-7 text-slate-400">
        {supportParts[0]}
        <a
          href={`mailto:${CHECKOUT_SUPPORT_EMAIL}`}
          className="font-medium text-emerald-400 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          {CHECKOUT_SUPPORT_EMAIL}
        </a>
        .
      </p>

      <p className="text-xs leading-relaxed text-slate-500 sm:text-sm">{CHECKOUT_LEGAL_DISCLAIMER}</p>
    </div>
  );
}
