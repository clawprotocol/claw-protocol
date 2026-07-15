import {
  getLawdogEventEnvelope,
  getOrCreateLawdogSessionId,
  noteLawdogSessionAgreementCreated,
} from "../../tracking/lawdogSession";
import { recordProofActivityDay } from "../../leaderboard/proofActivityStore";
import { applyProductEventToReEngagement } from "../../launch/reEngagementStore";
import { appendGrowthEvent } from "./growthEventPersistence";
import { maybeForwardProductEventToBackend } from "./productEventsIngestStub";

/** Includes draft_created / draft_abandoned / agreement_sent for optional delayed automation (e.g. 24h follow-up). */
export type ProductEventName =
  | "landing_view"
  | "starter_selected"
  | "first_input_started"
  | "step_completed"
  | "ready_state_reached"
  | "generate_clicked"
  | "agreement_generated"
  | "pricing_viewed"
  | "homepage_loaded"
  | "homepage_cta_open_create_fresh"
  | "mic_used"
  | "agreement_created"
  | "draft_created"
  | "draft_abandoned"
  | "agreement_sent"
  | "agreement_edited"
  | "send_clicked"
  | "paywall_shown"
  | "paywall_triggered"
  | "paywall_viewed"
  | "paywall_clicked_upgrade"
  | "paywall_dismissed"
  | "upgrade_clicked"
  | "unlock_clicked"
  | "unlock_completed"
  | "paywall_revenue_attributed"
  | "conversion_completed"
  | "agreement_started"
  | "agreement_reviewed"
  | "ready_to_send_viewed"
  | "checkout_started"
  | "checkout_completed"
  | "send_completed"
  | "proof_viewed"
  | "proof_shared"
  | "affiliate_opportunity_viewed"
  | "affiliate_link_copied"
  | "leaderboard_viewed"
  | "affiliate_leaderboard_opened"
  | "affiliate_gamification_celebration_toast"
  | "challenge_viewed"
  | "challenge_completed"
  | "experiment_exposure"
  | "watermark_shown"
  | "draft_expired"
  | "draft_expiry_warning_shown"
  | "org_header_missing"
  | "upgrade_prompt_from_expiry"
  | "agreement_memory_opened"
  | "agreement_memory_query_submitted"
  | "agreement_memory_result_clicked"
  | "similar_agreement_requested"
  | "clause_reuse_suggested"
  | "relationship_view_opened"
  | "memory_paywall_shown"
  | "start_from_similar_clicked"
  | "memory_sync_requested"
  | "memory_empty_state_seen"
  | "memory_no_results_seen"
  | "field_review_opened"
  | "field_candidate_confirmed"
  | "field_candidate_corrected"
  | "field_candidate_rejected"
  | "field_candidate_added_manually"
  | "advanced_work_product_opened"
  | "advanced_work_product_type_selected"
  | "advanced_work_product_sources_selected"
  | "advanced_work_product_generated"
  | "advanced_work_product_refined"
  | "advanced_work_product_exported"
  | "advanced_work_product_paywall_shown"
  | "record_created"
  | "claim_record_viewed"
  | "claim_record_clicked"
  | "signup_started"
  | "signup_legal_assent"
  | "signup_completed"
  | "power_paywall_triggered"
  | "power_paywall_viewed"
  | "power_paywall_clicked_upgrade"
  | "power_paywall_dismissed"
  | "doginal_claim_viewed"
  | "doginal_claim_submitted"
  | "doginal_status_verified"
  | "doginal_status_removed"
  | "leaderboard_opt_in_viewed"
  | "leaderboard_visibility_chosen"
  | "affiliate_rank_card_shared"
  | "affiliate_rank_card_share_failed"
  | "quick_entry_choose"
  | "doginal_page_link_copied"
  | "doginal_share_clicked"
  | "readiness_shown"
  | "readiness_level_changed"
  | "readiness_continue_clicked"
  | "readiness_soft_warning_seen"
  /** Simple create: surface profile once per intake mount (fresh input-first vs continuity / resume). */
  | "simple_create_intake_loaded"
  /** Simple create: user reached idle-ready state; action bar emphasized (comparison funnel). */
  | "action_mode_entered"
  /** Simple create ready bar: send | review_edit | add_more */
  | "create_flow_cta_clicked"
  /** Simple create: one-tap clause stub under main intake. */
  | "intake_clause_suggestion_clicked"
  /** Simple create: context-aware suggestion chip under main intake. */
  | "intake_context_suggestion_clicked"
  | "intake_typing_started"
  | "draft_now_committed"
  | "link_copied"
  | "share_clicked"
  | "referral_signup"
  | "referral_code_captured"
  | "referral_checkout_started"
  | "referral_conversion_recorded"
  | "save_for_later_clicked"
  | "free_draft_generated"
  | "paid_create_submit_entitled_rewrite"
  | "dashboard_paid_create_screen"
  | "premium_upgrade_clicked"
  | "checkout_success_returned"
  | "pro_draft_loaded"
  | "continue_to_recipient_setup"
  | "review_link_created"
  | "signing_link_created"
  | "recipient_opened_link"
  | "recipient_submitted_edits"
  | "owner_applied_edits"
  | "signature_flow_started"
  | "agreement_completed"
  | "vs01_prepare_started"
  | "vs01_prepare_field_added"
  | "vs01_prepare_field_removed"
  | "vs01_prepare_completed"
  | "vs01_packet_sent_or_links_created"
  | "vs01_signer_opened"
  | "vs01_signer_completed"
  | "vs01_packet_fully_signed"
  | "starter_pro_refine_upsell_control_click"
  | "starter_pro_refine_upsell_variant_click"
  | "starter_pro_refine_control_impression"
  | "starter_pro_refine_variant_impression"
  | "starter_pro_refine_control_checkout_success"
  | "starter_pro_refine_variant_checkout_success"
  | "premium_upsell_seen"
  | "premium_checkout_opened"
  | "premium_checkout_completed"
  | "premium_success_banner_seen"
  | "premium_continue_recipients_clicked"
  | "recipient_setup_opened"
  | "send_abandoned_after_payment"
  | "anonymous_draft_created"
  | "claim_checkpoint_shown"
  | "claim_method_selected"
  | "google_authentication_started"
  | "magic_link_requested"
  | "authentication_completed"
  | "authentication_failed"
  | "anonymous_draft_claim_completed"
  | "anonymous_draft_claim_failed"
  | "continuation_restored"
  | "continuation_fallback_used"
  | "dashboard_sign_in_initiated"
  | "dashboard_opened"
  | "pro_upgrade_selected";

export type ProductEventRow = { name: ProductEventName; payload?: Record<string, unknown>; ts: number };

const queue: ProductEventRow[] = [];
const MAX = 500;

export function logProductEvent(name: ProductEventName, payload?: Record<string, unknown>): void {
  if (typeof window !== "undefined") {
    getOrCreateLawdogSessionId();
  }
  if (name === "agreement_created") {
    noteLawdogSessionAgreementCreated();
    recordProofActivityDay("Created agreement");
  }
  const envelope = typeof window !== "undefined" ? getLawdogEventEnvelope() : {};
  const merged: Record<string, unknown> = {
    ...envelope,
    ...(payload ?? {}),
  };
  merged.timestamp = new Date().toISOString();
  const row: ProductEventRow = { name, payload: merged, ts: Date.now() };
  queue.push(row);
  if (queue.length > MAX) queue.splice(0, queue.length - MAX);
  appendGrowthEvent({ name: row.name, ts: row.ts, payload: merged });
  void maybeForwardProductEventToBackend(row);
  if (typeof window !== "undefined") {
    applyProductEventToReEngagement({ name, payload: merged });
    window.dispatchEvent(new CustomEvent("claw:product-event", { detail: row }));
  }
}

export function drainProductEventsForTests(): ProductEventRow[] {
  const out = [...queue];
  queue.length = 0;
  return out;
}

export function peekProductEventsForTests(): ProductEventRow[] {
  return [...queue];
}
