/**
 * TEST428 — UX overlay scenario picks (reuse TEST427 fresh fixtures).
 */

import { TEST427_SCENARIOS, type Test427Scenario } from "./paidProTest427Fixtures";

export const TEST428_SCENARIO_IDS = [
  "a_consulting_2p_tech_logistics",
  "b_vendor_3p_prime_sub",
  "b_vendor_4p_implementation_support",
  "d_jv_5p_saas_partnership",
  "e_coordinator_4p",
  "f_metadata_2p_missing_email",
] as const;

export const TEST428_UX_SCENARIOS: Test427Scenario[] = TEST428_SCENARIO_IDS.map(
  (id) => TEST427_SCENARIOS.find((s) => s.id === id)!,
);
