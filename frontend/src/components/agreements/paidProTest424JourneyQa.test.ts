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
import {
  JOURNEY_A_SCENARIOS,
  JOURNEY_B_SCENARIOS,
  JOURNEY_C_SCENARIOS,
  JOURNEY_D_SCENARIOS,
  JOURNEY_E_SCENARIOS,
} from "./paidProTest424Fixtures";
import {
  runJourneyAHappyPathLifecycle,
  runJourneyBReviewRevisionFlow,
  runJourneyCCoordinatorOnly,
  runJourneyDMetadataCompletion,
  runJourneyERecovery,
} from "./paidProTest424JourneyHelpers";
import {
  formatTest424JourneyMatrix,
  runTest424JourneyCell,
  TEST424_JOURNEY_RESULTS,
} from "./paidProTest424JourneyMatrix";
import { clearPaidProVs01PostSignHandoff } from "../../vs01/vs01PaidProPostSignHandoff";

describe("TEST424 — Production Journey QA Suite", () => {
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
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPremiumPartyNamesHandoff();
    clearConsumedPaidProSignerMetadataAuthority();
    clearCurrentSessionProEntitlementMarkers();
    resetPremiumRecipientHandoffDedupForTests();
    clearPaidProVs01PostSignHandoff();
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.info("\nTEST424 JOURNEY MATRIX\n" + formatTest424JourneyMatrix(TEST424_JOURNEY_RESULTS));
  });

  describe("Journey A — Happy Path Lifecycle", () => {
    for (const scenario of JOURNEY_A_SCENARIOS) {
      it(`${scenario.expectedN}-party ${scenario.fixtureLabel}`, () => {
        const result = runTest424JourneyCell(
          "A",
          scenario.expectedN,
          scenario.fixtureLabel,
          () => runJourneyAHappyPathLifecycle(scenario),
        );
        expect(result.pass, result.rootCause ?? "failed").toBe(true);
      });
    }
  });

  describe("Journey B — Review Revision Flow", () => {
    for (const scenario of JOURNEY_B_SCENARIOS) {
      it(`${scenario.expectedN}-party ${scenario.fixtureLabel}`, () => {
        const result = runTest424JourneyCell(
          "B",
          scenario.expectedN,
          scenario.fixtureLabel,
          () => runJourneyBReviewRevisionFlow(scenario),
        );
        expect(result.pass, result.rootCause ?? "failed").toBe(true);
      });
    }
  });

  describe("Journey C — Coordinator Only", () => {
    for (const scenario of JOURNEY_C_SCENARIOS) {
      it(`${scenario.expectedN}-party ${scenario.fixtureLabel}`, () => {
        const result = runTest424JourneyCell(
          "C",
          scenario.expectedN,
          scenario.fixtureLabel,
          () => runJourneyCCoordinatorOnly(scenario),
        );
        expect(result.pass, result.rootCause ?? "failed").toBe(true);
      });
    }
  });

  describe("Journey D — Metadata Completion", () => {
    for (const scenario of JOURNEY_D_SCENARIOS) {
      it(`${scenario.expectedN}-party ${scenario.fixtureLabel}`, () => {
        const result = runTest424JourneyCell(
          "D",
          scenario.expectedN,
          scenario.fixtureLabel,
          () => runJourneyDMetadataCompletion(scenario),
        );
        expect(result.pass, result.rootCause ?? "failed").toBe(true);
      });
    }
  });

  describe("Journey E — Recovery", () => {
    for (const scenario of JOURNEY_E_SCENARIOS) {
      it(`${scenario.expectedN}-party ${scenario.fixtureLabel}`, () => {
        const result = runTest424JourneyCell(
          "E",
          scenario.expectedN,
          scenario.fixtureLabel,
          () => runJourneyERecovery(scenario),
        );
        expect(result.pass, result.rootCause ?? "failed").toBe(true);
      });
    }
  });
});
