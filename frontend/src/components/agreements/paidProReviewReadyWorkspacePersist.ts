/**
 * Persist one workspace agreement row when authenticated Genesis/Pro review-ready
 * generation completes — before signer setup, review sharing, or signature prep.
 */

export type ReviewReadyWorkspacePersistResult =
  | { ok: true; agreementId: string; created: boolean }
  | { ok: false; reason: "not_required" | "persist_failed" };

export function shouldRequireWorkspacePersistOnReviewReady(args: {
  canonicalReviewEntered: boolean;
  hasReviewAgreementId: boolean;
  /** Paid/Genesis create path (skips free-starter submit latch). */
  skipFreeStarterCreateSubmit: boolean;
}): boolean {
  if (!args.canonicalReviewEntered) return false;
  if (args.hasReviewAgreementId) return false;
  if (!args.skipFreeStarterCreateSubmit) return false;
  return true;
}

/**
 * Auto-persist effect historically bailed once authoritative UI committed — but paid/Genesis
 * corpus only becomes persistable after that commit. Allow the effect for entitled create.
 */
export function shouldRunAutoPersistAfterAuthoritativeCommit(args: {
  authoritativePremiumUiCommitted: boolean;
  skipFreeStarterCreateSubmit: boolean;
}): boolean {
  if (!args.authoritativePremiumUiCommitted) return true;
  return Boolean(args.skipFreeStarterCreateSubmit);
}

export type ReviewReadyPersistFailureUiPlan = {
  premiumPersistedFlowActive: false;
  premiumSendPathUnlocked: false;
  proFullDraftQualityRetry: true;
  /** Do not leave the shell presenting a saved/generated agreement. */
  presentAsSavedAgreement: false;
};

export function planReviewReadyPersistFailureUi(): ReviewReadyPersistFailureUiPlan {
  return {
    premiumPersistedFlowActive: false,
    premiumSendPathUnlocked: false,
    proFullDraftQualityRetry: true,
    presentAsSavedAgreement: false,
  };
}

/**
 * Await workspace row creation after canonical review entry. Dedupes via existing id.
 * Callers must treat `ok: false` as a hard failure for review-ready presentation.
 */
export async function persistWorkspaceAgreementAfterReviewReady(args: {
  canonicalReviewEntered: boolean;
  existingAgreementId?: string | null;
  skipFreeStarterCreateSubmit: boolean;
  ensurePersist: () => Promise<string | null>;
}): Promise<ReviewReadyWorkspacePersistResult> {
  const existing = String(args.existingAgreementId ?? "").trim();
  if (existing) {
    return { ok: true, agreementId: existing, created: false };
  }
  if (
    !shouldRequireWorkspacePersistOnReviewReady({
      canonicalReviewEntered: args.canonicalReviewEntered,
      hasReviewAgreementId: false,
      skipFreeStarterCreateSubmit: args.skipFreeStarterCreateSubmit,
    })
  ) {
    return { ok: false, reason: "not_required" };
  }
  const id = String((await args.ensurePersist()) ?? "").trim();
  if (!id) return { ok: false, reason: "persist_failed" };
  return { ok: true, agreementId: id, created: true };
}
