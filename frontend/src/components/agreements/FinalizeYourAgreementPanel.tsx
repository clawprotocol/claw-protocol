import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { VoiceAugmentedTextArea, type VoiceDictationControl } from "../../launch/VoiceAugmentedControl";
import {
  evaluatePremiumRefineCandidate,
  formatProRefineRejectedShortInline,
  pickAuthoritativeProCorpusForRefine,
  PRO_REFINE_CHANGE_APPLIED_USER_MESSAGE,
} from "./premiumRefineAcceptance";
import { postPremiumRefine, type PremiumRefineResponse } from "./premiumRefineApi";
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

const PLACEHOLDER = "Add anything else or speak changes";

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
  onApplyDocumentText: (text: string) => void;
  onReadyForReview: () => void;
  onSendForSignature: () => void;
  markDocumentDirty?: () => void;
  sendMode: SendMode;
  sendModeTouched: boolean;
  disabled?: boolean;
  /** Dev-only: logged when `postPremiumRefine` fails; parent supplies flags and ids. */
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

/**
 * LawDog Pro: single post-draft surface — checklist, AI gaps, and refinement in one place.
 * Document preview stays the primary focus above.
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
  onApplyDocumentText,
  onReadyForReview,
  onSendForSignature,
  markDocumentDirty,
  sendMode,
  sendModeTouched,
  disabled = false,
  devProRefineContext,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refineSuccessMessage, setRefineSuccessMessage] = useState<string | null>(null);
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
    return "Best sent for review first";
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
    return `${conf}: this deal likely benefits from both sides reviewing terms before signature.`;
  }, [reviewRoute]);

  const runUpdate = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (disabled || busy) return;
      if (!prompt.trim()) {
        setErr("Add a short note, or pick a path when you are ready.");
        return;
      }
      setErr(null);
      setRefineSuccessMessage(null);
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
        const r = await postPremiumRefine(
          {
            current_document_text: baseline.text,
            intake_text: effectiveIntakeText,
            user_refinement_prompt: prompt.trim(),
            action: "update",
          },
          ac.signal,
        );
        const out = (r.updated_document_text || "").trim();
        const acc = evaluatePremiumRefineCandidate(baseline.len, out);
        // eslint-disable-next-line no-console
        console.info("[premium-refine-apply]", {
          currentProLen: baseline.len,
          refinedCandidateLen: acc.refinedLen,
          ratio: Number(acc.ratio.toFixed(4)),
          applyDecision: acc.decision,
          preservedExistingDoc: acc.decision !== "accepted",
          chosenSource: baseline.chosenSource,
          endpoint: "premium-refine",
          surface: "FinalizeYourAgreementPanel.runUpdate",
        });
        if (acc.decision === "rejected_short") {
          setLastRefine(null);
          setRefineSuccessMessage(null);
          setErr(formatProRefineRejectedShortInline());
          return;
        }
        if (acc.decision === "rejected_empty") {
          setLastRefine(null);
          setRefineSuccessMessage(null);
          setErr("We couldn't apply that update. Try again.");
          return;
        }
        if (out) {
          setLastRefine(r);
          markDocumentDirty?.();
          onApplyDocumentText(r.updated_document_text);
          setPrompt("");
          setRefineSuccessMessage(PRO_REFINE_CHANGE_APPLIED_USER_MESSAGE);
        } else if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[agreement-refine] FinalizeYourAgreementPanel#runUpdate empty model output", { r });
        }
      } catch (e2) {
        if (e2 instanceof Error && e2.name === "AbortError") return;
        setRefineSuccessMessage(null);
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
      prompt,
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
      try {
        const baseline = pickAuthoritativeProCorpusForRefine({
          draft,
          agreementDocumentText: currentDocumentText || "",
        });
        const r = await postPremiumRefine(
          {
            current_document_text: baseline.text,
            intake_text: effectiveIntakeText,
            user_refinement_prompt: seed,
            action: "update",
          },
          undefined,
        );
        const out = (r.updated_document_text || "").trim();
        const acc = evaluatePremiumRefineCandidate(baseline.len, out);
        if (acc.decision === "rejected_short") {
          setLastRefine(null);
          setRefineSuccessMessage(null);
          setErr(formatProRefineRejectedShortInline());
          return;
        }
        if (acc.decision === "rejected_empty") {
          setLastRefine(null);
          setRefineSuccessMessage(null);
          setErr("We couldn't apply that update. Try again.");
          return;
        }
        if (out) {
          setLastRefine(r);
          markDocumentDirty?.();
          onApplyDocumentText(r.updated_document_text);
          setRefineSuccessMessage(PRO_REFINE_CHANGE_APPLIED_USER_MESSAGE);
        }
      } catch (e2) {
        setRefineSuccessMessage(null);
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
    currentDocumentText,
    draft,
    intakeText,
    effectiveCurrentDocumentText,
    effectiveIntakeText,
    devProRefineContext,
    disabled,
    markDocumentDirty,
    onApplyDocumentText,
  ]);

  return (
    <div
      className="mb-4 rounded-2xl border border-slate-600/50 bg-slate-950/80 p-4 shadow-md ring-1 ring-slate-700/40 sm:mb-5 sm:p-5"
      role="region"
      aria-label="Pro review and next steps"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-slate-100 sm:text-lg">Pro review & next steps</h3>
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
      {reviewRoute ? (
        <div className="mt-4 rounded-xl border border-cyan-500/25 bg-cyan-950/15 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-cyan-100">{routeBadge}</p>
            <p className="rounded-md border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 text-[11px] text-cyan-200">
              Confidence: {reviewRoute.confidence}
            </p>
          </div>
          <p className="mt-1.5 text-sm text-cyan-100/90">{reviewRoute.short_summary || routeCopy}</p>
          {reviewRoute.route === "fix" && reviewRoute.unresolved_items.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-cyan-50/95">
              {reviewRoute.unresolved_items.slice(0, 3).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="rounded-lg bg-cyan-400 px-3.5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
              disabled={disabled || busy}
              onClick={() => {
                if (reviewRoute.route === "fix") {
                  onRouteFixPrimary?.();
                  return;
                }
                if (reviewRoute.route === "signature") onSendForSignature();
                else onReadyForReview();
              }}
            >
              {reviewRoute.recommended_cta}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-500/70 bg-slate-900/70 px-3.5 py-2 text-sm text-slate-100 transition hover:border-slate-400"
              disabled={disabled || busy}
              onClick={() => (reviewRoute.route === "review" ? onSendForSignature() : onReadyForReview())}
            >
              {reviewRoute.route === "review" ? "Send for signature anyway" : "Invite reviewer first"}
            </button>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={runUpdate}
        className="mt-4 space-y-3 border-t border-slate-700/50 pt-4"
      >
        <VoiceAugmentedTextArea
          ref={refineTextareaRef}
          value={prompt}
          onValueChange={setPrompt}
          surface="dark"
          disabled={disabled || busy}
          dictationControlRef={dictationRef}
          voiceSubtleIdle={true}
          placeholder={PLACEHOLDER}
          rows={3}
          className="w-full rounded-xl border border-slate-600/50 bg-slate-900/90 px-3.5 py-2.5 pr-14 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 sm:px-4"
          autoComplete="off"
          name="finalize-refinement"
          aria-label={PLACEHOLDER}
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
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
          <button
            type="submit"
            className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
            disabled={disabled || busy}
          >
            {busy ? "Working…" : "Update agreement"}
          </button>
          <button
            type="button"
            className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${
              sendModeTouched && sendMode === "review"
                ? "border-emerald-500/80 bg-emerald-950/35 text-emerald-100 hover:border-emerald-400/80"
                : "border-slate-500/70 bg-slate-800/80 text-slate-100 hover:border-slate-400 hover:bg-slate-800"
            }`}
            disabled={disabled || busy}
            onClick={() => onReadyForReview()}
          >
            Review first
          </button>
          <button
            type="button"
            className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${
              sendModeTouched && sendMode === "signature"
                ? "border-emerald-500/80 bg-emerald-950/35 text-emerald-100 hover:border-emerald-400/80"
                : "border-slate-500/70 bg-slate-800/80 text-slate-100 hover:border-slate-400 hover:bg-slate-800"
            }`}
            disabled={disabled || busy}
            onClick={() => onSendForSignature()}
          >
            Send for signature
          </button>
        </div>
      </form>
    </div>
  );
}
