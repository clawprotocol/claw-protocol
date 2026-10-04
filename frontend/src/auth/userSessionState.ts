import { clearCachedSubscriptionEntitlement } from "../access/subscriptionEntitlementCache";
import {
  clearPersistedWorkspaceUsageTierCache,
  invalidateWorkspaceProEntitlementCache,
} from "../agreement/agreementProFunnelGate";
import { clearPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";
import { clearCurrentSessionProEntitlementMarkers } from "../components/agreements/paidProSessionEligibility";
import { clearAllGuestCheckoutAuthorities } from "../launch/guestCheckoutAuthority";
import { setOrgId } from "../launch/orgContext";
import { clearPaidCheckoutOrgId } from "../launch/paidCheckoutOrgContext";
import { clearCachedAccessToken } from "./authAccessTokenCache";
import { clearCompletedAuthFinalize } from "./returningFinalizeLatch";
import { clearImmutableFrozenLegalCorpus } from "../components/agreements/paidProFrozenLegalCorpus";
import { clearPaymentClarificationClientCache } from "../components/agreements/paymentClarificationSession";

/** Remove account and paid-access authority that must never cross a sign-out boundary. */
export function clearLawdogUserSessionState(): void {
  clearCachedAccessToken();
  clearCompletedAuthFinalize();
  clearCachedSubscriptionEntitlement();
  clearPaidCheckoutOrgId();
  clearPaidPremiumCompletionSession();
  clearCurrentSessionProEntitlementMarkers();
  clearAllGuestCheckoutAuthorities();
  invalidateWorkspaceProEntitlementCache();
  clearPersistedWorkspaceUsageTierCache();
  clearImmutableFrozenLegalCorpus();
  clearPaymentClarificationClientCache();
  setOrgId("");
}
