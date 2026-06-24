/**
 * TEST426 — varied N-party structural recovery fixtures (not quad-fallback biased).
 */

import type { Test424JourneyScenario } from "./paidProTest424Fixtures";
import {
  TEST424_COORDINATOR_FOUR,
  TEST424_COORDINATOR_FIVE,
  TEST424_FIVE_PARTY_JV,
  TEST424_FIVE_PARTY_REV,
  TEST424_FOUR_PARTY_CONSULTING,
  TEST424_FOUR_PARTY_VENDOR,
  TEST424_PARTIAL_FIVE,
  TEST424_PARTIAL_THREE,
  TEST424_THREE_PARTY,
  TEST424_TWO_PARTY,
} from "./paidProTest424Fixtures";

export type Test426RecoveryScenario = Test424JourneyScenario & {
  recoveryLabel: string;
};

/** Recovery matrix — 2–5 parties across consulting, vendor, JV, revenue-share, coordinator, partial-metadata. */
export const TEST426_RECOVERY_SCENARIOS: Test426RecoveryScenario[] = [
  { ...TEST424_TWO_PARTY, recoveryLabel: "2p_consulting" },
  { ...TEST424_THREE_PARTY, recoveryLabel: "3p_multi_provider" },
  { ...TEST424_FOUR_PARTY_VENDOR, recoveryLabel: "4p_vendor" },
  { ...TEST424_FOUR_PARTY_CONSULTING, recoveryLabel: "4p_consulting" },
  { ...TEST424_FIVE_PARTY_REV, recoveryLabel: "5p_revenue_share" },
  { ...TEST424_FIVE_PARTY_JV, recoveryLabel: "5p_joint_venture" },
  { ...TEST424_COORDINATOR_FOUR, recoveryLabel: "4p_coordinator_only" },
  { ...TEST424_COORDINATOR_FIVE, recoveryLabel: "5p_coordinator_only" },
  { ...TEST424_PARTIAL_THREE, recoveryLabel: "3p_partial_metadata" },
  { ...TEST424_PARTIAL_FIVE, recoveryLabel: "5p_partial_metadata" },
];
