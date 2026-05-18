import { useEffect, useState } from "react";
import type { UpgradeComparisonRow } from "./fullDraftUpgradeSignals";
import type { UpgradeIntentSignal } from "./upgradeTeaser";
import {
  STARTER_REVIEW_PREMIUM_BULLETS,
  STARTER_REVIEW_PREMIUM_BODY,
  STARTER_REVIEW_PREMIUM_CTA,
  STARTER_REVIEW_PREMIUM_CTA_BUTTON_CLASSNAME,
  STARTER_REVIEW_PREMIUM_HEADLINE,
  STARTER_REVIEW_PREMIUM_LIST_GLYPH_CLASSNAME,
  STARTER_REVIEW_PREMIUM_MICROCOPY,
  STARTER_REVIEW_PREMIUM_PANEL_CLASSNAME,
} from "./starterReviewPremiumUpsellCopy";
import { PRO_UPGRADE_CAN_HELP_HEADING } from "../../launch/simpleProduct/proConversionCopy";

type GhostClauseItem = { id: string; label: string; snippet: string };

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

const INTENT_PRIORITY: UpgradeIntentSignal[] = ["exit", "liability", "profit", "voting"];

/** Legacy helper — kept for unit tests; not shown in primary conversion UI. */
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

export type FullDraftUpgradeDiffPreviewProps = {
  rows: UpgradeComparisonRow[];
  onGenerate: () => void | Promise<void>;
  /** @deprecated Ghost gap previews removed from primary conversion path. */
  showGhostClausePreview?: boolean;
  /** @deprecated */
  intentSignals?: UpgradeIntentSignal[];
};

/**
 * Inline Pro enhancement card for review — calm upgrade framing, no fear gaps.
 */
export function FullDraftUpgradeDiffPreview({
  onGenerate,
}: FullDraftUpgradeDiffPreviewProps) {
  const [revealed, setRevealed] = useState(false);

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
      <p className="mt-2 max-w-[600px] text-sm leading-snug text-slate-300">{STARTER_REVIEW_PREMIUM_BODY}</p>
      <p className="mt-3 text-xs font-medium leading-snug text-slate-400 sm:text-sm">{PRO_UPGRADE_CAN_HELP_HEADING}</p>
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

      <button
        type="button"
        className={`mt-4 w-full min-h-[2.75rem] py-2.5 text-center text-[0.9375rem] sm:text-base ${STARTER_REVIEW_PREMIUM_CTA_BUTTON_CLASSNAME}`}
        onClick={() => void onGenerate()}
      >
        {STARTER_REVIEW_PREMIUM_CTA}
      </button>
      <p className="mt-2 text-center text-[11px] leading-snug text-slate-400 sm:text-xs">{STARTER_REVIEW_PREMIUM_MICROCOPY}</p>
    </section>
  );
}
