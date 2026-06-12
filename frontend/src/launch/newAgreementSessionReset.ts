/**
 * Clears draft-scoped session state when starting a new agreement from the dashboard.
 * Preserves per-agreement localStorage (VS01 packet status, reviewer approvals) and account org id.
 */

import { clearAgreementCreatorIntakeStorage, clearCreateReviewAgreementResumeId, clearCreateReviewDraftReadyMarker } from "../components/agreements/agreementIntakeStorage";
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
  hasPremiumCheckoutReturnInUrl,
} from "../components/agreements/premiumCompletionStorage";
import { clearPremiumPartyNamesHandoff } from "../components/agreements/premiumPartyNamesHandoff";
import { resetHeroHandoffForCreateNavigationWithoutPayload } from "./heroIntakePrefill";
import { clearLawdogEntryContext, setLawdogEntryContext } from "./lawdogEntryContext";
import { clearAgreementVs01BridgeSession } from "./simpleProduct/agreementToVs01SigningBridge";

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

/** Read a per-agreement localStorage marker without mutating it (for isolation tests). */
export function readPerAgreementLocalMarker(keyPrefix: string, agreementId: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(`${keyPrefix}${agreementId}`);
  } catch {
    return null;
  }
}
