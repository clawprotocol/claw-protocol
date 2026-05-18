import { useEffect, useLayoutEffect, useRef } from "react";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import {
  PRO_CTA_CONTINUE,
  PRO_CTA_KEEP_FREE_DRAFT,
  PRO_UPGRADE_CAN_HELP_BULLETS,
  PRO_UPGRADE_CARD_BODY,
  PRO_UPGRADE_CARD_HEADING,
  PRO_UPGRADE_REASSURANCE,
} from "../../launch/simpleProduct/proConversionCopy";

export type AdvancedFullDraftPaywallModalProps = {
  open: boolean;
  onClose: () => void;
  /** Clears upgrade lock and keeps the starter draft path — primary “no thanks” for conversion moment. */
  onStayWithStarter: () => void;
  onContinueToCompleteVersion: () => void;
  /** Secondary: full pricing page (same billing entry as before). */
  onViewPlans: () => void;
  /** Agreement-specific lines (shared with checkout via session). */
  contextReasons: readonly string[];
  /** Plain-text preview of what the user already created (desktop left column). */
  agreementPreviewText: string;
};

/**
 * STEP A — Upgrade decision surface (create-flow). STEP B is checkout / billing.
 * Agreement-centered copy; avoids generic SaaS “unlock / premium” framing.
 */
export function AdvancedFullDraftPaywallModal({
  open,
  onClose,
  onStayWithStarter,
  onContinueToCompleteVersion,
  onViewPlans,
  contextReasons,
  agreementPreviewText,
}: AdvancedFullDraftPaywallModalProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    logProductEvent("paywall_shown", { surface: "agreement_advanced_full_draft", variant: "create_flow" });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => primaryRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        logProductEvent("paywall_dismissed", { surface: "agreement_advanced_full_draft", via: "escape" });
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  void contextReasons;

  const preview = (agreementPreviewText || "").trim() || "—";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adv-draft-paywall-title"
    >
      <div
        className="absolute inset-0"
        role="presentation"
        aria-hidden
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            logProductEvent("paywall_dismissed", { surface: "agreement_advanced_full_draft", via: "backdrop" });
            onClose();
          }
        }}
      />
      <div
        className="relative z-[1] flex w-[min(92vw,1180px)] min-h-[72vh] max-h-[min(92vh,900px)] flex-col overflow-hidden rounded-t-2xl border border-slate-800/90 bg-slate-950 shadow-2xl sm:rounded-2xl"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[3fr_2fr] md:gap-0">
          {/* Preview first on mobile (stack), left column on desktop */}
          <div className="order-1 flex min-h-0 flex-col border-b border-slate-800/90 bg-slate-950 p-4 sm:p-5 md:order-1 md:border-b-0 md:border-r md:border-slate-800/80 md:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:text-[11px]">
              Your agreement
            </p>
            <div className="mt-2 flex min-h-0 min-h-[12rem] flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-zinc-50 shadow-inner shadow-zinc-900/10 dark:border-zinc-700/80 dark:bg-zinc-100 dark:shadow-zinc-950/20 md:min-h-[20rem]">
              <pre
                className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap p-4 font-serif text-[13px] leading-relaxed text-slate-900 sm:p-5 sm:text-[14px] sm:leading-[1.65] dark:text-slate-900"
                tabIndex={0}
              >
                {preview}
              </pre>
            </div>
          </div>

          <div className="order-2 flex min-h-0 flex-col justify-between overflow-y-auto bg-slate-950 px-5 py-6 sm:px-7 sm:py-8 md:order-2">
            <div>
              <h2
                id="adv-draft-paywall-title"
                className="text-lg font-semibold tracking-tight text-slate-100 sm:text-xl md:text-2xl"
              >
                {PRO_UPGRADE_CARD_HEADING}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400 sm:text-[15px]">{PRO_UPGRADE_CARD_BODY}</p>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-200 sm:text-[15px]">
                {PRO_UPGRADE_CAN_HELP_BULLETS.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="shrink-0 text-slate-500" aria-hidden>
                      •
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs leading-5 text-slate-500 sm:text-sm sm:leading-6">{PRO_UPGRADE_REASSURANCE}</p>
            </div>
            <div className="mt-8 flex flex-col gap-4 md:mt-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-xs">Next step</p>
              <p className="text-sm leading-6 text-slate-400 sm:text-[15px]">
                Choose Pro, then return here to review before anything is shared, sent, or signed.
              </p>
              <button
                ref={primaryRef}
                type="button"
                className="min-h-12 w-full rounded-xl bg-amber-500 px-4 py-3 text-center text-sm font-semibold text-slate-950 shadow-md shadow-amber-950/25 transition hover:bg-amber-400 sm:min-h-[3rem] sm:text-base"
                onClick={() => {
                  logProductEvent("paywall_clicked_upgrade", {
                    surface: "agreement_advanced_full_draft",
                    cta: "continue_complete_version",
                  });
                  onContinueToCompleteVersion();
                }}
              >
                {PRO_CTA_CONTINUE}
              </button>
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary min-h-11 w-full border-slate-700/90 bg-slate-900/50 text-sm font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-900 sm:min-h-12"
                onClick={() => {
                  logProductEvent("paywall_clicked_upgrade", { surface: "agreement_advanced_full_draft", cta: "stay_starter" });
                  onStayWithStarter();
                }}
              >
                {PRO_CTA_KEEP_FREE_DRAFT}
              </button>
              <button
                type="button"
                className="text-center text-xs font-medium text-slate-500 underline-offset-4 transition hover:text-slate-300 hover:underline sm:text-left sm:text-sm"
                onClick={() => {
                  logProductEvent("paywall_clicked_upgrade", { surface: "agreement_advanced_full_draft", cta: "billing" });
                  onViewPlans();
                }}
              >
                Compare plans on the pricing page
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
