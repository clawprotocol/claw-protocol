import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgreementSnapshot,
  AgreementVersionRecord,
  NegotiationResponseType,
  NegotiationPosture,
} from "./agreementVersionStore";
import { fetchNegotiateAssist, type NegotiationAssistOption } from "./agreementNegotiationAssist";
import {
  DEFAULT_NEGOTIATION_POSTURE,
  NEGOTIATION_POSTURE_OPTIONS,
  postureLabelForHistory,
} from "./negotiationPostures";
import type { NegotiationRiskAssessment } from "./negotiationRisk";
import { detectChangedSnapshotFields } from "./negotiationMemory";
import { clauseFrictionDisplayLabel, computeNegotiationPatterns } from "../vs01/negotiationPatterns";
import {
  analyzeNegotiationConvergence,
  convergenceProgressHeadline,
} from "../vs01/negotiationConvergence";
import { buildCloseAcceleration } from "../vs01/closeAcceleration";
import {
  buildCloseAnalysis,
  closeRecommendationHeadline,
  type CloseRecommendation,
} from "../vs01/closeRecommendation";
import {
  buildNegotiationSuggestions,
  toSuggestionContextMeta,
  type SuggestionContextMeta,
} from "../vs01/negotiationSuggestions";
import { buildClauseClosePlaybook } from "../vs01/clauseClosePlaybooks";
import { DisclosureBanner } from "../compliance/DisclosureBanner";
import { AI_ASSISTIVE_SHORT, AI_ASSISTIVE_REVIEW_SHORT } from "../compliance/disclosureCopy";
import { VoiceAugmentedTextArea } from "../launch/VoiceAugmentedControl";

type Props = {
  agreementId: string;
  headVersion: AgreementVersionRecord;
  priorVersion: AgreementVersionRecord | null;
  /** Full local version list for deterministic pattern stats (no API). */
  versionHistory?: AgreementVersionRecord[];
  disabled: boolean;
  busy: boolean;
  /** Sync latest playbook + triage for manual “Propose an edit” memory (no extra API calls). */
  onMemoryContextChange?: (ctx: {
    posture: NegotiationPosture;
    riskAssessment: NegotiationRiskAssessment | null;
  }) => void;
  onRespond: (args: {
    instruction: string;
    responseType: NegotiationResponseType;
    negotiationSummary: string;
    negotiationPosture?: NegotiationPosture;
    riskAssessment?: NegotiationRiskAssessment | null;
    suggestionContext?: SuggestionContextMeta;
  }) => Promise<boolean>;
  /** Increment after a negotiation-sourced revision is committed to clear “Write your own counter”. */
  negotiationCommitSeq?: number;
  /** basic | premium — server tier routing (defaults gpt-4o-mini / gpt-4o via env). */
  aiModelClass?: "basic" | "premium";
};

function snapshotToRecord(s: AgreementSnapshot): Record<string, unknown> {
  return { ...s };
}

function riskChipClass(tier: NegotiationRiskAssessment["tier"]): string {
  switch (tier) {
    case "low_risk":
      return "border-emerald-700/45 bg-emerald-950/25 text-emerald-100";
    case "economic_impact":
      return "border-amber-700/40 bg-amber-950/25 text-amber-100";
    case "manual_legal_review":
      return "border-violet-700/45 bg-violet-950/30 text-violet-100";
    default:
      return "border-slate-600 bg-slate-900/50 text-slate-200";
  }
}

export const NegotiationAssistantPanel: React.FC<Props> = ({
  agreementId,
  headVersion,
  priorVersion,
  versionHistory = [],
  disabled,
  busy,
  onMemoryContextChange,
  onRespond,
  negotiationCommitSeq = 0,
  aiModelClass,
}) => {
  const [posture, setPosture] = useState<NegotiationPosture>(DEFAULT_NEGOTIATION_POSTURE);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [whatChanged, setWhatChanged] = useState("");
  const [riskAssessment, setRiskAssessment] = useState<NegotiationRiskAssessment | null>(null);
  const [triageUnavailable, setTriageUnavailable] = useState(false);
  const [clawOptions, setClawOptions] = useState<NegotiationAssistOption[]>([]);
  const [clawLoading, setClawLoading] = useState(false);
  const [clawLoaded, setClawLoaded] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const lastCommitSeq = useRef(negotiationCommitSeq);

  useEffect(() => {
    if (negotiationCommitSeq > lastCommitSeq.current) {
      setCustomText("");
    }
    lastCommitSeq.current = negotiationCommitSeq;
  }, [negotiationCommitSeq]);

  const who = headVersion.label || "Recipient";
  const when = new Date(headVersion.created_at).toLocaleString();
  const postureRow = NEGOTIATION_POSTURE_OPTIONS.find((p) => p.id === posture);

  useEffect(() => {
    setClawLoaded(false);
    setClawOptions([]);
    setOptionsError(null);
  }, [posture]);

  useEffect(() => {
    onMemoryContextChange?.({ posture, riskAssessment });
  }, [posture, riskAssessment, onMemoryContextChange]);

  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError(null);
    setWhatChanged("");
    setRiskAssessment(null);
    setTriageUnavailable(false);
    void (async () => {
      try {
        const res = await fetchNegotiateAssist({
          agreementId,
          recipientInstruction: headVersion.instruction,
          priorSnapshot: priorVersion ? snapshotToRecord(priorVersion.snapshot) : null,
          currentSnapshot: snapshotToRecord(headVersion.snapshot),
          mode: "summary",
          negotiationPosture: posture,
          aiModelClass,
        });
        if (cancelled) return;
        setWhatChanged(res.what_changed);
        if (res.risk_assessment) {
          setRiskAssessment(res.risk_assessment);
          setTriageUnavailable(false);
        } else {
          setTriageUnavailable(true);
        }
      } catch {
        if (cancelled) return;
        setSummaryError("Could not load summary. You can still accept, counter, or reject.");
        setRiskAssessment(null);
        setTriageUnavailable(true);
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agreementId, headVersion.id, headVersion.instruction, priorVersion?.id, posture, aiModelClass]);

  async function askClawOptions() {
    setClawLoading(true);
    setOptionsError(null);
    try {
      const res = await fetchNegotiateAssist({
        agreementId,
        recipientInstruction: headVersion.instruction,
        priorSnapshot: priorVersion ? snapshotToRecord(priorVersion.snapshot) : null,
        currentSnapshot: snapshotToRecord(headVersion.snapshot),
        mode: "options",
        negotiationPosture: posture,
        aiModelClass,
      });
      if (res.risk_assessment) setRiskAssessment(res.risk_assessment);
      setClawOptions(res.options.filter((o) => o.instruction.trim()));
      setClawLoaded(true);
    } catch {
      setOptionsError("Could not load suggestions. Try again, or write your own counter.");
    } finally {
      setClawLoading(false);
    }
  }

  const riskForActions = riskAssessment;

  const patterns = useMemo(() => computeNegotiationPatterns(versionHistory), [versionHistory]);

  const currentChangedFields = useMemo(
    () => detectChangedSnapshotFields(priorVersion?.snapshot ?? null, headVersion.snapshot),
    [priorVersion?.snapshot, headVersion.snapshot]
  );

  const latestOwnerMemory = useMemo(() => {
    for (let i = versionHistory.length - 1; i >= 0; i--) {
      const v = versionHistory[i]!;
      if (v.created_by !== "owner") continue;
      const m = v.meta?.negotiation_memory;
      if (!m) continue;
      return {
        posture: m.posture,
        risk_level: m.risk_level,
        changed_fields: m.changed_fields,
      };
    }
    return null;
  }, [versionHistory]);

  const negotiationSuggestions = useMemo(
    () =>
      buildNegotiationSuggestions({
        patterns,
        currentRiskTier: riskAssessment?.tier ?? null,
        currentChangedFields,
        latestOwnerMemory,
      }),
    [patterns, riskAssessment?.tier, currentChangedFields, latestOwnerMemory]
  );

  const suggestionContextForRespond = useMemo(
    () =>
      patterns.totalNegotiationEvents >= 2
        ? toSuggestionContextMeta(negotiationSuggestions, patterns.totalNegotiationEvents)
        : undefined,
    [patterns, negotiationSuggestions]
  );

  const convergence = useMemo(
    () => analyzeNegotiationConvergence(versionHistory),
    [versionHistory]
  );

  const closeAnalysis = useMemo(
    () =>
      buildCloseAnalysis({
        patterns,
        convergence,
        suggestions: negotiationSuggestions,
        currentRiskTier: riskAssessment?.tier ?? null,
      }),
    [patterns, convergence, negotiationSuggestions, riskAssessment?.tier]
  );

  const closeAcceleration = useMemo(
    () =>
      buildCloseAcceleration({
        closeAnalysis,
        convergence,
        patterns,
        suggestions: negotiationSuggestions,
        currentRiskTier: riskAssessment?.tier ?? null,
        selectedPosture: posture,
      }),
    [closeAnalysis, convergence, patterns, negotiationSuggestions, riskAssessment?.tier, posture]
  );

  const dominantPostureForPlaybook = useMemo((): NegotiationPosture | null => {
    const entries = Object.entries(patterns.postureCounts);
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1] - a[1]);
    const top = entries[0];
    if (!top || top[1] <= 0) return null;
    return top[0] as NegotiationPosture;
  }, [patterns.postureCounts]);

  const clauseClosePlaybook = useMemo(
    () =>
      patterns.totalNegotiationEvents >= 2
        ? buildClauseClosePlaybook({
            patterns,
            closeAnalysis,
            closeAcceleration,
            currentRiskTier: riskAssessment?.tier ?? null,
            dominantPosture: dominantPostureForPlaybook,
          })
        : null,
    [
      patterns,
      closeAnalysis,
      closeAcceleration,
      riskAssessment?.tier,
      dominantPostureForPlaybook,
    ]
  );

  function convergenceSectionClasses(state: ReturnType<typeof analyzeNegotiationConvergence>["state"]) {
    switch (state) {
      case "converging":
        return "border-emerald-800/35 bg-emerald-950/15 text-emerald-100/95";
      case "stable":
        return "border-slate-700/50 bg-slate-950/30 text-slate-200";
      case "active":
        return "border-amber-800/30 bg-amber-950/15 text-amber-100/90";
      case "diverging":
        return "border-rose-900/35 bg-rose-950/20 text-rose-100/90";
    }
  }

  function closeSectionClasses(rec: CloseRecommendation): string {
    switch (rec) {
      case "ready_to_close":
        return "border-emerald-800/40 bg-emerald-950/20 text-emerald-100/95";
      case "resolve_issues":
        return "border-yellow-700/35 bg-yellow-950/15 text-yellow-100/90";
      case "continue_negotiation":
        return "border-amber-800/30 bg-amber-950/15 text-amber-100/90";
      case "pause_or_escalate":
        return "border-rose-900/40 bg-rose-950/25 text-rose-100/90";
    }
  }

  const patternsBlock = (
    <div className="mt-4 border-t border-slate-800 pt-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        What the assistant is reading (smart suggestions)
      </div>
      <p className="mt-1 text-[10px] leading-snug text-slate-500">
        From earlier review steps on this agreement. {AI_ASSISTIVE_SHORT}
      </p>
      {patterns.totalNegotiationEvents < 2 ? (
        <p className="mt-2 text-[11px] text-slate-500">Patterns will appear after more review history.</p>
      ) : (
        <>
          {patterns.topPatterns.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-snug text-slate-300">
              {patterns.topPatterns.map((p, i) => (
                <li key={`pat_${i}_${p.label}`}>{p.detail}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] tabular-nums text-slate-500">
            <span>Accepted {patterns.decisionCounts.accepted}</span>
            <span aria-hidden>·</span>
            <span>Modified {patterns.decisionCounts.modified}</span>
            <span aria-hidden>·</span>
            <span>Rejected {patterns.decisionCounts.rejected}</span>
          </div>
          {patterns.topFrictionClauses.length > 0 ? (
            <div className="mt-3 border-t border-slate-800/80 pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Where edits are clustering
              </div>
              <p className="mt-1 text-[10px] leading-snug text-slate-500">
                This is where most changes or pushback are happening.
              </p>
              <ul className="mt-1.5 list-none space-y-1 p-0 text-[11px] leading-snug text-slate-300">
                {patterns.topFrictionClauses.map((row) => {
                  const sev =
                    row.severity === "high"
                      ? "Most activity here"
                      : row.severity === "moderate"
                        ? "Some activity here"
                        : "Light activity";
                  return (
                    <li key={`fric_${row.clause}`}>
                      {clauseFrictionDisplayLabel(row.clause)} — {sev}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </>
      )}
      <div
        className={`mt-3 rounded-md border px-3 py-2.5 ${convergenceSectionClasses(
          patterns.totalNegotiationEvents < 2 ? "stable" : convergence.state
        )}`}
      >
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Progress readout (smart suggestions)
        </div>
        {patterns.totalNegotiationEvents < 2 ? (
          <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
            Not enough history yet to assess progress.
          </p>
        ) : (
          <>
            <p className="mt-1.5 text-[12px] font-medium leading-snug">
              {convergenceProgressHeadline(convergence.state)}
              {convergence.state === "diverging" ? (
                <span className="font-normal text-slate-500"> · Needs resolution</span>
              ) : null}
            </p>
            <p className="mt-1 text-[10px] leading-snug text-slate-500">
              {convergence.confidence === "high"
                ? "High confidence"
                : convergence.confidence === "moderate"
                  ? "Moderate confidence"
                  : "Low confidence"}{" "}
              — directional only, not a prediction.
            </p>
            <ul className="mt-1.5 mb-0 list-disc space-y-1 pl-4 text-[11px] leading-snug text-slate-300/95">
              {convergence.signals.slice(0, 4).map((line, i) => (
                <li key={`conv_${i}_${line.slice(0, 24)}`}>{line}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div
        className={`mt-3 rounded-md border px-3 py-2.5 ${
          patterns.totalNegotiationEvents < 2
            ? "border-slate-700/50 bg-slate-950/30 text-slate-200"
            : closeSectionClasses(closeAnalysis.recommendation)
        }`}
      >
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Suggested next step (smart suggestions)
        </div>
        <p className="mt-1.5 text-[12px] font-semibold leading-snug">
          {patterns.totalNegotiationEvents < 2
            ? "More review history is needed to recommend a next step."
            : closeRecommendationHeadline(closeAnalysis.recommendation)}
        </p>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">
          {closeAnalysis.confidence === "high"
            ? "High confidence"
            : closeAnalysis.confidence === "moderate"
              ? "Moderate confidence"
              : "Low confidence"}{" "}
          — {AI_ASSISTIVE_SHORT} Your workflow decides.
        </p>
        <ul className="mt-1.5 mb-0 list-disc space-y-1 pl-4 text-[11px] leading-snug text-slate-300/95">
          {closeAnalysis.reasons.slice(0, 3).map((line, i) => (
            <li key={`cls_${i}_${line.slice(0, 20)}`}>{line}</li>
          ))}
        </ul>
        {closeAnalysis.blockers && closeAnalysis.blockers.length > 0 ? (
          <div className="mt-2 border-t border-slate-700/40 pt-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              What&apos;s blocking closure
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-slate-300/90">
              {closeAnalysis.blockers.map((b, i) => (
                <li key={`blk_${i}_${b}`}>{b}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Next actions
        </div>
        <ul className="mt-1 mb-0 list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-slate-300/95">
          {closeAnalysis.nextActions.map((line, i) => (
            <li key={`nxa_${i}_${line.slice(0, 20)}`}>{line}</li>
          ))}
        </ul>
      </div>
      {patterns.totalNegotiationEvents < 2 ? (
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          More back-and-forth is needed before we can suggest how to close faster.
        </p>
      ) : closeAcceleration.suggestions.length > 0 ? (
        <div className="mt-3 rounded-md border border-slate-700/55 bg-slate-950/25 px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            How to close faster
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
            Small moves that may speed up signature — {AI_ASSISTIVE_SHORT}
          </p>
          <ul className="mt-2 mb-0 list-none space-y-2 p-0">
            {closeAcceleration.suggestions.map((s) => (
              <li key={s.id} className="text-[11px] leading-snug">
                <span className="font-medium text-slate-200">{s.label}</span>
                <span className="text-slate-500"> — </span>
                <span className="text-slate-400">{s.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {clauseClosePlaybook && patterns.totalNegotiationEvents >= 2 ? (
        <div className="mt-3 rounded-md border border-indigo-900/35 bg-indigo-950/20 px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Playbook for this clause
          </div>
          <p className="mt-0.5 text-[11px] font-medium leading-snug text-slate-200">{clauseClosePlaybook.clause}</p>
          <ul className="mt-1.5 mb-0 list-none space-y-1.5 p-0">
            {clauseClosePlaybook.playbook.slice(0, 4).map((row, i) => (
              <li key={`cpb_${i}_${row.label}`} className="text-[11px] leading-snug">
                <span className="font-medium text-slate-200">{row.label}</span>
                <span className="text-slate-500"> — </span>
                <span className="text-slate-400">{row.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-3 border-t border-slate-800/80 pt-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Suggested next move</div>
        {patterns.totalNegotiationEvents < 2 ? (
          <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
            Suggestions will improve as review history grows.
          </p>
        ) : (
          <>
            {negotiationSuggestions.suggestedPosture ? (
              <p className="mt-1.5 text-[11px] leading-snug text-slate-300">
                <span className="text-slate-500">Suggested posture (smart suggestions): </span>
                {postureLabelForHistory(negotiationSuggestions.suggestedPosture)}
              </p>
            ) : null}
            {(() => {
              const bullets = negotiationSuggestions.suggestions
                .filter((s) => s.type !== "posture")
                .slice(0, 3);
              if (bullets.length === 0) return null;
              return (
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-snug text-slate-300">
                  {bullets.map((s, i) => (
                    <li key={`nxmv_${i}_${s.label}`}>{s.detail}</li>
                  ))}
                </ul>
              );
            })()}
            <p
              className={
                negotiationSuggestions.escalationHint === "manual_review"
                  ? "mt-2 text-[10px] leading-snug text-violet-200/90"
                  : "mt-2 text-[10px] leading-snug text-slate-500"
              }
            >
              {negotiationSuggestions.escalationHint === "manual_review"
                ? "Manual review likely — treat this as high-attention before pushing harder."
                : negotiationSuggestions.escalationHint === "watch"
                  ? "Watch item — worth extra attention; escalation is not required yet."
                  : "Manual review is not indicated yet."}
            </p>
          </>
        )}
      </div>
    </div>
  );

  const banner = (
    <p className="rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-[11px] leading-snug text-amber-100/95">
      {AI_ASSISTIVE_REVIEW_SHORT} Nothing applies until you choose it.
    </p>
  );

  const triageBlock = (
    <div className="mt-4 border-t border-slate-800 pt-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Risk triage</div>
      <p className="mt-1 text-[10px] leading-snug text-slate-500">
        Informational triage only — {AI_ASSISTIVE_SHORT} LawDog does not decide legal outcomes for you.
      </p>
      {summaryLoading ? (
        <p className="mt-2 text-[11px] text-slate-500">Assessing…</p>
      ) : triageUnavailable && !riskAssessment ? (
        <p className="mt-2 text-[11px] text-slate-500">Risk triage unavailable. All response actions still work.</p>
      ) : riskAssessment ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${riskChipClass(riskAssessment.tier)}`}
            >
              {riskAssessment.label}
            </span>
            {riskAssessment.confidence === "low" ? (
              <span className="text-[10px] text-slate-500">Low confidence</span>
            ) : null}
          </div>
          <p className="text-xs leading-snug text-slate-200">{riskAssessment.explanation}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Why this surfaced (smart suggestions)
          </p>
          <p className="text-[11px] leading-snug text-slate-400">{riskAssessment.rationale}</p>
          <p className="text-[11px] leading-snug text-slate-500">{riskAssessment.helper_text}</p>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="rounded-lg border border-slate-700/90 bg-slate-900/55 p-4">
      <DisclosureBanner variant="legalAdjacentAi" className="mb-3" />
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Review assistant</div>
      <p className="mt-1 text-sm leading-relaxed text-slate-400">
        This panel does not change signed records or proof integrity on its own — same revise flow as the rest of the
        workspace. Everything here is optional until you apply it.
      </p>

      {patternsBlock}

      <div className="mt-4 border-t border-slate-800 pt-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">What changed</div>
        <ul className="mt-2 list-none space-y-1.5 p-0 text-xs text-slate-200">
          <li>
            <span className="text-slate-500">Who: </span>
            {who}
          </li>
          <li>
            <span className="text-slate-500">When: </span>
            {when}
          </li>
          <li>
            <span className="text-slate-500">Requested: </span>
            <q className="text-slate-100">{headVersion.instruction}</q>
          </li>
          <li className="pt-1 text-slate-300">
            {summaryLoading ? (
              <span className="text-slate-500">Summarizing…</span>
            ) : whatChanged ? (
              <>
                <span className="font-medium text-slate-400">Summary: </span>
                {whatChanged}
              </>
            ) : summaryError ? (
              <span className="text-slate-500">{summaryError}</span>
            ) : (
              <span className="text-slate-500">No summary available.</span>
            )}
          </li>
        </ul>
      </div>

      {triageBlock}

      <div className="mt-4 border-t border-slate-800 pt-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Review posture</div>
        <p className="mt-1 text-[11px] text-slate-500">
          This nudges how smart suggestions are framed. You still choose what to apply.
        </p>
        <select
          className="mt-2 w-full max-w-md rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          value={posture}
          disabled={disabled || busy}
          onChange={(e) => setPosture(e.target.value as NegotiationPosture)}
        >
          {NEGOTIATION_POSTURE_OPTIONS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {postureRow ? (
          <p className="mt-2 text-[11px] leading-snug text-sky-200/90">
            <span className="font-medium text-slate-400">{postureRow.label}: </span>
            {postureRow.preview}
          </p>
        ) : null}
      </div>

      <div className="mt-4 border-t border-slate-800 pt-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Suggested responses</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn rounded-lg bg-emerald-700/90 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
            disabled={disabled || busy}
            onClick={() => {
              void onRespond({
                instruction: `Accept the counterparty's proposed revision in full. Apply their request exactly as stated: ${headVersion.instruction}`,
                responseType: "accept",
                negotiationSummary: "accepted the proposed revision",
                riskAssessment: riskForActions,
                suggestionContext: suggestionContextForRespond,
              });
            }}
          >
            Accept change
          </button>
          <button
            type="button"
            className="btn rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-slate-500 disabled:opacity-50"
            disabled={disabled || busy}
            onClick={() => {
              void onRespond({
                instruction: `Counter the counterparty's proposal: ${headVersion.instruction}. Propose a compromise that partially addresses their request while preserving your prior terms where reasonable.`,
                responseType: "counter",
                negotiationSummary: "countered the proposal",
                riskAssessment: riskForActions,
                suggestionContext: suggestionContextForRespond,
              });
            }}
          >
            Counter
          </button>
          <button
            type="button"
            className="btn rounded-lg border border-rose-800/70 bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-950/45 disabled:opacity-50"
            disabled={disabled || busy}
            onClick={() => {
              void (async () => {
                const snap = priorVersion?.snapshot;
                if (!snap) {
                  await onRespond({
                    instruction: `Reject the counterparty's last revision. Keep the agreement aligned with the current server draft but explicitly decline their requested change: ${headVersion.instruction}`,
                    responseType: "reject",
                    negotiationSummary: "rejected the proposed change",
                    riskAssessment: riskForActions,
                    suggestionContext: suggestionContextForRespond,
                  });
                  return;
                }
                await onRespond({
                  instruction:
                    `Reject the counterparty's last revision and restore the agreement to the owner's prior terms before that revision. ` +
                    `Restore payment_terms to: ${snap.payment_terms}. Restore duration to: ${snap.duration ?? "unchanged"}. ` +
                    `Restore purpose to: ${snap.purpose}. Restore title to: ${snap.title}. ` +
                    `Restore jurisdiction to: ${snap.jurisdiction}. Restore effective_date to: ${snap.effective_date ?? "unchanged"}. ` +
                    `Do not apply their request: ${headVersion.instruction.slice(0, 500)}`,
                  responseType: "reject",
                  negotiationSummary: "rejected the proposed change",
                  riskAssessment: riskForActions,
                  suggestionContext: suggestionContextForRespond,
                });
              })();
            }}
          >
            Reject
          </button>
        </div>
        <div className="mt-3">
          <button
            type="button"
            className="btn text-xs font-semibold text-sky-300 underline decoration-sky-600/50 hover:text-sky-200 disabled:opacity-50"
            disabled={disabled || busy || clawLoading}
            onClick={() => void askClawOptions()}
          >
            {clawLoading ? "Generating suggestions…" : "Suggest response options"}
          </button>
        </div>
        {optionsError ? (
          <p className="mt-2 text-[11px] text-rose-300/95" role="alert">
            {optionsError}
          </p>
        ) : null}
        {clawLoaded ? (
          <div className="mt-3 space-y-3">
            {banner}
            {clawOptions.length === 0 ? (
              <p className="text-[11px] text-slate-500">No options returned. Use Write your own counter.</p>
            ) : (
              clawOptions.map((opt, idx) => (
                <div key={opt.id || idx} className="rounded-md border border-slate-700 bg-slate-950/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-200">
                      {String.fromCharCode(65 + idx)}. {opt.label}
                    </span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      {postureLabelForHistory(opt.posture)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{opt.summary}</p>
                  <button
                    type="button"
                    className="btn mt-2 rounded-md border border-emerald-700/50 bg-emerald-950/40 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-950/60 disabled:opacity-50"
                    disabled={disabled || busy || !opt.instruction.trim()}
                    onClick={() => {
                      void onRespond({
                        instruction: opt.instruction,
                        responseType: "suggested_option",
                        negotiationSummary: `used smart suggestion: ${opt.label}`,
                        negotiationPosture: opt.posture,
                        riskAssessment: riskForActions,
                        suggestionContext: suggestionContextForRespond,
                      });
                    }}
                  >
                    Use this response
                  </button>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-4 border-t border-slate-800 pt-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Write your own counter</div>
        <VoiceAugmentedTextArea
          wrapperClassName="mt-2"
          className="w-full min-h-[4.5rem] rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 pb-11 pr-11 text-sm text-slate-100"
          placeholder="Example: Keep payment at $4,000/month, but reduce reporting obligations and keep the 15-day termination right."
          value={customText}
          disabled={disabled || busy}
          onValueChange={setCustomText}
        />
        <button
          type="button"
          className="btn mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          disabled={disabled || busy || !customText.trim()}
            onClick={() => {
              const t = customText.trim();
              void (async () => {
                await onRespond({
                  instruction: t,
                  responseType: "custom",
                  negotiationSummary: "sent a custom counter",
                  riskAssessment: riskForActions,
                  suggestionContext: suggestionContextForRespond,
                });
              })();
            }}
        >
          Apply response
        </button>
      </div>
    </div>
  );
};
