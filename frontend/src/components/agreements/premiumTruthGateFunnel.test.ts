import { describe, expect, it } from "vitest";
import type { PaidFunnelStoredRow } from "../../lib/experimentation/paidFunnelLocalStorage";
import { buildStrictTruthGateCheckoutRevision } from "./premiumTruthGateFunnel";

function row(partial: Partial<PaidFunnelStoredRow>): PaidFunnelStoredRow {
  return {
    name: partial.name || "premium_checkout_opened",
    ts: partial.ts ?? 1,
    session_id: partial.session_id || "sid-1",
    agreement_intent_id: partial.agreement_intent_id,
    premium_generation_outcome: partial.premium_generation_outcome,
    render_source: partial.render_source,
    funnel_block_reason: partial.funnel_block_reason,
  };
}

describe("buildStrictTruthGateCheckoutRevision", () => {
  it("emits terminal needs_details row for blocked strict founder intent", () => {
    const out = buildStrictTruthGateCheckoutRevision({
      sessionId: "sid-1",
      rows: [row({ name: "premium_checkout_opened" })],
      gateStrictIntent: true,
      gateIntentId: "founder_equity_vesting",
      renderSource: "live_generated_preview",
    });
    expect(out).toEqual({
      agreement_intent_id: "founder_equity_vesting",
      premium_generation_outcome: "needs_details",
      render_source: "live_generated_preview",
      funnel_block_reason: "premium_pro_truth_gate",
    });
  });

  it("does not emit for custom_unknown fallback preview", () => {
    const out = buildStrictTruthGateCheckoutRevision({
      sessionId: "sid-1",
      rows: [row({ name: "premium_checkout_opened" })],
      gateStrictIntent: false,
      gateIntentId: "custom_unknown",
      renderSource: "fallback_preview",
    });
    expect(out).toBeNull();
  });

  it("does not emit duplicate truth-gate revision on remount", () => {
    const out = buildStrictTruthGateCheckoutRevision({
      sessionId: "sid-1",
      rows: [
        row({ name: "premium_checkout_opened" }),
        row({
          name: "premium_checkout_completed",
          premium_generation_outcome: "needs_details",
          funnel_block_reason: "premium_pro_truth_gate",
        }),
      ],
      gateStrictIntent: true,
      gateIntentId: "founder_equity_vesting",
      renderSource: "live_generated_preview",
    });
    expect(out).toBeNull();
  });

  it("emits strict founder row with expected metadata", () => {
    const out = buildStrictTruthGateCheckoutRevision({
      sessionId: "sid-founder",
      rows: [row({ session_id: "sid-founder", name: "premium_checkout_opened" })],
      gateStrictIntent: true,
      gateIntentId: "founder_equity_vesting",
      renderSource: "rejected_paid_corpus",
    });
    expect(out?.agreement_intent_id).toBe("founder_equity_vesting");
    expect(out?.premium_generation_outcome).toBe("needs_details");
    expect(out?.funnel_block_reason).toBe("premium_pro_truth_gate");
    expect(out?.render_source).toBe("rejected_paid_corpus");
  });

  it("uses session fallback strict intent when gate reports custom_unknown", () => {
    const out = buildStrictTruthGateCheckoutRevision({
      sessionId: "sid-1",
      rows: [
        row({ name: "premium_checkout_opened", agreement_intent_id: "custom_unknown" }),
        row({ name: "premium_upsell_seen", agreement_intent_id: "founder_equity_vesting" }),
      ],
      gateStrictIntent: false,
      gateIntentId: "custom_unknown",
      fallbackIntentId: "founder_equity_vesting",
      renderSource: "live_generated_preview",
    });
    expect(out?.agreement_intent_id).toBe("founder_equity_vesting");
    expect(out?.premium_generation_outcome).toBe("needs_details");
  });
});
