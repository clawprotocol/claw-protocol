/**
 * Forced first-review (decision_1) Ask LawDog gates.
 *
 * Ask LawDog to revise must mount on PaidProForcedFirstReviewChrome without
 * requiring signer finalize. Successful Apply persists through the same
 * commercial review snapshot path as Save edits — no second Review SoT.
 *
 * Workspace POST /refine only revises structured draft fields + audit_log
 * (chat_revise). Paid Pro Review paint reads CRS / SoT / session authority,
 * so Ask LawDog Apply on a paid surface must use premium-refine + CRS commit.
 */

import { clearAcceptedProCorpusSafeDisplayCache } from "./paidProAcceptedCorpusSafeDisplayCache";
import { clearPaidProVisibleRenderMemo } from "./paidProVisibleRenderMemo";

export const PAID_PRO_ASK_LAWDOG_REFINE_REVISION_REASON = "pro_ask_lawdog_refine_revision";

export function shouldMountPaidProForcedFirstReviewAskLawDog(args: {
  onApplySuggestEdits?: (() => void) | null;
  onSuggestEditsDraftChange?: ((value: string) => void) | null;
}): boolean {
  return Boolean(args.onApplySuggestEdits && args.onSuggestEditsDraftChange);
}

/**
 * Paid first-review / forced shell must not fall through to workspace /refine
 * just because premiumPersistedFlowActive is still false on resume.
 */
export function shouldUsePaidProPremiumRefinePath(args: {
  premiumPersistedFlowActive: boolean;
  paidDocumentSurface: boolean;
}): boolean {
  return args.premiumPersistedFlowActive || args.paidDocumentSurface;
}

/** Persist refined body to CRS / display corpus after non-bulk paid refine. */
export function shouldPersistPaidProRefineToDisplayAuthority(args: {
  guidedBulkActive: boolean;
  agreementId?: string | null;
}): boolean {
  return !args.guidedBulkActive && Boolean((args.agreementId || "").trim());
}

/**
 * After a successful refine / user-approved revision, drop memoized safe-display
 * and review HTML so a prior CRS cannot keep painting. New corpus hashes miss
 * the memo; this also covers same-key leftover entries from the pre-refine body.
 */
export function invalidatePaidProDisplayCachesAfterSuccessfulRefine(): void {
  clearAcceptedProCorpusSafeDisplayCache();
  clearPaidProVisibleRenderMemo();
}
