import type { PaidFunnelStoredRow } from "../../lib/experimentation/paidFunnelLocalStorage";

type TruthGateRevisionArgs = {
  sessionId: string;
  rows: PaidFunnelStoredRow[];
  gateStrictIntent: boolean;
  gateIntentId: string;
  fallbackIntentId?: string | null;
  renderSource: string;
};

const TRUTH_GATE_REASON = "premium_pro_truth_gate";

export function hasTruthGateRevisionForSession(sessionId: string, rows: PaidFunnelStoredRow[]): boolean {
  if (!sessionId) return false;
  return rows.some(
    (r) =>
      r.session_id === sessionId &&
      r.name === "premium_checkout_completed" &&
      r.premium_generation_outcome === "needs_details" &&
      r.funnel_block_reason === TRUTH_GATE_REASON,
  );
}

export function sessionHasCheckoutOpened(sessionId: string, rows: PaidFunnelStoredRow[]): boolean {
  if (!sessionId) return false;
  return rows.some((r) => r.session_id === sessionId && r.name === "premium_checkout_opened");
}

export function buildStrictTruthGateCheckoutRevision(
  args: TruthGateRevisionArgs,
): Record<string, string> | null {
  const resolvedIntentId =
    args.gateIntentId && args.gateIntentId !== "custom_unknown"
      ? args.gateIntentId
      : args.fallbackIntentId && args.fallbackIntentId !== "custom_unknown"
        ? args.fallbackIntentId
        : "custom_unknown";
  const resolvedStrict = args.gateStrictIntent || resolvedIntentId !== "custom_unknown";
  if (!resolvedStrict) return null;
  if (!resolvedIntentId || resolvedIntentId === "custom_unknown") return null;
  if (!sessionHasCheckoutOpened(args.sessionId, args.rows)) return null;
  if (hasTruthGateRevisionForSession(args.sessionId, args.rows)) return null;
  return {
    agreement_intent_id: resolvedIntentId,
    premium_generation_outcome: "needs_details",
    render_source: args.renderSource || "unknown",
    funnel_block_reason: TRUTH_GATE_REASON,
  };
}
