/**
 * Clears draft-scoped session state when starting a new agreement from the dashboard.
 * Preserves per-agreement localStorage (VS01 packet status, reviewer approvals) and account org id.
 */

import { clearAgreementCreatorIntakeStorage, clearCreateReviewAgreementResumeId, clearCreateReviewDraftReadyMarker, readCreateReviewAgreementResumeId } from "../components/agreements/agreementIntakeStorage";
import { clearAuthoritativeSigningSnapshot } from "../components/agreements/authoritativeSigningSnapshot";
import { clearFrozenCanonicalAgreementCorpus } from "../components/agreements/canonicalAgreementSnapshot";
import { clearPaidProPinnedSignerAppliedCorpus } from "../components/agreements/paidProFinalHydratedCorpus";
import { clearPaidProReviewRenderFusedRepairCache } from "../components/agreements/paidProReviewRenderCorpus";
import { clearConsumedPaidProSignerMetadataAuthority } from "../components/agreements/paidProSignerMetadataAuthority";
import { clearPaidProSourceOfTruth } from "../components/agreements/paidProSourceOfTruth";
import { clearPaidProVisibleRenderMemo } from "../components/agreements/paidProVisibleRenderMemo";
import { clearPersistedGuidedSession } from "../components/agreements/guidedDealCompletion/guidedSessionPersistence";
import {
  clearPaidPremiumCompletionSession,
  clearPremiumCompletionDoneInLocalStorage,
  clearPremiumCompletionSnapshot,
  hasPaidPremiumCompletionSession,
  hasPremiumCheckoutReturnInUrl,
} from "../components/agreements/premiumCompletionStorage";
import { hasPaidProSourceOfTruth } from "../components/agreements/paidProSourceOfTruthState";
import { readSignedInAuthenticatedWorkspaceSession } from "./completedAgreementViewContext";
import {
  hasPaidDashboardCreateContextActive,
  isAppCreatePath,
  isHeroFromHomeCreateEntry,
  markDashboardPaidCreateRoute,
  markDirectAuthenticatedCreateBootstrapAttempted,
} from "./paidDashboardCreateContext";
import { clearPaidProPremiumRecipientHandoffReadGate } from "../components/agreements/paidProPremiumRecipientHandoffReadGate";
import { clearPremiumPartyNamesHandoff } from "../components/agreements/premiumPartyNamesHandoff";
import {
  bumpAgreementGenerationIdForFreshSession,
  clearCurrentSessionProEntitlementMarkers,
} from "../components/agreements/paidProSessionEligibility";
import { resetHeroHandoffForCreateNavigationWithoutPayload } from "./heroIntakePrefill";
import { clearLawdogEntryContext, setLawdogEntryContext } from "./lawdogEntryContext";
import { clearAgreementVs01BridgeSession } from "./simpleProduct/agreementToVs01SigningBridge";
import { REVIEW_DELIVERY_HANDOFF_NOTICE_KEY } from "./reviewDeliveryHandoffNotice";

export type NewAgreementSessionResetResult = {
  clearedSessionKeys: string[];
  clearedInMemoryModules: string[];
};

const SESSION_PREFIXES_TO_CLEAR = [
  "claw_agreement_create_",
  "claw_checkout_back_",
  "claw_simple_send_phase_v1_",
  "claw_uploaded_source_document_v1:",
  "claw_review_edited_version_intent_v1:",
  "claw_simple_done_review_recipient_links_v1:",
  "claw_rml_v2:",
  "claw_guided_completion_locked_v1",
  "claw_guided_vs01_signing_handoff_v1",
  "claw_premium_completion_snapshot_v1",
  "claw_premium_recipients_surface_released_v1",
  "claw_premium_recipient_handoff",
  "claw_paid_premium_completion_session_v1",
  "claw_paid_pro_vs01_post_sign_v1",
  "claw_agreement_vs01_bridge_handoff_v1",
  "claw_authoritative_agreement_version_v1",
  "claw_hero_intake_prefill_v1",
  "lawdog_entry_context",
  "lawdog_focus_create_intake",
  REVIEW_DELIVERY_HANDOFF_NOTICE_KEY,
] as const;

function clearMatchingSessionStoragePrefixes(prefixes: readonly string[]): string[] {
  if (typeof sessionStorage === "undefined") return [];
  const cleared: string[] = [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k) keys.push(k);
    }
    for (const key of keys) {
      if (prefixes.some((prefix) => key.startsWith(prefix) || key === prefix)) {
        sessionStorage.removeItem(key);
        cleared.push(key);
      }
    }
  } catch {
    /* ignore */
  }
  return cleared;
}

/** Clear VS01 draft state keys for a specific document id only (optional). */
export function clearVs01DraftSessionForDocument(documentId: string): void {
  const id = documentId.trim();
  if (!id || typeof sessionStorage === "undefined") return;
  const keys = [
    `claw_vs01_draft_state_v1_${id}`,
    `claw_vs01_canonical_seed_ss_${id}`,
    `claw_vs01_canonical_seed_ls_${id}`,
    `claw_vs01_canonical_portable_ss_${id}`,
    `claw_vs01_canonical_portable_ls_${id}`,
  ];
  try {
    for (const key of keys) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/** Drop in-memory + session paid Pro authority so a fresh free starter submit cannot inherit prior Pro QA. */
export function clearStalePaidProAuthorityForFreshFreeStarter(opts?: {
  preserveCheckoutReturn?: boolean;
}): void {
  if (opts?.preserveCheckoutReturn !== false && hasPremiumCheckoutReturnInUrl()) return;
  clearPaidProPremiumRecipientHandoffReadGate();
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearAuthoritativeSigningSnapshot();
  clearPaidProPinnedSignerAppliedCorpus();
  clearPaidProReviewRenderFusedRepairCache();
  clearFrozenCanonicalAgreementCorpus();
  clearPaidProVisibleRenderMemo();
  clearPaidPremiumCompletionSession();
  clearPremiumCompletionSnapshot();
  clearPremiumCompletionDoneInLocalStorage();
  clearPremiumPartyNamesHandoff();
  clearPersistedGuidedSession();
}

/**
 * Reset global create-flow state before navigating to /app/create.
 * Does not remove vs01_signing_packet_status_v1:{agreementId} or other per-agreement keys.
 */
export function initializeNewAgreementSession(opts?: {
  priorAgreementId?: string | null;
}): NewAgreementSessionResetResult {
  const clearedSessionKeys = clearMatchingSessionStoragePrefixes(SESSION_PREFIXES_TO_CLEAR);
  clearAgreementCreatorIntakeStorage();
  clearCreateReviewAgreementResumeId();
  clearCreateReviewDraftReadyMarker();
  resetHeroHandoffForCreateNavigationWithoutPayload();
  clearLawdogEntryContext();
  clearAgreementVs01BridgeSession();
  clearPremiumPartyNamesHandoff();
  clearPaidProPremiumRecipientHandoffReadGate();
  bumpAgreementGenerationIdForFreshSession();
  clearCurrentSessionProEntitlementMarkers();

  const clearedInMemoryModules: string[] = [];
  clearStalePaidProAuthorityForFreshFreeStarter({ preserveCheckoutReturn: false });
  clearedInMemoryModules.push(
    "paidProSourceOfTruth",
    "paidProSignerMetadataAuthority",
    "authoritativeSigningSnapshot",
    "paidProPinnedSignerAppliedCorpus",
    "paidProReviewRenderFusedRepairCache",
    "frozenCanonicalAgreementCorpus",
    "paidProVisibleRenderMemo",
    "premiumCompletionSnapshot",
    "premiumRecipientHandoff",
    "persistedGuidedSession",
  );

  if (opts?.priorAgreementId?.trim()) {
    clearVs01DraftSessionForDocument(opts.priorAgreementId.trim());
  }

  setLawdogEntryContext("new");
  return { clearedSessionKeys, clearedInMemoryModules };
}

export type DirectAuthenticatedCreateEntryBootstrapResult = {
  bootstrapped: boolean;
  reason:
    | "no_window"
    | "not_app_create"
    | "marker_present"
    | "not_authenticated_workspace"
    | "checkout_return"
    | "premium_session_active"
    | "sot_active"
    | "resume_active"
    | "mark_failed"
    | "direct_entry_bootstrapped"
    | "hero_from_home";
};

/**
 * TEST543 — Direct authenticated entry to /app/create (typed URL / fresh tab / hard refresh) never
 * runs the Dashboard → Create bootstrap: it skips {@link initializeNewAgreementSession} and never
 * sets the paid-dashboard-create route marker (that marker is only set by SPA `navigate()`).
 *
 * That divergence (a) makes `shouldFailClosedBypassForAuthenticatedWorkspaceCreate()` fire
 * `[fatal-paid-dashboard-create-marker-missing]` on every render, and (b) leaves
 * `isDashboardPaidCreateRouteActive()` false, so direct entry is routed OFF the canonical
 * dashboard paid-create review/recovery path (validated-corpus gate + review_recovery screen) and
 * onto the generic returning-paid path, and it starts generation against un-reset stale runtime
 * state carried over from a prior agreement.
 *
 * This bootstraps a genuinely fresh direct entry to match the dashboard-created path exactly, before
 * any generation. It is a deliberate no-op for: non-/app/create paths, anonymous/public users, an
 * already-marked dashboard entry, a post-checkout return, an in-progress premium session, an
 * established SoT, or a resume/edit — so it never wipes legitimately in-progress or resumed work.
 */
export function bootstrapDirectAuthenticatedCreateEntryIfNeeded(): DirectAuthenticatedCreateEntryBootstrapResult {
  if (typeof window === "undefined") return { bootstrapped: false, reason: "no_window" };
  if (!isAppCreatePath()) return { bootstrapped: false, reason: "not_app_create" };
  if (isHeroFromHomeCreateEntry()) return { bootstrapped: false, reason: "hero_from_home" };
  // Dashboard → Create already set the marker (and ran initializeNewAgreementSession) — nothing to do.
  if (hasPaidDashboardCreateContextActive()) return { bootstrapped: false, reason: "marker_present" };
  // Only signed-in workspace users take the paid create route; anonymous/public keeps free starter.
  if (!readSignedInAuthenticatedWorkspaceSession()) {
    return { bootstrapped: false, reason: "not_authenticated_workspace" };
  }
  // Never reset an in-progress / resumed / post-checkout flow.
  if (hasPremiumCheckoutReturnInUrl()) return { bootstrapped: false, reason: "checkout_return" };
  if (hasPaidPremiumCompletionSession()) return { bootstrapped: false, reason: "premium_session_active" };
  if (hasPaidProSourceOfTruth()) return { bootstrapped: false, reason: "sot_active" };
  if (readCreateReviewAgreementResumeId()) return { bootstrapped: false, reason: "resume_active" };

  // Genuinely fresh authenticated direct entry — mirror Dashboard → Create: reset session state first,
  // then set the route marker (initializeNewAgreementSession does not clear the marker key).
  // TEST545 — record that we have genuinely reached the marker-write step, so a still-missing marker
  // AFTER this point (never before) is what the fail-closed probe treats as fatal.
  markDirectAuthenticatedCreateBootstrapAttempted();
  initializeNewAgreementSession();
  const marked = markDashboardPaidCreateRoute();
  return {
    bootstrapped: marked,
    reason: marked ? "direct_entry_bootstrapped" : "mark_failed",
  };
}

/** Read a per-agreement localStorage marker without mutating it (for isolation tests). */
export function readPerAgreementLocalMarker(keyPrefix: string, agreementId: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(`${keyPrefix}${agreementId}`);
  } catch {
    return null;
  }
}
