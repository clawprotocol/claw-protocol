import { useEffect } from "react";
import {
  CHECKOUT_AFTER_PAYMENT_LABEL,
  CHECKOUT_AFTER_PAYMENT_STEPS,
  CHECKOUT_ANNUAL_RENEWAL_COPY,
  CHECKOUT_DRAFT_SAVED_LINE,
  CHECKOUT_HUMAN_SUPPORT_LINE,
  CHECKOUT_LEGAL_DISCLAIMER,
  CHECKOUT_PROOF_VERIFICATION_LINE,
  CHECKOUT_PROOF_VERIFICATION_SUBLINE,
  CHECKOUT_SECURE_MICROCOPY,
  CHECKOUT_SUPPORT_EMAIL,
  CHECKOUT_TRUST_STRIP_ITEMS,
  CHECKOUT_USED_FOR_LINE,
  CHECKOUT_WHY_BUSINESSES_BULLETS,
  CHECKOUT_WHY_BUSINESSES_HEADING,
  CHECKOUT_WORKFLOW_PAYMENT_NOTE,
  CHECKOUT_WORKFLOW_STEPS,
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
      className={["min-w-0 space-y-3", className].filter(Boolean).join(" ")}
      data-testid="checkout-trust-panel"
    >
      <p className="text-sm leading-relaxed text-slate-300 sm:text-[15px]">{CHECKOUT_SECURE_MICROCOPY}</p>

      <div className="min-w-0 space-y-1" data-testid="checkout-workflow-cue">
        <nav
          className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500 sm:text-xs"
          aria-label="Agreement workflow"
        >
          {CHECKOUT_WORKFLOW_STEPS.map((step, index) => (
            <span key={step} className="inline-flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <span className="text-slate-600" aria-hidden>
                  →
                </span>
              ) : null}
              <span className="break-words">{step}</span>
            </span>
          ))}
        </nav>
        <p className="text-xs leading-snug text-slate-500">{CHECKOUT_WORKFLOW_PAYMENT_NOTE}</p>
      </div>

      <ul
        className="grid grid-cols-1 gap-1.5 text-sm leading-snug text-slate-200 min-[480px]:grid-cols-2 sm:gap-x-2 sm:gap-y-1.5"
        aria-label="Checkout trust guarantees"
        data-testid="checkout-trust-strip"
      >
        {CHECKOUT_TRUST_STRIP_ITEMS.map((item) => (
          <li key={item} className="flex min-w-0 items-start gap-1.5">
            <span className="mt-0.5 shrink-0 text-emerald-400" aria-hidden>
              ✓
            </span>
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>

      <section
        className="min-w-0 text-sm leading-relaxed"
        aria-label={CHECKOUT_AFTER_PAYMENT_LABEL}
        data-testid="checkout-after-payment"
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
          {CHECKOUT_AFTER_PAYMENT_LABEL}
        </p>
        <ol className="mt-1 list-none space-y-0.5 pl-0 text-slate-300">
          {CHECKOUT_AFTER_PAYMENT_STEPS.map((step, index) => (
            <li key={step} className="flex min-w-0 gap-2 break-words">
              <span className="shrink-0 tabular-nums text-slate-500">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <div
        className="space-y-0.5 border-l-2 border-slate-700/50 pl-2.5"
        data-testid="checkout-proof-verification"
      >
        <p className="text-sm leading-snug text-slate-300">{CHECKOUT_PROOF_VERIFICATION_LINE}</p>
        <p className="text-xs leading-snug text-slate-500">{CHECKOUT_PROOF_VERIFICATION_SUBLINE}</p>
      </div>

      <section
        className="rounded-lg border border-slate-800/70 bg-slate-950/30 px-3 py-2.5 sm:px-3.5"
        aria-labelledby="checkout-why-businesses-heading"
        data-testid="checkout-why-businesses"
      >
        <h3
          id="checkout-why-businesses-heading"
          className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
        >
          {CHECKOUT_WHY_BUSINESSES_HEADING}
        </h3>
        <ul className="mt-2 space-y-1 text-sm leading-snug text-slate-400">
          {CHECKOUT_WHY_BUSINESSES_BULLETS.map((item) => (
            <li key={item} className="flex min-w-0 items-start gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-600" aria-hidden />
              <span className="min-w-0 break-words">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs leading-relaxed text-slate-500 sm:text-sm" data-testid="checkout-used-for">
        {CHECKOUT_USED_FOR_LINE}
      </p>

      {showAnnualRenewal && cadence === "annual" ? (
        <p className="text-sm leading-relaxed text-slate-400">{CHECKOUT_ANNUAL_RENEWAL_COPY}</p>
      ) : null}

      <p className="text-xs leading-relaxed text-slate-500" data-testid="checkout-draft-saved">
        {CHECKOUT_DRAFT_SAVED_LINE}
      </p>

      <p className="text-sm leading-relaxed text-slate-400" data-testid="checkout-human-support">
        {supportParts[0]}
        <a
          href={`mailto:${CHECKOUT_SUPPORT_EMAIL}`}
          className="font-medium text-emerald-400 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          {CHECKOUT_SUPPORT_EMAIL}
        </a>
        .
      </p>

      <p className="text-xs leading-relaxed text-slate-500">{CHECKOUT_LEGAL_DISCLAIMER}</p>
    </div>
  );
}
