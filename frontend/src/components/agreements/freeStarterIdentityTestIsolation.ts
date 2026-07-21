/**
 * Reset cross-test state for Free Starter identity / party-role suites.
 * Narrow scope: Paid Pro pipeline caches, intake session keys, and browser storage only.
 */

import { clearOriginalUserIntakeRaw } from "./originalUserIntakeRawStorage";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

export function resetFreeStarterIdentityTestIsolation(): void {
  resetPaidProPipelineTestIsolation();
  clearOriginalUserIntakeRaw();
  try {
    sessionStorage.clear();
  } catch {
    /* ignore — node default env */
  }
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
}
