/**
 * Forced first-review (decision_1) Ask LawDog gates.
 *
 * Ask LawDog to revise must mount on PaidProForcedFirstReviewChrome without
 * requiring signer finalize. Successful Apply persists through the same
 * commercial review snapshot path as Save edits — no second Review SoT.
 */

export const PAID_PRO_ASK_LAWDOG_REFINE_REVISION_REASON = "pro_ask_lawdog_refine_revision";

export function shouldMountPaidProForcedFirstReviewAskLawDog(args: {
  onApplySuggestEdits?: (() => void) | null;
  onSuggestEditsDraftChange?: ((value: string) => void) | null;
}): boolean {
  return Boolean(args.onApplySuggestEdits && args.onSuggestEditsDraftChange);
}

/** Persist refined body to CRS / display corpus after non-bulk paid refine. */
export function shouldPersistPaidProRefineToDisplayAuthority(args: {
  guidedBulkActive: boolean;
  agreementId?: string | null;
}): boolean {
  return !args.guidedBulkActive && Boolean((args.agreementId || "").trim());
}
