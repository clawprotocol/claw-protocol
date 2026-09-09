/**
 * Finalize must bind one workspace agreement id before snapshot/persist.
 * Reuse the existing id. Clear persist errors only after that bind succeeds.
 */

export type ResolveFinalizeDurableAgreementIdArgs = {
  reviewAgreementId?: string | null;
  resumeAgreementId?: string | null;
  productionSendBarAgreementId?: string | null;
};

export type ResolveFinalizeDurableAgreementIdResult = {
  agreementId: string;
  reuseExisting: boolean;
  needsEnsure: boolean;
};

export function resolveFinalizeDurableAgreementId(
  args: ResolveFinalizeDurableAgreementIdArgs,
): ResolveFinalizeDurableAgreementIdResult {
  const existing = [
    args.reviewAgreementId,
    args.resumeAgreementId,
    args.productionSendBarAgreementId,
  ]
    .map((id) => (id || "").trim())
    .find(Boolean);
  if (existing) {
    return { agreementId: existing, reuseExisting: true, needsEnsure: false };
  }
  return { agreementId: "", reuseExisting: false, needsEnsure: true };
}

/** Persist errors stay visible until a durable id is actually bound. */
export function shouldClearCreateFlowDraftPersistErrorAfterDurableId(agreementId: string): boolean {
  return agreementId.trim().length > 0;
}
