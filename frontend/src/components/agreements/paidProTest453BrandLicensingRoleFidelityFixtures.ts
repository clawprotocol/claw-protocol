/**
 * TEST453 — brand licensing role fidelity + network recovery copy quality.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  TEST448_ALL_PARTIES,
  TEST448_LIVE_INTAKE,
  TEST448_TRANSACTION_TITLE,
  test448BrightPeakFirstDraft,
} from "./paidProTest448BrandLicensingOrchestrationFixtures";
import {
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
} from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";

export const TEST453_TRANSACTION_TITLE = TEST448_TRANSACTION_TITLE;
export const TEST453_LIVE_INTAKE = TEST448_LIVE_INTAKE;
export const TEST453_ALL_PARTIES = TEST448_ALL_PARTIES;

export function test453BrightPeakFirstDraft(): ParsedDraftShape {
  return test448BrightPeakFirstDraft();
}

/** Live extraction order with generic roles — mirrors network recovery defect. */
export function test453GenericPartyRolesDraft(): ParsedDraftShape {
  const base = test453BrightPeakFirstDraft();
  return {
    ...base,
    duration: "As stated in the agreement.",
    parties: [
      { name: TEST440_BRIGHT_PEAK, role: "party" } as never,
      { name: TEST440_EVERGREEN, role: "party" } as never,
      { name: TEST440_ATLAS, role: "party" } as never,
      { name: TEST440_HORIZON, role: "party" } as never,
    ],
  };
}
