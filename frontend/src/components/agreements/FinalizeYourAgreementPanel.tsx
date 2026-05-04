import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { VoiceAugmentedTextArea, type VoiceDictationControl } from "../../launch/VoiceAugmentedControl";
import {
  formatProRefineRejectedShortInline,
  pickAuthoritativeProCorpusForRefine,
  PRO_REFINE_APPLY_REVISION_BUTTON_LABEL,
  PRO_REFINE_CHANGE_APPLIED_USER_MESSAGE,
  PRO_REFINE_REVISE_HELPER,
  PRO_REFINE_REVISE_SECTION_HEADING,
  PRO_REFINE_SURGICAL_REJECTED_SHORT_EXHAUSTED,
  PRO_REFINE_REVIEWER_NOTE_APPLIED_USER_MESSAGE,
} from "./premiumRefineAcceptance";
import { PAID_PRO_REFINE_INSTRUCTION_PLACEHOLDER } from "./reviewRefineUserCopy";
import {
  buildPremiumRefineChecklistBullets,
  executePremiumRefineUpdate,
  PRO_REFINE_LATE_FEE_ALREADY_PRESENT_MESSAGE,
} from "./premiumRefineLateFeeFallback";
import { PRO_REFINE_UNAVAILABLE_USER_MESSAGE, type PremiumRefineResponse } from "./premiumRefineApi";
import { computePremiumReviewCompleteness } from "./premiumReviewCompleteness";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PremiumAgreementReview } from "./premiumAgreementReviewTypes";
import {
  buildFinalizeMissingLinesPriority,
  finalizeTagline,
  formatFinalizeReadiness,
  resolveFinalizeReadiness,
  type FinalizeReadiness,
} from "./finalizeReadinessModel";
import type { PremiumFinalizeAudit } from "./premiumFinalizeAuditTypes";
import type { PremiumReviewRoute } from "./premiumReviewRouteTypes";

/** Pro finalize panel — shown above review/signature row; also used for empty refine submit hint. */
export const FINALIZE_REFINE_ROUTE_HINT =
  "Need changes? Describe them below, then update the agreement. When you’re ready, use Send for review or Send for signature above.";
/** Review-first v1: send CTAs live on the draft card above; this panel is refine-only. */
export const FINALIZE_REFINE_ROUTE_HINT_REVIEW_ONLY =
  "Need changes? Describe them below, then update the agreement. When you’re ready, use Send for review in the section above.";
/** Paid Pro draft card owns review + signature CTAs; refinements panel points there (no duplicate delivery row). */
export const FINALIZE_REFINE_ROUTE_HINT_DRAFT_CARD_DELIVERY =
  "Need changes? Describe them below, then update the agreement. Edit wording, Send for review, and Send for signature are on your draft card above.";

type SendMode = "review" | "signature";

type Props = {
  draft: ParsedDraftShape | null;
  currentDocumentText: string;
  intakeText: string;
  review: PremiumAgreementReview | null;
  /** Deal-grounded audit; optional (fail open). */
  finalizeAudit: PremiumFinalizeAudit | null;
  /** Final route recommendation; optional (fail open). */
  reviewRoute: PremiumReviewRoute | null;
  /** Bumps when user picks a route primary CTA so downstream UX can react (e.g. auto-refine loop). */
  routePrimaryActionNonce?: number;
  onRouteFixPrimary?: () => void;
  /** Fired after a successful refine apply so the host can show a calm “What changed” line under the document. */
  onProRefineWhatChanged?: (summaryLine: string | null) => void;
  onApplyDocumentText: (text: string) => void;
  onReadyForReview: () => void;
  onSendForSignature: () => void;
  /** Paid Pro signature path: after choosing signature, show “I’ll sign first” + continue to recipient emails. */
  showSignatureRecipientContinue?: boolean;
  onContinueToRecipientSetup?: () => void;
  draftSignatureSenderFirst?: boolean;
  onDraftSignatureSenderFirstChange?: (next: boolean) => void;
  markDocumentDirty?: () => void;
  sendMode: SendMode;
  sendModeTouched: boolean;
  disabled?: boolean;
  /** When true, hide Send for review / Send for signature row (host shows them on the paid Pro draft card). */
  deliveryCtasOnDraftCard?: boolean;
  /** Dev-only: logged when premium refine fails; parent supplies flags and ids. */
  devProRefineContext?: {
    handlerLabel: string;
    premiumPersistedFlowActive: boolean;
    premiumPaidDocumentSurface: boolean;
    hasFullDraftAccess: boolean;
    reviewAgreementId: string | null;
  };
};

function readinessPillClass(r: FinalizeReadiness): string {
  if (r === "needs_details") return "border-amber-500/50 bg-amber-950/40 text-amber-200";
  if (r === "good_draft") return "border-slate-500/50 bg-slate-900/80 text-slate-200";
  if (r === "ready_for_review") return "border-cyan-500/40 bg-cyan-950/30 text-cyan-100/90";
  return "border-emerald-500/50 bg-emerald-950/35 text-emerald-100/90";
}

/** Display-only: forward momentum on the primary review CTA (wiring unchanged). */
function formatRecommendedCtaLabel(cta: PremiumReviewRoute["recommended_cta"]): string {
  if (cta === "Send for review") return "Send for review";
  return cta;
}

function formatRouteConfidenceLabel(conf: PremiumReviewRoute["confidence"]): string {
  if (conf === "medium") return "solid for review";
  return conf;
}

/**
 * LawDog Pro: single post-draft surface — checklist, AI gaps, and refinement in one place.
 * Document preview stays the primary focus above; panel heading emphasizes send-for-review flow.
 */
export function FinalizeYourAgreementPanel({
  draft,
  currentDocumentText,
  intakeText,
  review,
  finalizeAudit,
  reviewRoute,
  routePrimaryActionNonce = 0,
  onRouteFixPrimary,
  onProRefineWhatChanged,
  onApplyDocumentText,
  onReadyForReview,
  onSendForSignature,
  showSignatureRecipientContinue = false,
  onContinueToRecipientSetup,
  draftSignatureSenderFirst = false,
  onDraftSignatureSenderFirstChange,
  markDocumentDirty,
  sendMode,
  sendModeTouched,
  disabled = false,
  deliveryCtasOnDraftCard = false,
  devProRefineContext,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refineSuccessMessage, setRefineSuccessMessage] = useState<string | null>(null);
  const [refineWhatChangedCaption, setRefineWhatChangedCaption] = useState<string | null>(null);
  const [lastRefine, setLastRefine] = useState<PremiumRefineResponse | null>(null);
  const dictationRef = useRef<VoiceDictationControl | null>(null);
  const acRef = useRef<AbortController | null>(null);
  const refineTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastRouteActionNonceRef = useRef(0);

  /** Longest authoritative corpus so refine + readiness never use a thin live preview when draft holds the full Pro body. */
  const effectiveCurrentDocumentText = useMemo(() => {
    return pickAuthoritativeProCorpusForRefine({
      draft,
      agreementDocumentText: currentDocumentText || "",
    }).text;
  }, [currentDocumentText, draft]);

  const effectiveIntakeText = useMemo(() => {
    const t = (intakeText || "").trim();
    if (t.length) return t;
    return (
      [draft?.title, draft?.jurisdiction, draft?.purpose, draft?.payment_terms, draft?.additional_terms]
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .join("\n\n")
        .trim() || "LawDog Pro commercial agreement"
    );
  }, [intakeText, draft?.title, draft?.jurisdiction, draft?.purpose, draft?.payment_terms, draft?.additional_terms]);

  const completenessRows = useMemo(
    () => computePremiumReviewCompleteness(draft, effectiveCurrentDocumentText),
    [draft, effectiveCurrentDocumentText],
  );
  const notOkCount = useMemo(() => completenessRows.filter((r) => !r.ok).length, [completenessRows]);
  const missingLines = useMemo(
    () => buildFinalizeMissingLinesPriority(finalizeAudit, effectiveCurrentDocumentText, review, completenessRows, 3),
    [finalizeAudit, effectiveCurrentDocumentText, review, completenessRows],
  );
  const priorityScore = review?.priority_score ?? 0;

  const readiness = useMemo(
    () =>
      resolveFinalizeReadiness({
        sendMode,
        sendModeTouched,
        notOkCount,
        priorityScore,
        lastRefine: lastRefine
          ? { suggested_next_step: lastRefine.suggested_next_step, readiness_score: lastRefine.readiness_score }
          : null,
        audit: finalizeAudit,
        documentText: effectiveCurrentDocumentText,
      }),
    [sendMode, sendModeTouched, notOkCount, priorityScore, lastRefine, finalizeAudit, effectiveCurrentDocumentText],
  );

  const tagline = useMemo(
    () => finalizeTagline(missingLines.length, readiness),
    [missingLines.length, readiness],
  );
  const routeBadge = useMemo(() => {
    if (!reviewRoute) return null;
    if (reviewRoute.route === "signature") return "Ready to sign";
    if (reviewRoute.route === "fix") return `Needs ${Math.max(1, Math.min(3, reviewRoute.unresolved_items.length || 2))} quick fixes`;
    return "Recommended next step";
  }, [reviewRoute]);
  const routeCopy = useMemo(() => {
    if (!reviewRoute) return "";
    const conf =
      reviewRoute.confidence === "high"
        ? "Strong signal"
        : reviewRoute.confidence === "low"
          ? "Early signal"
          : "Likely best move";
    if (reviewRoute.route === "signature") {
      return `${conf}: your agreement appears complete enough to send for signatures now.`;
    }
    if (reviewRoute.route === "fix") {
      return `${conf}: clean up a few unresolved items before sending.`;
    }
    return "Send this agreement for review so both sides can confirm details before signing.";
  }, [reviewRoute]);

  const runUpdate = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (disabled || busy) return;
      if (!prompt.trim()) {
        setErr(FINALIZE_REFINE_ROUTE_HINT);
        return;
      }
      setErr(null);
      setRefineSuccessMessage(null);
      setRefineWhatChangedCaption(null);
      await dictationRef.current?.finalizeDictation();
      acRef.current?.abort();
      const ac = new AbortController();
      acRef.current = ac;
      setBusy(true);
      setLastRefine(null);
      try {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.info("[agreement-refine] FinalizeYourAgreementPanel#runUpdate (pre-request)", {
            effectiveCurrentDocumentLen: effectiveCurrentDocumentText.length,
            effectiveIntakeLen: effectiveIntakeText.length,
            instructionLen: prompt.trim().length,
            endpoint: "/api/agreements/premium-refine",
            ...devProRefineContext,
          });
        }
        const baseline = pickAuthoritativeProCorpusForRefine({
          draft,
          agreementDocumentText: currentDocumentText || "",
        });
        const resolved = await executePremiumRefineUpdate({
          baselineText: baseline.text,
          baselineLen: baseline.len,
          intakeText: effectiveIntakeText,
          userInstruction: prompt.trim(),
          signal: ac.signal,
          refineChecklistBullets: buildPremiumRefineChecklistBullets(review, reviewRoute),
        });
        const r = resolved.lastRefineResponse;
        const {
          acceptance: acc,
          finalText: out,
          usedLocalLateFeeFallback,
          whatChangedLine,
          unchangedDuplicateLateFee,
          usedClientDeliverablesFinalPaymentFallback,
          usedSurgicalPreserveRetry,
          surgicalRejectedShortExhausted,
          usedAppendReviewerNotePreserve,
          refineApplyDecision,
        } = resolved;
        // eslint-disable-next-line no-console
        console.info("[premium-refine-apply]", {
          currentProLen: baseline.len,
          refinedCandidateLen: acc.refinedLen,
          ratio: Number(acc.ratio.toFixed(4)),
          applyDecision: refineApplyDecision ?? acc.decision,
          revisionIntent: acc.revisionIntent,
          headingPreservationRatio: Number(acc.headingPreservationRatio.toFixed(4)),
          requiredSectionsPresent: acc.requiredSectionsPresent,
          preservedExistingDoc: acc.decision !== "accepted",
          chosenSource: baseline.chosenSource,
          endpoint: "premium-refine",
          surface: "FinalizeYourAgreementPanel.runUpdate",
          usedLocalLateFeeFallback,
          usedClientDeliverablesFinalPaymentFallback,
          usedSurgicalPreserveRetry,
          surgicalRejectedShortExhausted,
          usedAppendReviewerNotePreserve,
        });
        if (acc.decision === "rejected_unchanged") {
          setLastRefine(null);
          setRefineSuccessMessage(null);
          setErr(unchangedDuplicateLateFee ? PRO_REFINE_LATE_FEE_ALREADY_PRESENT_MESSAGE : PRO_REFINE_UNAVAILABLE_USER_MESSAGE);
          return;
        }
        if (acc.decision === "rejected_short") {
          setLastRefine(null);
          setRefineSuccessMessage(null);
          setErr(
            surgicalRejectedShortExhausted
              ? PRO_REFINE_SURGICAL_REJECTED_SHORT_EXHAUSTED
              : formatProRefineRejectedShortInline(),
          );
          return;
        }
        if (acc.decision === "rejected_empty") {
          setLastRefine(null);
          setRefineSuccessMessage(null);
          setErr("We couldn't apply that update. Try again.");
          return;
        }
        if (out && r) {
          setLastRefine(r);
          markDocumentDirty?.();
          onApplyDocumentText(out);
          const wc = whatChangedLine?.trim() ? whatChangedLine.trim() : null;
          onProRefineWhatChanged?.(wc);
          setRefineWhatChangedCaption(wc);
          setPrompt("");
          setRefineSuccessMessage(
            usedAppendReviewerNotePreserve
              ? PRO_REFINE_REVIEWER_NOTE_APPLIED_USER_MESSAGE
              : PRO_REFINE_CHANGE_APPLIED_USER_MESSAGE,
          );
        } else if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[agreement-refine] FinalizeYourAgreementPanel#runUpdate empty model output", { r });
        }
      } catch (e2) {
        if (e2 instanceof Error && e2.name === "AbortError") return;
        setRefineSuccessMessage(null);
        setRefineWhatChangedCaption(null);
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[agreement-refine] FinalizeYourAgreementPanel#runUpdate FAILED", {
            component: "FinalizeYourAgreementPanel",
            handler: "runUpdate",
            endpoint: "POST /api/agreements/premium-refine",
            currentDocumentLen: (currentDocumentText || "").length,
            effectiveCurrentDocumentLen: effectiveCurrentDocumentText.length,
            intakeTextPropLen: (intakeText || "").length,
            effectiveIntakeLen: effectiveIntakeText.length,
            instructionLen: prompt.trim().length,
            caught: e2 instanceof Error ? e2.message : String(e2),
            devProRefineContext,
          });
        }
        setErr(e2 instanceof Error ? e2.message : "Something went wrong. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      currentDocumentText,
      devProRefineContext,
      disabled,
      draft,
      effectiveCurrentDocumentText,
      effectiveIntakeText,
      intakeText,
      markDocumentDirty,
      onApplyDocumentText,
      onProRefineWhatChanged,
      prompt,
      review,
      reviewRoute,
    ],
  );

  useEffect(() => {
    if (!routePrimaryActionNonce || routePrimaryActionNonce === lastRouteActionNonceRef.current) return;
    lastRouteActionNonceRef.current = routePrimaryActionNonce;
    if (!reviewRoute || reviewRoute.route !== "fix") return;
    const top = (reviewRoute.unresolved_items || []).map((x) => String(x || "").trim()).filter(Boolean)[0];
    if (!top) return;
    const seed = `Tighten the agreement: ${top}`;
    setErr(null);
    setPrompt(seed);
    window.requestAnimationFrame(() => {
      refineTextareaRef.current?.focus();
      refineTextareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    void (async () => {
      if (disabled) return;
      setBusy(true);
      setLastRefine(null);
      setRefineSuccessMessage(null);
      setRefineWhatChangedCaption(null);
      try {
        const baseline = pickAuthoritativeProCorpusForRefine({
          draft,
          agreementDocumentText: currentDocumentText || "",
        });
        const resolved = await executePremiumRefineUpdate({
          baselineText: baseline.text,
          baselineLen: baseline.len,
          intakeText: effectiveIntakeText,
          userInstruction: seed,
          refineChecklistBullets: buildPremiumRefineChecklistBullets(review, reviewRoute),
        });
        const r = resolved.lastRefineResponse;
        const {
          acceptance: acc,
          finalText: out,
          whatChangedLine,
          unchangedDuplicateLateFee,
          surgicalRejectedShortExhausted,
          usedAppendReviewerNotePreserve,
        } = resolved;
        if (acc.decision === "rejected_unchanged") {
          setLastRefine(null);
          setRefineSuccessMessage(null);
          setErr(unchangedDuplicateLateFee ? PRO_REFINE_LATE_FEE_ALREADY_PRESENT_MESSAGE : PRO_REFINE_UNAVAILABLE_USER_MESSAGE);
          return;
        }
        if (acc.decision === "rejected_short") {
          setLastRefine(null);
          setRefineSuccessMessage(null);
          setErr(
            surgicalRejectedShortExhausted
              ? PRO_REFINE_SURGICAL_REJECTED_SHORT_EXHAUSTED
              : formatProRefineRejectedShortInline(),
          );
          return;
        }
        if (acc.decision === "rejected_empty") {
          setLastRefine(null);
          setRefineSuccessMessage(null);
          setErr("We couldn't apply that update. Try again.");
          return;
        }
        if (out && r) {
          setLastRefine(r);
          markDocumentDirty?.();
          onApplyDocumentText(out);
          const wc = whatChangedLine?.trim() ? whatChangedLine.trim() : null;
          onProRefineWhatChanged?.(wc);
          setRefineWhatChangedCaption(wc);
          setRefineSuccessMessage(
            usedAppendReviewerNotePreserve
              ? PRO_REFINE_REVIEWER_NOTE_APPLIED_USER_MESSAGE
              : PRO_REFINE_CHANGE_APPLIED_USER_MESSAGE,
          );
        }
      } catch (e2) {
        setRefineSuccessMessage(null);
        setRefineWhatChangedCaption(null);
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[agreement-refine] FinalizeYourAgreementPanel#routeAutoRefine FAILED", {
            component: "FinalizeYourAgreementPanel",
            handler: "useEffect:routeAutoRefine",
            endpoint: "POST /api/agreements/premium-refine",
            currentDocumentLen: (currentDocumentText || "").length,
            effectiveCurrentDocumentLen: effectiveCurrentDocumentText.length,
            intakeTextPropLen: (intakeText || "").length,
            effectiveIntakeLen: effectiveIntakeText.length,
            caught: e2 instanceof Error ? e2.message : String(e2),
            devProRefineContext,
          });
        }
        setErr(e2 instanceof Error ? e2.message : "Something went wrong. Try again.");
      } finally {
        setBusy(false);
      }
    })();
  }, [
    routePrimaryActionNonce,
    reviewRoute,
    review,
    currentDocumentText,
    draft,
    intakeText,
    effectiveCurrentDocumentText,
    effectiveIntakeText,
    devProRefineContext,
    disabled,
    markDocumentDirty,
    onApplyDocumentText,
    onProRefineWhatChanged,
  ]);

  return (
    <div
      className="mb-4 rounded-2xl border border-slate-600/50 bg-slate-950/80 p-4 shadow-md ring-1 ring-slate-700/40 sm:mb-5 sm:p-5"
      role="region"
      aria-label={deliveryCtasOnDraftCard ? PRO_REFINE_REVISE_SECTION_HEADING : "Choose how to deliver your agreement"}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-slate-100 sm:text-lg">
            {deliveryCtasOnDraftCard || sendMode === "review" ? PRO_REFINE_REVISE_SECTION_HEADING : "Choose how to deliver"}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">{tagline}</p>
        </div>
        <p
          className={`shrink-0 self-start rounded-lg border px-3 py-1.5 text-center text-[11px] font-semibold sm:text-xs ${readinessPillClass(readiness)}`}
        >
          {formatFinalizeReadiness(readiness)}
        </p>
      </div>

      {missingLines.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-slate-200/95 sm:mt-4 sm:text-[15px]">
          {missingLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500 sm:mt-4">Looking good on the quick scan — add tweaks below if needed.</p>
      )}
      {reviewRoute && sendMode !== "review" ? (
        <div className="mt-4 rounded-xl border border-cyan-500/25 bg-cyan-950/15 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-cyan-100">{routeBadge}</p>
            <p className="rounded-md border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 text-[11px] text-cyan-200">
              Confidence: {formatRouteConfidenceLabel(reviewRoute.confidence)}
            </p>
          </div>
          <p className="mt-1.5 text-sm text-cyan-100/90">
            {reviewRoute.route === "review"
              ? "Send this agreement for review so both sides can confirm details before signing."
              : reviewRoute.short_summary || routeCopy}
          </p>
          {reviewRoute.route === "fix" && reviewRoute.unresolved_items.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-cyan-50/95">
              {reviewRoute.unresolved_items.slice(0, 3).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 text-[11px] leading-snug text-slate-500 sm:text-xs">
            Most agreements are reviewed by all parties before signing.
          </p>
          {reviewRoute.route === "fix" ? (
            <button
              type="button"
              className="mt-3 inline-flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-md shadow-emerald-950/20 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/90 disabled:opacity-50 sm:min-h-[2.85rem] sm:px-5 sm:py-3 sm:text-[0.9375rem]"
              disabled={disabled || busy}
              onClick={() => onRouteFixPrimary?.()}
            >
              {formatRecommendedCtaLabel(reviewRoute.recommended_cta)}
            </button>
          ) : null}
        </div>
      ) : null}

      {!deliveryCtasOnDraftCard && sendMode === "signature" ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <button
            type="button"
            className="inline-flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-md shadow-emerald-950/20 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/90 disabled:opacity-50 sm:min-h-[2.85rem] sm:flex-1 sm:px-5 sm:py-3 sm:text-[0.9375rem]"
            disabled={disabled || busy}
            onClick={() => onReadyForReview()}
          >
            Send for review
          </button>
          <button
            type="button"
            className="inline-flex min-h-[2.75rem] items-center justify-center rounded-lg border border-slate-500/55 bg-slate-950/50 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-400 hover:bg-slate-900/60 disabled:opacity-50 sm:min-h-[2.85rem] sm:flex-1 sm:py-2.5"
            disabled={disabled || busy}
            onClick={() => onSendForSignature()}
          >
            Send for signature
          </button>
        </div>
      ) : null}

      {showSignatureRecipientContinue && sendMode === "signature" ? (
        <div className="mt-4 rounded-xl border border-slate-600/60 bg-slate-950/50 p-3.5 sm:p-4">
          <p className="text-sm font-medium text-slate-200">Signature delivery</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">
            Add signer emails on the next step. Recipients receive the final version for signature — they cannot edit
            the agreement text directly.
          </p>
          {onDraftSignatureSenderFirstChange ? (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-left text-sm text-slate-300">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500/40"
                checked={draftSignatureSenderFirst}
                onChange={(e) => onDraftSignatureSenderFirstChange(e.target.checked)}
              />
              <span>
                <span className="font-medium text-slate-100">I&apos;ll sign first</span>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Open your signing workspace first, then share links for other signers.
                </span>
              </span>
            </label>
          ) : null}
          {onContinueToRecipientSetup ? (
            <button
              type="button"
              className="mt-4 w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-400 disabled:opacity-50 sm:w-auto"
              disabled={disabled || busy}
              onClick={() => onContinueToRecipientSetup()}
            >
              Add recipient emails
            </button>
          ) : null}
        </div>
      ) : null}

      {deliveryCtasOnDraftCard || sendMode === "review" ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-400 sm:mt-4 sm:text-sm">{PRO_REFINE_REVISE_HELPER}</p>
      ) : null}
      <form onSubmit={runUpdate} className="mt-4 space-y-3 border-t border-slate-700/50 pt-4">
        <VoiceAugmentedTextArea
          ref={refineTextareaRef}
          value={prompt}
          onValueChange={setPrompt}
          surface="dark"
          disabled={disabled || busy}
          dictationControlRef={dictationRef}
          voiceSubtleIdle={true}
          autosize
          autosizeMaxPx={260}
          onVoiceError={() => {}}
          placeholder={PAID_PRO_REFINE_INSTRUCTION_PLACEHOLDER}
          rows={3}
          className="w-full rounded-xl border border-slate-600/50 bg-slate-900/90 px-3.5 py-2.5 pr-14 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 sm:px-4"
          autoComplete="off"
          name="finalize-refinement"
          aria-label={PAID_PRO_REFINE_INSTRUCTION_PLACEHOLDER}
        />
        {err ? (
          <p className="whitespace-pre-wrap text-sm text-amber-200/95" role="alert">
            {err}
          </p>
        ) : null}
        {refineSuccessMessage && !err ? (
          <p className="text-sm text-emerald-200/95" role="status">
            {refineSuccessMessage}
          </p>
        ) : null}
        {refineWhatChangedCaption && !err ? (
          <p className="text-sm leading-relaxed text-slate-200/95" role="status" aria-live="polite">
            <span className="font-medium text-emerald-200/90">What changed: </span>
            {refineWhatChangedCaption}
          </p>
        ) : null}
        {lastRefine && lastRefine.summary_changes.length > 0 ? (
          <div className="rounded-lg border border-slate-600/50 bg-slate-900/50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Latest update</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-slate-300">
              {lastRefine.summary_changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="text-xs leading-relaxed text-slate-500 sm:text-sm">
          {deliveryCtasOnDraftCard
            ? FINALIZE_REFINE_ROUTE_HINT_DRAFT_CARD_DELIVERY
            : sendMode === "review"
              ? FINALIZE_REFINE_ROUTE_HINT_REVIEW_ONLY
              : FINALIZE_REFINE_ROUTE_HINT}
        </p>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
          <button
            type="submit"
            className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
            disabled={disabled || busy || !prompt.trim()}
          >
            {busy ? "Working…" : prompt.trim() ? PRO_REFINE_APPLY_REVISION_BUTTON_LABEL : "Describe a change first"}
          </button>
        </div>
      </form>
    </div>
  );
}
