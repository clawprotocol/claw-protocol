/**
 * Substantive Paid Pro corpus fixtures for starter session isolation tests.
 * Delegates to paidProSharedFixtureSystem (SUBSTANTIVE_SERVER_DRAFT_MIN_LEN = 10k).
 */

import type { ParsedDraftShape } from "../components/agreements/intakeSmartDefaults";
import {
  buildTwoPartyProfessionalServicesCorpus,
  buildTwoPartyProfessionalServicesDraft,
  SHARED_HARBOR_PEAK,
  SHARED_RED_MESA,
  SHARED_TWO_PARTY_INTAKE,
} from "../components/agreements/paidProSharedFixtureSystem";

export const STARTER_ISOLATION_RED_MESA = SHARED_RED_MESA;
export const STARTER_ISOLATION_HARBOR_PEAK = SHARED_HARBOR_PEAK;
export const STARTER_ISOLATION_TWO_PARTY_INTAKE = SHARED_TWO_PARTY_INTAKE;

export function buildStarterIsolationSubstantiveProCorpus(minLen?: number): string {
  return buildTwoPartyProfessionalServicesCorpus(minLen);
}

export function buildStarterIsolationProDraft(): ParsedDraftShape {
  return buildTwoPartyProfessionalServicesDraft();
}
