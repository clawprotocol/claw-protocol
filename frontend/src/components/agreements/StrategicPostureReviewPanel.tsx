/**
 * StrategicPostureReviewPanel — calm, additive insight card.
 *
 * Renders ONLY when the caller passes a {@link StrategicPostureReview} that contains
 * at least one finding, missing companion document, or summary. Returns null otherwise.
 *
 * Does not orchestrate, fetch, mutate review state, or trigger LLM calls. Existing
 * review surfaces remain visually and behaviorally identical when this panel is not
 * supplied with data — callers integrate it as a pure-additive subtree.
 */

import { useCallback, useState } from "react";

import {
  STRATEGIC_POSTURE_DISCLAIMER,
  type StrategicPostureFinding,
  type StrategicPostureFindingSeverity,
  type StrategicPostureReview,
} from "./strategicPostureReview";

type Props = {
  /** Optional posture review payload. When undefined / empty, the panel renders nothing. */
  posture?: StrategicPostureReview | null;
  /** Optional className override for the outer card (defaults to LawDog calm-card chrome). */
  className?: string;
};

const SEVERITY_LABEL: Record<StrategicPostureFindingSeverity, string> = {
  low: "Future-proofing",
  medium: "Diligence gap",
  high: "Consider tightening",
};

const SEVERITY_CHIP_CLASS: Record<StrategicPostureFindingSeverity, string> = {
  low: "border-slate-500/40 bg-slate-800/60 text-slate-200",
  medium: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  high: "border-amber-300/55 bg-amber-500/15 text-amber-50",
};

function postureHasContent(p: StrategicPostureReview | null | undefined): p is StrategicPostureReview {
  if (!p) return false;
  if (p.findings && p.findings.length > 0) return true;
  if (p.missing_companion_documents && p.missing_companion_documents.length > 0) return true;
  if (p.summary && p.summary.trim().length > 0) return true;
  return false;
}

function CopyableSuggestion({ id, text }: { id: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; fail-soft so the suggested text remains visible.
    }
  }, [text]);
  return (
    <div
      data-testid={`strategic-posture-suggested-update-${id}`}
      className="mt-2 rounded-lg border border-slate-700/70 bg-slate-950/55 px-3 py-2.5 text-left"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Suggested update
        </p>
        <button
          type="button"
          data-testid={`strategic-posture-copy-${id}`}
          onClick={handleCopy}
          className="shrink-0 rounded-md border border-slate-600/70 bg-slate-900/70 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:border-emerald-500/40 hover:text-emerald-100"
          aria-label="Copy suggested update"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-100/95 sm:text-[0.9375rem]">{text}</p>
    </div>
  );
}

function FindingRow({ index, finding }: { index: number; finding: StrategicPostureFinding }) {
  const id = `${finding.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`;
  return (
    <li
      data-testid={`strategic-posture-finding-${index}`}
      className="rounded-xl border border-slate-700/70 bg-slate-900/55 px-4 py-3.5 text-left"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid={`strategic-posture-severity-${index}`}
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${SEVERITY_CHIP_CLASS[finding.severity]}`}
        >
          {SEVERITY_LABEL[finding.severity]}
        </span>
        <p className="text-sm font-semibold text-slate-50 sm:text-[0.9375rem]">{finding.category}</p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-200/95 sm:text-[0.9375rem]">{finding.observation}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-400 sm:text-[0.9375rem]">
        <span className="font-semibold text-slate-300">Why it matters: </span>
        {finding.why_it_matters}
      </p>
      {finding.evidence_excerpt ? (
        <blockquote
          data-testid={`strategic-posture-evidence-${index}`}
          className="mt-2 border-l-2 border-slate-600/70 bg-slate-950/40 px-3 py-1.5 text-xs leading-relaxed text-slate-400 sm:text-[0.8125rem]"
        >
          “{finding.evidence_excerpt}”
        </blockquote>
      ) : null}
      <CopyableSuggestion id={id} text={finding.suggested_update} />
    </li>
  );
}

/**
 * Optional, additive review-companion card. Pass `posture` to render; omit to render nothing.
 *
 * Use existing LawDog spacing, typography, and card styling. The component never modifies
 * the surrounding review state and never fires asynchronous side effects.
 */
export function StrategicPostureReviewPanel({ posture, className }: Props) {
  if (!postureHasContent(posture)) return null;

  const findings = posture.findings ?? [];
  const missing = posture.missing_companion_documents ?? [];

  return (
    <section
      data-testid="strategic-posture-review-panel"
      role="region"
      aria-label="Strategic posture review"
      className={
        className ??
        "mt-5 w-full rounded-xl border border-slate-700/70 bg-slate-900/40 p-4 text-left shadow-sm shadow-black/15 sm:p-5"
      }
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300/85">
            Optional · diligence prep
          </p>
          <h3
            id="strategic-posture-review-heading"
            className="mt-1 text-base font-semibold tracking-tight text-slate-50 sm:text-lg"
          >
            Strategic Posture Review
          </h3>
        </div>
        {typeof posture.posture_score === "number" && !posture.fail_soft ? (
          <span
            data-testid="strategic-posture-score"
            className="shrink-0 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-100"
            aria-label={`Posture score ${Math.round(posture.posture_score)} of 100`}
          >
            Posture {Math.round(posture.posture_score)} / 100
          </span>
        ) : null}
      </header>

      {posture.summary ? (
        <p
          data-testid="strategic-posture-summary"
          className="mt-2 text-sm leading-relaxed text-slate-300 sm:text-[0.9375rem]"
        >
          {posture.summary}
        </p>
      ) : null}

      {findings.length > 0 ? (
        <ul
          data-testid="strategic-posture-findings"
          className="mt-4 space-y-3"
        >
          {findings.map((f, i) => (
            <FindingRow key={`${f.category}-${i}`} index={i} finding={f} />
          ))}
        </ul>
      ) : null}

      {missing.length > 0 ? (
        <div
          data-testid="strategic-posture-missing-companions"
          className="mt-4 rounded-xl border border-slate-700/70 bg-slate-950/40 px-4 py-3 text-left"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Companion documents to consider
          </p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-200/95 sm:text-[0.9375rem]">
            {missing.map((doc, i) => (
              <li key={`${doc}-${i}`} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-500/80" aria-hidden />
                <span>{doc}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p
        data-testid="strategic-posture-disclaimer"
        className="mt-4 text-[11px] leading-snug text-slate-500 sm:text-xs"
      >
        {STRATEGIC_POSTURE_DISCLAIMER}
      </p>
    </section>
  );
}

export default StrategicPostureReviewPanel;
