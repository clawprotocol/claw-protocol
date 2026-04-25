import type { UpgradeIntentSignal } from "./upgradeTeaser";
import {
  detectUpgradeIntentSignals,
  resolveUpgradePartyCount,
  resolveUpgradeTeaserAgreementType,
} from "./upgradeTeaser";

export type BuildUpgradeContextReasonsInput = {
  sourceText: string;
  agreementFamily: string | null | undefined;
  guidedFlowId: string;
  draftForParties: { parties?: unknown[] } | null | undefined;
  partiesLine: string | null | undefined;
};

const INTENT_REASONS: Record<UpgradeIntentSignal, string> = {
  profit: "How money moves between parties (profit, payouts, or distributions) is part of this deal",
  exit: "Exit, buyout, winding-down, or transfer terms show up in what you described",
  voting: "Voting, consent, or control decisions look relevant here",
  liability: "Liability, indemnity, or risk-shifting language is in play",
};

const MULTI_PARTY = "Multiple parties or shared responsibilities";
const LAW_VENUE = "State law, venue, or dispute-resolution choices matter for how this is enforced";
const GOVERNANCE =
  "This reads closer to an operating, governance, or tailored business agreement than a simple one-page draft";

function uniqueCompact(lines: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of lines) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * 2–4 human-facing lines explaining why the complete (full) draft path fits this agreement.
 * Uses the same intent detector and party / family resolution as upgrade teaser copy.
 */
export function buildUpgradeContextReasons(input: BuildUpgradeContextReasonsInput): string[] {
  const { sourceText, agreementFamily, guidedFlowId, draftForParties, partiesLine } = input;
  const raw = (sourceText || "").replace(/\s+/g, " ").trim();
  const low = raw.toLowerCase();
  const signals = detectUpgradeIntentSignals(raw);
  const teaserType = resolveUpgradeTeaserAgreementType(agreementFamily, guidedFlowId);
  const partyCount = resolveUpgradePartyCount(draftForParties, partiesLine);
  const pl = (partiesLine || "").trim();

  const candidates: string[] = [];

  if (partyCount >= 3 || (pl && /\s+and\s+/i.test(pl) && pl.split(/\s+and\s+/i).filter(Boolean).length >= 3)) {
    candidates.push(MULTI_PARTY);
  }

  if (
    /\b(governing\s+law|choice\s+of\s+law|venue|jurisdiction|conflict\s+of\s+laws)\b/i.test(low) ||
    /\b(delaware|new\s+york|texas|california)\s+(?:law|llc|corp|inc\.?)\b/i.test(low) ||
    /\b(arbitration|mediation|dispute\s+resolution)\b/i.test(low)
  ) {
    candidates.push(LAW_VENUE);
  }

  if (
    agreementFamily === "operating_agreement" ||
    teaserType === "LLC" ||
    /\b(member|manager-managed|member-managed|cap\s+table|fiduciary|managers?)\b/i.test(low)
  ) {
    candidates.push(GOVERNANCE);
  }

  for (const s of signals) {
    candidates.push(INTENT_REASONS[s]);
  }

  const merged = uniqueCompact(candidates, 6);

  if (merged.length >= 2) {
    return merged.slice(0, 4);
  }

  if (merged.length === 1) {
    return merged;
  }

  return [
    "Your wording points to more than a basic starter draft",
    "Payment, scope, endings, and risk usually need fuller treatment before signing",
  ];
}

/** Basic vs Plus contrast under plan cards (create-flow checkout); keeps continuity with upsell value story. */
export function checkoutLossAversionFromIntentSignals(_signals: readonly string[] | null | undefined): string {
  return "Starter draft = simple send link. Plus = collaborate on revisions, stronger protections, tracked signatures, and proof history.";
}
