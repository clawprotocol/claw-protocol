/**
 * Lightweight intake contradiction detection for create-flow microcopy.
 * Surfaces ambiguity before Pro generation — no backend or product-tier changes.
 */

export type IntakeContradictionKind =
  | "exclusive_scope"
  | "refund_policy"
  | "termination_notice"
  | "worker_classification"
  | "governing_law_venue";

export type IntakeContradictionHint = {
  kind: IntakeContradictionKind;
  message: string;
};

const EXCLUSIVE_NON_EXCLUSIVE: IntakeContradictionHint = {
  kind: "exclusive_scope",
  message:
    "You mentioned both exclusive and non-exclusive rights — clarify which scope applies before you send.",
};

const REFUND_CONFLICT: IntakeContradictionHint = {
  kind: "refund_policy",
  message:
    "Refund wording looks mixed (no refunds vs refunds allowed) — pick one policy so the draft stays clear.",
};

const TERMINATION_NOTICE: IntakeContradictionHint = {
  kind: "termination_notice",
  message:
    "Termination notice sounds inconsistent (immediate vs long notice) — confirm the notice period you want.",
};

const WORKER_CLASS: IntakeContradictionHint = {
  kind: "worker_classification",
  message:
    "This reads like both employee and contractor — classification affects the whole agreement; confirm the relationship.",
};

const LAW_VENUE: IntakeContradictionHint = {
  kind: "governing_law_venue",
  message:
    "Governing law / courts / region may conflict — confirm one state or country for enforcement.",
};

function hasExclusiveAndNonExclusive(low: string): boolean {
  const hasExclusive = /\bexclusive\b/i.test(low);
  const hasNonExclusive = /\bnon-?exclusive\b/i.test(low);
  return hasExclusive && hasNonExclusive;
}

function hasRefundConflict(low: string): boolean {
  const noRefund = /\bno\s+refunds?\b|\bnon-?refundable\b|\brefunds?\s+not\s+(?:offered|available)\b/i.test(low);
  const allowsRefund =
    /\b(full|any|unlimited)\s+refunds?\b|\brefunds?\s+any\s*time\b|\brefund\s+anytime\b|\bmoney\s+back\s+guarantee\b/i.test(
      low,
    );
  return noRefund && allowsRefund;
}

function hasTerminationNoticeConflict(low: string): boolean {
  const immediate =
    /\b(0|zero)\s+days?\s+notice\b|\bterminate\s+(?:at\s+any\s+time|anytime)\s+without\s+notice\b|\bimmediate(?:ly)?\s+terminat/i.test(
      low,
    );
  const longNotice =
    /\b(30|60|90|120)\s+days?\s+(?:written\s+)?notice\b|\b(?:ninety|sixty|thirty)\s+days?\s+(?:written\s+)?notice\b/i.test(
      low,
    );
  return immediate && longNotice;
}

function hasWorkerClassificationConflict(low: string): boolean {
  const employee = /\bemployee\b|\bw-?2\b|\bon\s+payroll\b/i.test(low);
  const contractor = /\b1099\b|\bindependent\s+contractor\b|\bcontractor\s+agreement\b/i.test(low);
  return employee && contractor;
}

function hasGoverningLawVenueConflict(low: string): boolean {
  const states = low.match(
    /\b(?:delaware|california|texas|new\s+york|florida|nevada|oklahoma|arizona|washington|illinois|georgia)\b/gi,
  );
  const uniqueStates = new Set((states || []).map((s) => s.toLowerCase().replace(/\s+/g, " ")));
  if (uniqueStates.size >= 2) return true;
  const usLaw = /\b(?:laws?\s+of\s+(?:the\s+state\s+of\s+)?)(?:delaware|california|texas|new\s+york)\b/i.test(low);
  const foreignLaw = /\b(?:laws?\s+of\s+)(?:the\s+)?(?:uk|united\s+kingdom|cayman|england|singapore)\b/i.test(low);
  return usLaw && foreignLaw;
}

/**
 * Returns human-facing contradiction hints (max `limit`) for intake microcopy.
 */
export function detectIntakeContradictionHints(raw: string, limit = 2): IntakeContradictionHint[] {
  const text = (raw || "").replace(/\s+/g, " ").trim();
  if (text.length < 12) return [];
  const low = text.toLowerCase();
  const out: IntakeContradictionHint[] = [];
  const push = (h: IntakeContradictionHint) => {
    if (out.some((x) => x.kind === h.kind)) return;
    out.push(h);
  };
  if (hasExclusiveAndNonExclusive(low)) push(EXCLUSIVE_NON_EXCLUSIVE);
  if (hasRefundConflict(low)) push(REFUND_CONFLICT);
  if (hasTerminationNoticeConflict(low)) push(TERMINATION_NOTICE);
  if (hasWorkerClassificationConflict(low)) push(WORKER_CLASS);
  if (hasGoverningLawVenueConflict(low)) push(LAW_VENUE);
  return out.slice(0, Math.max(1, limit));
}

/** Single line for intake status row (create flow). */
export function buildIntakeContradictionWarning(raw: string): string | null {
  const hints = detectIntakeContradictionHints(raw, 2);
  if (!hints.length) return null;
  return hints.map((h) => h.message).join(" ");
}
