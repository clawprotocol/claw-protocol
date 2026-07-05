/**
 * Reset module-level Paid Pro pipeline caches and session markers between Vitest cases.
 * Call in beforeEach (and optionally afterEach) so parallel test files do not share corpus scan
 * or safe-display memo results keyed by corpus fingerprint.
 */

import { clearPaidProCorpusScanCache } from "./paidProCorpusScanCache";
import { clearPaidProCheckoutPreviewPreflightCache } from "./paidProCheckoutPreviewPreflightCache";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import {
  clearLastFinishedPaidProPerformanceTrace,
  clearPaidProPerformanceTrace,
} from "./paidProPerformanceTrace";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearCurrentSessionProEntitlementMarkers } from "./paidProSessionEligibility";
import { clearPremiumPartyNamesHandoff, resetPremiumRecipientHandoffDedupForTests } from "./premiumPartyNamesHandoff";
import { clearConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { clearProGenerationAdoptionForTests } from "./paidProGenerationAdoption";
import { clearPaidProAuthorityHashContinuityForTests } from "./paidProAuthorityHashContinuity";
import { clearAcceptedProCorpusSafeDisplayCacheForTests } from "./paidProAcceptedCorpusSafeDisplayCache";
import { clearPaidProPipelineAcceptedCorpusHashForTests } from "./paidProPipelineAcceptedCorpus";
import { resetPaidReviewSessionCorpusInvariantForTests } from "./paidProReviewSessionCorpusInvariantState";

/** Clear cross-test Paid Pro pipeline caches and in-memory authority without touching sessionStorage. */
export function resetPaidProPipelineTestIsolation(): void {
  clearPaidProSourceOfTruth();
  clearProGenerationAdoptionForTests();
  clearPaidProAuthorityHashContinuityForTests();
  clearAcceptedProCorpusSafeDisplayCacheForTests();
  clearPaidProPipelineAcceptedCorpusHashForTests();
  clearPaidProCorpusScanCache();
  clearPaidProPostAcceptanceValidatorCache();
  clearPremiumParseSessionGuard();
  clearFrozenPremiumSessionBodiesForTests();
  clearPremiumGenerationCallAudit();
  clearPaidProCheckoutPreviewPreflightCache();
  clearPaidProPerformanceTrace();
  clearLastFinishedPaidProPerformanceTrace();
  clearPremiumPartyNamesHandoff();
  clearConsumedPaidProSignerMetadataAuthority();
  clearCurrentSessionProEntitlementMarkers();
  resetPremiumRecipientHandoffDedupForTests();
  resetPaidReviewSessionCorpusInvariantForTests();
}
