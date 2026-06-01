/**
 * Single authoritative paid Pro bottom sticky CTA — one phase machine, one resolver.
 *
 * Flow: signer_details_required → signer_details_complete → review_decision → prepare_signing → send_ready
 * (DRAFT-stage Pro intake continues to use legacy production CTAs outside this resolver.)
 */

import {
  PAID_PRO_PREPARE_ESIGN_DECISION_CTA,
  PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA,
  PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA,
} from "./signerSetupPartyIdentity";

export type PaidProStickyCtaPhase =
  | "signer_details_required"
  | "signer_details_complete"
  | "review_decision"
  | "prepare_signing"
  | "send_ready";

export type PaidProStickyCtaAction =
  | "guided_continue"
  | "complete_recipient_details"
  | "send_agreement";

export type PaidProStickyCtaState = {
  phase: PaidProStickyCtaPhase;
  label: string;
  action: PaidProStickyCtaAction;
  disabled: boolean;
  reason: string;
  /** When false the bottom sticky bar should stay hidden (decision CTAs live on the draft card). */
  showStickyBar: boolean;
};

export type ResolvePaidProStickyCtaPhaseArgs = {
  hasAuthoritativeSigningSnapshot: boolean;
  signerDetailsComplete: boolean;
  inlineSignerSetupLatched: boolean;
  signaturePreparationRequested: boolean;
  /** Recipient / send surface is armed and send bar rules apply. */
  sendSurfaceReady: boolean;
};

export function resolvePaidProStickyCtaPhase(
  args: ResolvePaidProStickyCtaPhaseArgs,
): PaidProStickyCtaPhase {
  if (args.sendSurfaceReady && args.signaturePreparationRequested) {
    return "send_ready";
  }
  if (args.signaturePreparationRequested && args.hasAuthoritativeSigningSnapshot) {
    return "prepare_signing";
  }
  if (args.hasAuthoritativeSigningSnapshot) {
    return "review_decision";
  }
  if (args.signerDetailsComplete && args.inlineSignerSetupLatched) {
    return "signer_details_complete";
  }
  return "signer_details_required";
}

export function paidProStickyCtaShowsStickyBar(phase: PaidProStickyCtaPhase): boolean {
  return phase !== "prepare_signing";
}

export const PAID_PRO_SIGNER_SETUP_STICKY_HELPER =
  "Add signer name and email for each party before creating signature links.";

export const PAID_PRO_SIGNER_COMPLETE_STICKY_HELPER = "Nothing is sent until you confirm.";

export function resolvePaidProStickyBarHeadlines(phase: PaidProStickyCtaPhase): {
  headline: string | null;
  subline: string | null;
} {
  if (phase === "signer_details_required") {
    return { headline: null, subline: PAID_PRO_SIGNER_SETUP_STICKY_HELPER };
  }
  if (phase === "signer_details_complete") {
    return { headline: null, subline: PAID_PRO_SIGNER_COMPLETE_STICKY_HELPER };
  }
  return { headline: null, subline: null };
}

export type ResolvePaidProStickyCtaArgs = ResolvePaidProStickyCtaPhaseArgs & {
  sendLabel?: string;
  sendDisabled?: boolean;
};

/**
 * Canonical sticky CTA for accepted paid Pro review shell — callers must not parallel-derive
 * labels/actions from guided UX, delivery track, or finalize panels.
 */
export function resolvePaidProStickyCta(args: ResolvePaidProStickyCtaArgs): PaidProStickyCtaState {
  const phase = resolvePaidProStickyCtaPhase(args);
  const showStickyBar = paidProStickyCtaShowsStickyBar(phase);

  if (phase === "send_ready") {
    return {
      phase,
      showStickyBar,
      label: args.sendLabel?.trim() || "Send",
      action: "send_agreement",
      disabled: Boolean(args.sendDisabled),
      reason: "paid_pro_send_ready",
    };
  }

  if (phase === "prepare_signing") {
    return {
      phase,
      showStickyBar,
      label: "",
      action: "guided_continue",
      disabled: true,
      reason: "paid_pro_prepare_signing",
    };
  }

  if (phase === "review_decision") {
    return {
      phase,
      showStickyBar,
      label: PAID_PRO_PREPARE_ESIGN_DECISION_CTA,
      action: "guided_continue",
      disabled: false,
      reason: "paid_pro_review_decision_prepare_signing",
    };
  }

  if (phase === "signer_details_complete") {
    return {
      phase,
      showStickyBar,
      label: PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA,
      action: "guided_continue",
      disabled: false,
      reason: "paid_pro_signer_details_complete",
    };
  }

  return {
    phase,
    showStickyBar,
    label: PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA,
    action: "complete_recipient_details",
    disabled: false,
    reason: "paid_pro_signer_details_required",
  };
}

/** Maps canonical sticky state into AgreementBuilderIntake PrimaryCtaState shape. */
export function mapPaidProStickyCtaToPrimaryCta(
  state: PaidProStickyCtaState,
): {
  label: string;
  action: PaidProStickyCtaAction;
  disabled: boolean;
  reason: string;
} {
  return {
    label: state.label,
    action: state.action,
    disabled: state.disabled,
    reason: state.reason,
  };
}

/**
 * Snapshot drift must not clear a finalized signing snapshot unless the user re-opened
 * inline signer edit (latch armed).
 */
export function shouldClearSigningSnapshotOnSignerMetadataDrift(args: {
  hasSnapshot: boolean;
  inlineSignerSetupLatched: boolean;
  signaturePreparationRequested: boolean;
  drifted: boolean;
}): boolean {
  if (!args.hasSnapshot || !args.drifted) return false;
  if (args.signaturePreparationRequested) return false;
  return args.inlineSignerSetupLatched;
}
