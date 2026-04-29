import type { AccessTier } from "../../access/types";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { isPaidProAgreementAuthoritative, draftPremiumRenderSourceIndicatesPro } from "./paidProAgreementAuthority";
import type { PremiumCompletionSnapshot } from "./premiumCompletionStorage";

export { draftPremiumRenderSourceIndicatesPro };

/**
 * User should not be sent to Stripe / checkout for the same create-flow agreement when Pro is already
 * established (paid tier, session Pro flags, persisted premium snapshot, or authoritative full body on draft).
 */
export function isProEntitledForAgreement(args: {
  tier: AccessTier;
  draft: ParsedDraftShape | null | undefined;
  premiumSendPathUnlocked: boolean;
  premiumPersistedFlowActive: boolean;
  premiumCompletionSnapshot: PremiumCompletionSnapshot | null | undefined;
}): boolean {
  return isPaidProAgreementAuthoritative({
    tier: args.tier,
    draft: args.draft,
    premiumSendPathUnlocked: args.premiumSendPathUnlocked,
    premiumPersistedFlowActive: args.premiumPersistedFlowActive,
    premiumCompletionSnapshot: args.premiumCompletionSnapshot,
  });
}
