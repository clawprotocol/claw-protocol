import { useEffect } from "react";
import {
  CHECKOUT_AFTER_PAYMENT_LINE,
  CHECKOUT_HUMAN_SUPPORT_LINE,
  CHECKOUT_SECURE_MICROCOPY,
  CHECKOUT_SUPPORT_EMAIL,
  CHECKOUT_TRUST_STRIP_ITEMS,
  logCheckoutTrustCopyRendered,
} from "./checkoutTrustCopy";

type Props = {
  surface: string;
  className?: string;
};

/** Compact trust cluster above payment — no stacked marketing panels. */
export function CheckoutTrustPanel({ surface, className }: Props) {
  useEffect(() => {
    logCheckoutTrustCopyRendered(surface);
  }, [surface]);

  const supportParts = CHECKOUT_HUMAN_SUPPORT_LINE.split(CHECKOUT_SUPPORT_EMAIL);

  return (
    <div
      className={["min-w-0 space-y-2.5", className].filter(Boolean).join(" ")}
      data-testid="checkout-trust-panel"
    >
      <p className="text-sm leading-relaxed text-slate-300 sm:text-[15px]">{CHECKOUT_SECURE_MICROCOPY}</p>

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

      <p className="text-sm leading-relaxed text-slate-400" data-testid="checkout-after-payment">
        {CHECKOUT_AFTER_PAYMENT_LINE}
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
    </div>
  );
}
