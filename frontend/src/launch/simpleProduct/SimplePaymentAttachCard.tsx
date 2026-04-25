import { useEffect, useId, useState } from "react";
import type { PaymentRequestPayload } from "../../agreement/paymentRequestTypes";
import { inferPaymentPercentageHint } from "../../agreement/paymentRequestTypes";

type Props = {
  partyALabel: string;
  partyBLabel: string;
  paymentTerms: string;
  purpose: string;
  paymentRequired: boolean;
  onPaymentRequiredChange: (next: boolean) => void;
  value: PaymentRequestPayload;
  onChange: (next: PaymentRequestPayload) => void;
  /** Persist full payload + enforcement (e.g. debounced save to API). */
  onPersist: () => void | Promise<void>;
};

export function SimplePaymentAttachCard(props: Props) {
  const {
    partyALabel,
    partyBLabel,
    paymentTerms,
    purpose,
    paymentRequired,
    onPaymentRequiredChange,
    value,
    onChange,
    onPersist,
  } = props;
  const [open, setOpen] = useState(false);
  const [showAha, setShowAha] = useState(false);
  const reqId = useId();
  const hint = inferPaymentPercentageHint(paymentTerms, purpose);

  useEffect(() => {
    if (open || paymentRequired || value.amount.trim()) {
      const t = window.setTimeout(() => setShowAha(true), 280);
      return () => window.clearTimeout(t);
    }
    setShowAha(false);
    return undefined;
  }, [open, paymentRequired, value.amount]);

  const title = paymentRequired ? "Require payment before signing" : "Attach payment (optional)";

  return (
    <div className="rounded-xl border border-slate-800/70 bg-slate-950/[0.35]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-900/30"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-300">{title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            Want to get paid automatically? Attach a payment request — LawDog will track it.
          </p>
        </div>
        <span className="shrink-0 text-slate-500" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-slate-800/55 px-5 pb-5 pt-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800/60 bg-slate-900/25 px-3 py-3">
            <input
              id={reqId}
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500/40"
              checked={paymentRequired}
              onChange={(e) => {
                onPaymentRequiredChange(e.target.checked);
              }}
            />
            <span className="text-sm text-slate-300">
              <span className="font-medium text-slate-100">Require payment before signing</span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                When on, sending must include a payment request. You control when this goes out — nothing is sent until
                you confirm.
              </span>
            </span>
          </label>

          {hint ? (
            <div className="rounded-lg border border-emerald-900/35 bg-emerald-950/15 px-3 py-2.5 text-xs leading-relaxed text-emerald-100/90">
              <span className="font-medium text-emerald-50">Spotted in your terms: </span>
              Suggest{" "}
              <button
                type="button"
                className="font-semibold text-emerald-300 underline decoration-emerald-600/50 underline-offset-2 hover:text-emerald-200"
                onClick={() => {
                  onChange({
                    ...value,
                    type: "percentage",
                    amount: hint.percent,
                  });
                  void onPersist();
                }}
              >
                {hint.suggestionLabel}
              </button>
            </div>
          ) : null}

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Amount ($ or %)</label>
            <input
              className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/45"
              value={value.amount}
              placeholder={value.type === "percentage" ? "e.g. 1" : "e.g. 5000"}
              onChange={(e) => onChange({ ...value, amount: e.target.value })}
              onBlur={() => void onPersist()}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payment type</label>
            <select
              className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/45"
              value={value.type}
              onChange={(e) => {
                onChange({ ...value, type: e.target.value === "percentage" ? "percentage" : "fixed" });
                void onPersist();
              }}
            >
              <option value="fixed">Fixed</option>
              <option value="percentage">Percentage</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Who pays</label>
            <select
              className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/45"
              value={value.payer}
              onChange={(e) => {
                onChange({ ...value, payer: e.target.value === "party_b" ? "party_b" : "party_a" });
                void onPersist();
              }}
            >
              <option value="party_a">{partyALabel}</option>
              <option value="party_b">{partyBLabel}</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">When</label>
            <select
              className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/45"
              value={value.condition}
              onChange={(e) => {
                onChange({
                  ...value,
                  condition: e.target.value === "after_signing" ? "after_signing" : "before_signing",
                });
                void onPersist();
              }}
            >
              <option value="before_signing">Before signing (default)</option>
              <option value="after_signing">After signing</option>
            </select>
          </div>

          {showAha && (open || paymentRequired || value.amount.trim()) ? (
            <p className="claw-payment-aha-banner text-xs font-medium leading-relaxed text-emerald-300/95">
              LawDog will track this automatically — you stay in control of when it goes out.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
