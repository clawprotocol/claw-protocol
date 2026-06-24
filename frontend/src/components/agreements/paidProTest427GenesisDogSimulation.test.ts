/** @vitest-environment jsdom */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPremiumPartyNamesHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { clearConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { TEST427_SCENARIOS } from "./paidProTest427Fixtures";
import { runTest427ProductionWorkflow } from "./paidProTest427JourneyHelpers";
import {
  formatTest427FailureReport,
  formatTest427Matrix,
  formatTest427SuiteSummary,
  runTest427Scenario,
  TEST427_MATRIX_RESULTS,
} from "./paidProTest427JourneyMatrix";
import { clearPaidProVs01PostSignHandoff } from "../../vs01/vs01PaidProPostSignHandoff";

/**
 * TEST427 — Genesis Dog production simulation (21 workflow scenarios + 1 guard test = 22 tests).
 */
describe("TEST427 — Genesis Dog Production Simulation Suite", () => {
  const storage = new Map<string, string>();
  const local = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
    });
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => local.set(k, v),
      removeItem: (k: string) => local.delete(k),
      clear: () => local.clear(),
    });
    storage.clear();
    local.clear();
    resetPremiumRecipientHandoffDedupForTests();
    clearPaidProSourceOfTruth();
    clearPremiumPartyNamesHandoff();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPostAcceptanceValidatorCache();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPremiumPartyNamesHandoff();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPostAcceptanceValidatorCache();
    clearCurrentSessionProEntitlementMarkers();
    resetPremiumRecipientHandoffDedupForTests();
    clearPaidProVs01PostSignHandoff();
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.info("\n" + formatTest427SuiteSummary());
    // eslint-disable-next-line no-console
    console.info("\nTEST427 MATRIX\n" + formatTest427Matrix(TEST427_MATRIX_RESULTS));
    // eslint-disable-next-line no-console
    console.info("\n" + formatTest427FailureReport(TEST427_MATRIX_RESULTS));
  });

  for (const scenario of TEST427_SCENARIOS) {
    it(`${scenario.expectedN}-party ${scenario.category}: ${scenario.label}`, () => {
      const result = runTest427Scenario(
        scenario.id,
        scenario.label,
        scenario.category,
        scenario.expectedN,
        () => runTest427ProductionWorkflow(scenario),
      );
      expect(result.pass, result.rootCause ?? "failed").toBe(true);
    });
  }

  it("registers exactly 21 production scenarios", () => {
    expect(TEST427_SCENARIOS.length).toBe(21);
  });
});
