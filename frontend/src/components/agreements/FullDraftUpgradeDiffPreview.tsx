import { useEffect, useMemo, useState } from "react";
import type { UpgradeComparisonRow } from "./fullDraftUpgradeSignals";
import type { UpgradeIntentSignal } from "./upgradeTeaser";
import {
  STARTER_REVIEW_PREMIUM_BULLETS,
  STARTER_REVIEW_PREMIUM_CTA,
  STARTER_REVIEW_PREMIUM_CTA_BUTTON_CLASSNAME,
  STARTER_REVIEW_PREMIUM_HEADLINE,
  STARTER_REVIEW_PREMIUM_LIST_GLYPH_CLASSNAME,
  STARTER_REVIEW_PREMIUM_MICROCOPY,
  STARTER_REVIEW_PREMIUM_PANEL_CLASSNAME,
} from "./starterReviewPremiumUpsellCopy";

export type FullDraftUpgradeDiffPreviewProps = {
  rows: UpgradeComparisonRow[];
  onGenerate: () => void | Promise<void>;
  /** When true (upgrade-eligible review), show compact clause-ghost previews. */
  showGhostClausePreview?: boolean;
  /** From `detectUpgradeIntentSignals`; used only when `showGhostClausePreview` is true. */
  intentSignals?: UpgradeIntentSignal[];
};

type GhostClauseItem = { id: string; label: string; snippet: string };

/** Gap-style lines: lead with “No…” / “Not defined…” (render splits for scan). */
const GHOST_BY_INTENT: Record<UpgradeIntentSignal, GhostClauseItem> = {
  exit: {
    id: "exit",
    label: "Exit",
    snippet: "No clear terms for how a party exits or transfers their interest.",
  },
  liability: {
    id: "liability",
    label: "Liability",
    snippet: "No defined limits on liability between parties.",
  },
  profit: {
    id: "profit",
    label: "Money / control",
    snippet: "No defined rules for how payments or benefits are split and enforced.",
  },
  voting: {
    id: "voting",
    label: "Control",
    snippet: "No defined rules for who decides what or how votes are counted.",
  },
};

/** Defaults when intake signals are weak: exit/termination, liability, disputes. */
const DEFAULT_GHOST: GhostClauseItem[] = [
  {
    id: "termination",
    label: "Termination",
    snippet: "No clear rule for how a party exits the agreement.",
  },
  {
    id: "liability",
    label: "Liability",
    snippet: "No defined limits on liability between parties.",
  },
  {
    id: "dispute",
    label: "Disputes",
    snippet: "No defined process for resolving disputes.",
  },
];

/** exit > liability > control/money > voting (disputes via defaults). */
const INTENT_PRIORITY: UpgradeIntentSignal[] = ["exit", "liability", "profit", "voting"];

/** At most 3 gap previews for the complete-agreement path. */
export function buildGhostClausePreviewItems(signals: UpgradeIntentSignal[]): GhostClauseItem[] {
  const out: GhostClauseItem[] = [];
  const used = new Set<string>();

  const push = (item: GhostClauseItem) => {
    if (out.length >= 3 || used.has(item.id)) return;
    used.add(item.id);
    out.push(item);
  };

  const signalSet = new Set(signals);
  for (const key of INTENT_PRIORITY) {
    if (signalSet.has(key)) push(GHOST_BY_INTENT[key]);
  }

  for (const item of DEFAULT_GHOST) {
    if (out.length >= 3) break;
    push(item);
  }

  return out.slice(0, 3);
}

function GapSnippetLine({ text }: { text: string }) {
  if (text.startsWith("Not defined")) {
    return (
      <p className="text-sm leading-[1.5]">
        <span className="font-medium text-slate-100">Not defined</span>
        <span className="text-slate-300">{text.slice("Not defined".length)}</span>
      </p>
    );
  }
  if (text.startsWith("No ")) {
    return (
      <p className="text-sm leading-[1.5]">
        <span className="font-medium text-slate-100">No</span>
        <span className="text-slate-300">{text.slice(2)}</span>
      </p>
    );
  }
  return <p className="text-sm leading-[1.5] text-slate-300">{text}</p>;
}

/**
 * Inline “basic vs complete” comparison for review — deterministic rows only, no AI.
 * Optional ghost strip: reads as gaps in the current draft, not optional add-ons.
 */
export function FullDraftUpgradeDiffPreview({
  rows,
  onGenerate,
  showGhostClausePreview = false,
  intentSignals = [],
}: FullDraftUpgradeDiffPreviewProps) {
  const [revealed, setRevealed] = useState(false);

  const ghostItems = useMemo(
    () => (showGhostClausePreview ? buildGhostClausePreviewItems(intentSignals) : []),
    [showGhostClausePreview, intentSignals],
  );

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setRevealed(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <section
      className={`mt-1 max-sm:mt-0.5 p-3 sm:mt-1 sm:p-4 motion-safe:transition-[opacity,transform] motion-safe:duration-500 motion-reduce:opacity-100 motion-reduce:translate-y-0 ${STARTER_REVIEW_PREMIUM_PANEL_CLASSNAME} ${
        revealed ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0"
      }`}
      aria-labelledby="full-draft-diff-preview-title"
    >
      <h3
        id="full-draft-diff-preview-title"
        className="text-base font-semibold tracking-tight text-slate-50 sm:text-lg"
      >
        {STARTER_REVIEW_PREMIUM_HEADLINE}
      </h3>
      <p className="mt-2 max-w-[600px] text-sm leading-snug text-slate-300">
        Your free draft is fine to move forward with. LawDog Pro turns it into a fuller, send-ready agreement — only if
        you choose to upgrade.
      </p>
      <ul className="mt-2 space-y-1.5 text-sm leading-snug text-slate-200/95 sm:leading-relaxed">
        {STARTER_REVIEW_PREMIUM_BULLETS.map((b) => (
          <li key={b} className="flex gap-2">
            <span className={STARTER_REVIEW_PREMIUM_LIST_GLYPH_CLASSNAME} aria-hidden>
              •
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div
        className="mt-1 overflow-hidden rounded-lg border border-slate-700/60 bg-slate-900/50"
        role="group"
        aria-label="Starter draft versus complete version comparison"
      >
        <div className="grid grid-cols-2 border-b border-slate-700/50 bg-slate-900/80">
          <div className="border-r border-slate-700/40 px-2 py-2 sm:px-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">This draft</p>
          </div>
          <div className="px-2 py-2 sm:px-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/85 sm:text-xs">Complete</p>
          </div>
        </div>
        <div>
          {rows.map((row, idx) => (
            <div
              key={`row-${idx}`}
              className="grid grid-cols-1 border-b border-slate-800/30 last:border-b-0 sm:grid-cols-2 sm:items-center"
            >
              <div className="flex min-h-[1.5rem] items-center px-2 py-2 text-sm leading-snug text-slate-300 sm:min-h-[1.65rem] sm:border-r sm:border-slate-800/25 sm:px-2.5 sm:leading-snug">
                <span className="w-full hyphens-auto">{row.basic}</span>
              </div>
              <div className="flex min-h-[1.5rem] items-center border-t border-slate-800/25 bg-amber-500/[0.05] px-2 py-2 text-sm leading-snug text-slate-100 sm:min-h-[1.65rem] sm:border-t-0 sm:bg-amber-500/[0.04] sm:px-2.5 sm:leading-snug">
                <span className="w-full hyphens-auto">{row.full}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showGhostClausePreview && ghostItems.length > 0 ? (
        <div className="mt-1 space-y-1" aria-label="What this draft does not cover">
          <p className="text-xs font-medium leading-snug text-slate-300 sm:text-sm sm:leading-tight">
            <span className="sm:hidden">Missing from this draft</span>
            <span className="hidden sm:inline">What your current draft doesn&apos;t cover</span>
          </p>
          <div className="space-y-1">
            {ghostItems.map((item, i) => (
              <div
                key={item.id}
                className={`border-l border-slate-600 bg-slate-900/40 py-0.5 pl-2 sm:pl-2.5 ${i === 2 ? "hidden sm:block" : ""}`}
              >
                <p className="text-xs font-medium leading-tight text-slate-300 sm:text-sm">
                  <span className="mr-1 text-slate-500" aria-hidden>
                    •
                  </span>
                  {item.label}
                </p>
                <div className="mt-px">
                  <GapSnippetLine text={item.snippet} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-2 rounded-lg border border-slate-700/45 bg-slate-900/40 p-3 sm:p-4">
        <p className="text-sm leading-snug text-slate-300">
          <span className="font-medium text-slate-100">
            Most real deals use this level of detail whether you&apos;re still negotiating or ready to sign.
          </span>{" "}
          Missing clauses can create real risk (termination, liability, disputes).
        </p>
        <ul className="mt-2 space-y-1 text-sm leading-snug text-slate-300 sm:leading-snug">
          <li className="flex gap-1.5">
            <span className="shrink-0 text-amber-400/85" aria-hidden>
              ✓
            </span>
            <span>Keeps your current intake — you return here to review</span>
          </li>
          <li className="flex gap-1.5">
            <span className="shrink-0 text-amber-400/85" aria-hidden>
              ✓
            </span>
            <span>Calmer review surface for counterparties</span>
          </li>
        </ul>
      </div>

      <button
        type="button"
        className={`mt-3 w-full min-h-[2.75rem] py-2.5 text-center text-[0.9375rem] sm:text-base ${STARTER_REVIEW_PREMIUM_CTA_BUTTON_CLASSNAME}`}
        onClick={() => void onGenerate()}
      >
        {STARTER_REVIEW_PREMIUM_CTA}
      </button>
      <p className="mt-2 text-center text-[11px] leading-snug text-slate-400 sm:text-xs">{STARTER_REVIEW_PREMIUM_MICROCOPY}</p>
    </section>
  );
}
