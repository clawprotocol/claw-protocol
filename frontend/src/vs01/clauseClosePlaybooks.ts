/**
 * Deterministic clause-level close playbooks (no AI).
 */

import type { NegotiationPosture } from "../agreement/negotiationPostures";
import type { NegotiationRiskTier } from "../agreement/negotiationRisk";
import type { CloseAnalysis } from "./closeRecommendation";
import type { CloseAccelerationAnalysis } from "./closeAcceleration";
import {
  clauseFrictionDisplayLabel,
  type ClauseFrictionId,
  type NegotiationPatterns,
} from "./negotiationPatterns";

export type ClausePlaybookItemType =
  | "fallback"
  | "scope_trade"
  | "clarify"
  | "defer"
  | "escalate"
  | "close_now";

export type ClauseClosePlaybook = {
  clause: string;
  playbook: Array<{
    label: string;
    detail: string;
    type: ClausePlaybookItemType;
  }>;
};

function playbookForPaymentTerms(): ClauseClosePlaybook["playbook"] {
  return [
    {
      type: "fallback",
      label: "Offer a fallback amount",
      detail: "Propose a secondary number you can live with if the main ask does not land.",
    },
    {
      type: "clarify",
      label: "Trade timing instead of amount",
      detail: "Shift invoice cadence or milestones before you cut headline price.",
    },
    {
      type: "scope_trade",
      label: "Break payment into milestones",
      detail: "Tie installments to clear deliverables so risk is shared.",
    },
    {
      type: "scope_trade",
      label: "Narrow scope rather than cut price",
      detail: "Reduce deliverables before you concede on core economics.",
    },
  ];
}

function playbookForScope(): ClauseClosePlaybook["playbook"] {
  return [
    {
      type: "scope_trade",
      label: "Narrow deliverables",
      detail: "List what is in scope explicitly and park the rest.",
    },
    {
      type: "clarify",
      label: "Clarify exclusions",
      detail: "Call out what is not included so neither side assumes coverage.",
    },
    {
      type: "fallback",
      label: "Split optional work into an add-on",
      detail: "Keep the base agreement smaller; price appendix work separately.",
    },
    {
      type: "scope_trade",
      label: "Trade scope for speed or price certainty",
      detail: "Offer a tighter scope in exchange for faster close or firmer fees.",
    },
  ];
}

function playbookForDuration(): ClauseClosePlaybook["playbook"] {
  return [
    {
      type: "fallback",
      label: "Shorten initial term",
      detail: "A shorter first period lowers commitment while you prove the fit.",
    },
    {
      type: "clarify",
      label: "Add a renewal option",
      detail: "Auto-renew or renew on notice keeps upside without a forever term.",
    },
    {
      type: "clarify",
      label: "Add an early review checkpoint",
      detail: "Schedule a midpoint review before the term locks in further.",
    },
  ];
}

function playbookForTermination(): ClauseClosePlaybook["playbook"] {
  return [
    {
      type: "clarify",
      label: "Clarify notice period",
      detail: "Align on how many days’ notice either side needs.",
    },
    {
      type: "clarify",
      label: "Add a cure period",
      detail: "Give a short window to fix a breach before termination bites.",
    },
    {
      type: "scope_trade",
      label: "Narrow termination triggers",
      detail: "Limit triggers to material failures you can both recognize.",
    },
  ];
}

function playbookForConfidentiality(): ClauseClosePlaybook["playbook"] {
  return [
    {
      type: "clarify",
      label: "Clarify exceptions",
      detail: "Spell out carve-outs (lawful disclosure, advisors, affiliates).",
    },
    {
      type: "fallback",
      label: "Limit duration",
      detail: "Confidentiality often need not run longer than the relationship.",
    },
    {
      type: "clarify",
      label: "Separate trade-secret treatment",
      detail: "Treat highly sensitive information with tighter, shorter obligations.",
    },
  ];
}

function playbookForGoverningLaw(
  legalHeavy: boolean,
  repeatedLegalFriction: boolean
): ClauseClosePlaybook["playbook"] {
  const base: ClauseClosePlaybook["playbook"] = [
    {
      type: "defer",
      label: "Defer to signing-stage review",
      detail: "Park fine print cleanup for final pass if business terms are aligned.",
    },
    {
      type: "fallback",
      label: "Offer mutual-friendly venue fallback",
      detail: "Propose a neutral forum both sides can accept if the first choice stalls.",
    },
  ];
  if (legalHeavy || repeatedLegalFriction) {
    base.push({
      type: "escalate",
      label: "Flag for manual review if repeated",
      detail: "If this keeps cycling, loop in your review process before trading more text.",
    });
  }
  return base;
}

function playbookAdministrative(): ClauseClosePlaybook["playbook"] {
  return [
    {
      type: "close_now",
      label: "Low-friction cleanup",
      detail: "These items are often quick to align—confirm names, dates, and formatting.",
    },
    {
      type: "clarify",
      label: "Minor formatting only",
      detail: "Keep edits to signing blocks and metadata; avoid reopening substance.",
    },
  ];
}

function playbookOther(): ClauseClosePlaybook["playbook"] {
  return [
    {
      type: "clarify",
      label: "Clarify the open point",
      detail: "State the gap in one sentence each side can react to.",
    },
    {
      type: "fallback",
      label: "Offer a fallback position",
      detail: "Have a second option ready so the thread does not stall.",
    },
    {
      type: "close_now",
      label: "Close if only cleanup remains",
      detail: "If substance is done, move to finalize rather than polishing endlessly.",
    },
  ];
}

function legalDominant(patterns: NegotiationPatterns): boolean {
  const { low, economic, legal } = patterns.riskCounts;
  return legal > low && legal > economic;
}

export type BuildClauseClosePlaybookInput = {
  patterns: NegotiationPatterns;
  closeAnalysis: CloseAnalysis;
  closeAcceleration: CloseAccelerationAnalysis;
  currentRiskTier?: NegotiationRiskTier | null;
  dominantPosture?: NegotiationPosture | null;
};

const MAX_ITEMS = 4;

/** Pick items informed by close analysis (deterministic trims). */
function trimPlaybook(
  items: ClauseClosePlaybook["playbook"],
  closeAnalysis: CloseAnalysis,
  acceleration: CloseAccelerationAnalysis,
  clause: ClauseFrictionId
): ClauseClosePlaybook["playbook"] {
  let out = [...items];
  if (closeAnalysis.recommendation === "ready_to_close") {
    const cn = out.filter((i) => i.type === "close_now");
    const rest = out.filter((i) => i.type !== "close_now").slice(0, Math.max(0, MAX_ITEMS - cn.length));
    out = [...cn, ...rest].slice(0, MAX_ITEMS);
  }
  if (acceleration.suggestions.some((s) => s.type === "tighten_scope") && clause === "payment_terms") {
    const prefer = out.filter(
      (i) => i.type === "scope_trade" || i.detail.toLowerCase().includes("scope")
    );
    if (prefer.length > 0) out = [...prefer, ...out.filter((i) => !prefer.includes(i))].slice(0, MAX_ITEMS);
  }
  return out.slice(0, MAX_ITEMS);
}

export function buildClauseClosePlaybook(input: BuildClauseClosePlaybookInput): ClauseClosePlaybook | null {
  const { patterns, closeAnalysis, closeAcceleration, currentRiskTier, dominantPosture } = input;
  const top = patterns.topFrictionClauses[0];
  if (!top || top.score <= 0) return null;

  const clause = top.clause;
  const legalHeavy = legalDominant(patterns) || currentRiskTier === "manual_legal_review";
  const govRepeated =
    clause === "governing_law" && (top.severity === "moderate" || top.severity === "high");
  const founderOrProtect =
    dominantPosture === "founder_friendly" ||
    dominantPosture === "protective" ||
    (patterns.postureCounts["founder_friendly"] ?? 0) > 0 ||
    (patterns.postureCounts["protective"] ?? 0) > 0;

  let items: ClauseClosePlaybook["playbook"];
  switch (clause) {
    case "payment_terms":
      items = playbookForPaymentTerms();
      if (founderOrProtect) {
        const scopeFirst = items.filter(
          (i) =>
            i.type === "scope_trade" || i.detail.toLowerCase().includes("scope")
        );
        const rest = items.filter((i) => !scopeFirst.includes(i));
        items = [...scopeFirst, ...rest];
      }
      break;
    case "scope":
      items = playbookForScope();
      break;
    case "duration":
      items = playbookForDuration();
      break;
    case "termination":
      items = playbookForTermination();
      break;
    case "confidentiality":
      items = playbookForConfidentiality();
      break;
    case "governing_law":
      items = playbookForGoverningLaw(legalHeavy, govRepeated);
      break;
    case "other":
      items = playbookAdministrative();
      break;
    default:
      items = playbookOther();
  }

  const trimmed = trimPlaybook(items, closeAnalysis, closeAcceleration, clause);
  let finalItems = trimmed.slice(0, MAX_ITEMS);
  if (finalItems.length < 2 && clause !== "governing_law") {
    const pad = playbookOther().find((x) => !finalItems.some((y) => y.label === x.label));
    if (pad) finalItems.push(pad);
  }
  return {
    clause: clauseFrictionDisplayLabel(clause),
    playbook: finalItems.slice(0, MAX_ITEMS),
  };
}
