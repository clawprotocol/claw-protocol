import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { consumeOneFreeSendCredit, readFreeSendCredits } from "../freeSendCredits";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import { SampleArtifactsPreview } from "../SampleArtifactsPreview";
import { PRICING_CREDIBILITY_ONE_WORKFLOW } from "../pricingContent";
import { formatMoneyUsdWhole } from "../pricingKeyMath";
import { stashPaywallAttribution } from "../paywallAttribution";
import {
  getSendConversionPaywallVariantId,
  paywallDimensionsForVariant,
  paywallExperimentLogPayload,
  resolveSendPaywallCopy,
  SEND_CONVERSION_PAYWALL_EXPERIMENT_KEY,
} from "../paywallExperiment";
import {
  CONVERSION_GUARANTEE_INLINE,
  CONTEXTUAL_ONE_TIME_UNLOCK_USD,
  PAYWALL_URGENCY_SECONDARY,
} from "../paywallMessaging";

export function SendConversionModal(props: {
  open: boolean;
  agreementId: string;
  onClose: () => void;
  /** Free / watermarked path: unlock send step without checkout. */
  onContinueToSend: () => void;
  /** After consuming a free-send credit: unlock send step without leaving the page. */
  onFreeCreditSend: () => void;
  /** Subscription path: ready / plan selection then checkout. */
  onUpgradeAndSend: () => void;
  /** One-time unlock: checkout for this agreement only (post–value-created). */
  onBeginOneTimeUnlock: () => void;
  onGoPro: () => void;
  paywallHeadline?: string | null;
  paywallSub?: string | null;
}) {
  const {
    open,
    agreementId,
    onClose,
    onContinueToSend,
    onFreeCreditSend,
    onUpgradeAndSend,
    onBeginOneTimeUnlock,
    onGoPro,
    paywallHeadline,
    paywallSub,
  } = props;

  const variantId = useMemo(() => getSendConversionPaywallVariantId(), []);
  const copy = useMemo(() => resolveSendPaywallCopy(variantId), [variantId]);

  const headline = (paywallHeadline || copy.headlineDefault).trim();
  const subline = (paywallSub || copy.subDefault).trim();
  const credits = readFreeSendCredits();
  const oneTimePhrase = `${formatMoneyUsdWhole(CONTEXTUAL_ONE_TIME_UNLOCK_USD)} for this agreement`;

  const expPayload = useMemo(() => paywallExperimentLogPayload(variantId), [variantId]);
  const primaryCtaRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const paywallViewId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `pv_${agreementId}_${Date.now()}`;
    stashPaywallAttribution({
      paywallViewId,
      paywall_experiment_key: SEND_CONVERSION_PAYWALL_EXPERIMENT_KEY,
      paywall_variant: variantId,
      agreementId,
      viewedAtMs: Date.now(),
      paywall_dim: paywallDimensionsForVariant(variantId),
    });
    logProductEvent("paywall_shown", {
      agreementId,
      surface: "post_generation_send",
      ...paywallExperimentLogPayload(variantId),
      paywall_view_id: paywallViewId,
    });
  }, [open, agreementId, variantId]);

  useLayoutEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => primaryCtaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-conv-title"
    >
      <div className="flex max-h-[min(92dvh,100svh)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-700/90 bg-slate-950 shadow-2xl sm:max-h-[min(90vh,880px)] sm:rounded-2xl">
        <div className="min-h-0 flex flex-1 flex-col overflow-hidden px-5 py-6 sm:px-7 sm:py-8">
          <div className="shrink-0 space-y-2 sm:space-y-2.5">
            <p className="text-center text-sm font-medium leading-snug text-slate-300 sm:text-left">{copy.opener}</p>

            <h2 id="send-conv-title" className="text-center text-xl font-bold leading-snug text-white sm:text-left sm:text-2xl">
              {headline}
            </h2>
            <p className="text-center text-sm leading-relaxed text-slate-400 sm:text-left">{subline}</p>
            {copy.showSecondaryUrgency ? (
              <p className="text-center text-xs leading-relaxed text-slate-500 sm:text-left">{PAYWALL_URGENCY_SECONDARY}</p>
            ) : null}
          </div>

          <div className="mt-10 shrink-0">
            <div className="rounded-2xl border-2 border-emerald-500/45 bg-gradient-to-b from-emerald-950/25 to-slate-950/50 p-5 shadow-[0_0_28px_rgba(16,185,129,0.12)] ring-1 ring-emerald-500/20">
              <p className="text-center text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 sm:text-left">
                {copy.socialBadge}
              </p>
              <div className="mt-2 space-y-0.5 sm:mt-2">
                <p className="text-center text-2xl font-bold tabular-nums tracking-tight text-emerald-50 sm:text-left sm:text-3xl">
                  {copy.subscriptionAnchorLine}
                </p>
                <p className="text-center text-xs leading-snug text-slate-400 sm:text-left">{copy.valueCompressionLine}</p>
              </div>
              <p className="mt-3 text-center text-sm font-medium text-emerald-200/95 sm:text-left">{copy.bestForLine}</p>
              {copy.plusBlurb.trim() ? (
                <p className="mt-1 text-center text-xs leading-relaxed text-slate-400 sm:text-left">{copy.plusBlurb}</p>
              ) : null}
              <p className="mt-3 text-center text-sm leading-relaxed text-slate-300 sm:text-left">{copy.premiumPitchAboveCta}</p>
              <button
                ref={primaryCtaRef}
                type="button"
                title={copy.subscriptionHoverTitle}
                className="paywall-primary-entrance mt-5 w-full min-h-[3.5rem] rounded-xl border-2 border-emerald-500/55 bg-gradient-to-b from-emerald-950/40 to-slate-950/70 px-6 text-base font-semibold text-emerald-100 shadow-[0_4px_20px_rgba(16,185,129,0.12)] transition hover:border-emerald-400/70 hover:from-emerald-950/55 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:scale-[0.99]"
                onClick={() => {
                  logProductEvent("upgrade_clicked", {
                    agreementId,
                    tier: "25",
                    cta: "unlock_full_access",
                    ...expPayload,
                  });
                  onUpgradeAndSend();
                }}
              >
                {copy.ctaLabel}
              </button>
              {copy.microUrgency ? (
                <p className="mt-2 text-center text-[11px] text-slate-500 sm:text-left">{copy.microUrgency}</p>
              ) : null}
              {copy.lossAversion ? (
                <p className="mt-1.5 text-center text-[11px] leading-relaxed text-slate-500 sm:text-left">{copy.lossAversion}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-8 min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-800/70 pt-6">
            <div className="space-y-5 pb-2">
              <p className="text-center text-[11px] text-slate-600 sm:text-left">or</p>

              <div className="text-center sm:text-left">
                <p className="text-xs font-normal text-slate-500">{copy.oneTimeQuestion}</p>
                <button
                  type="button"
                  title={copy.oneTimeHoverTitle}
                  className="mt-1 inline-block max-w-full text-left text-xs font-normal text-slate-500 underline-offset-2 hover:text-slate-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  onClick={() => {
                    logProductEvent("unlock_clicked", { agreementId, intent: "single_agreement", ...expPayload });
                    onBeginOneTimeUnlock();
                  }}
                >
                  {oneTimePhrase}
                </button>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                  One-time unlocks only this agreement. Pro is better for ongoing drafting, review, saving, sending,
                  and up to 10 finalized agreements each month.
                </p>
              </div>

              <p className="text-center text-xs leading-relaxed text-slate-500 sm:text-left">{PRICING_CREDIBILITY_ONE_WORKFLOW}</p>
              <SampleArtifactsPreview variant="app" density="compact" />

              {credits > 0 ? (
                <button
                  type="button"
                  className="w-full rounded-lg border border-slate-700/90 bg-transparent px-3 py-2.5 text-center text-xs font-medium text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-300"
                  onClick={() => {
                    if (consumeOneFreeSendCredit()) {
                      logProductEvent("conversion_completed", {
                        agreementId,
                        type: "free_credit",
                        ...expPayload,
                      });
                      onFreeCreditSend();
                    }
                  }}
                >
                  Use free send credit ({credits} remaining)
                </button>
              ) : null}

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-4">
                <p className="text-center text-sm leading-relaxed text-slate-400 sm:text-left">{copy.freeDeliveryLine}</p>
                <button
                  type="button"
                  className="mt-3 w-full min-h-[2.75rem] rounded-lg border border-slate-600/80 bg-slate-900/40 px-4 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  onClick={() => {
                    logProductEvent("conversion_completed", {
                      agreementId,
                      type: "continue_send_watermark",
                      ...expPayload,
                    });
                    onContinueToSend();
                  }}
                >
                  {copy.freeCtaLabel}
                </button>
                <p className="mt-2.5 text-center text-[11px] leading-relaxed text-slate-500 sm:text-left">
                  {CONVERSION_GUARANTEE_INLINE}
                </p>
              </div>

              <p className="text-center sm:text-left">
                <button
                  type="button"
                  className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-400 hover:underline"
                  onClick={() => {
                    logProductEvent("upgrade_clicked", { agreementId, tier: "50", cta: "pro_footer", ...expPayload });
                    onGoPro();
                  }}
                >
                  Need team features? LawDog Pro →
                </button>
              </p>

              <div className="border-t border-slate-800 pt-4 text-center sm:text-left">
                <button
                  type="button"
                  className="text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                  onClick={() => {
                    logProductEvent("paywall_dismissed", { agreementId, via: "not_now", ...expPayload });
                    onClose();
                  }}
                >
                  {copy.dismissCtaLabel}
                </button>
                <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-600 sm:text-left">{copy.footerTrust}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
