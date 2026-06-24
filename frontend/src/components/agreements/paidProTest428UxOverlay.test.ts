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
import { TEST428_UX_SCENARIOS } from "./paidProTest428Fixtures";
import {
  formatTest428Matrix,
  runTest428UxCell,
  TEST428_MATRIX_RESULTS,
  TEST428_UX_SURFACES,
} from "./paidProTest428JourneyMatrix";
import { prepareTest428UxContext, runTest428UxSurface } from "./paidProTest428UxHelpers";
import { clearPaidProVs01PostSignHandoff } from "../../vs01/vs01PaidProPostSignHandoff";
import { cleanup } from "@testing-library/react";

describe("TEST428 — Genesis Dog UX/UI Regression Overlay", () => {
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
    cleanup();
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
    console.info("\nTEST428 UX MATRIX\n" + formatTest428Matrix(TEST428_MATRIX_RESULTS));
  });

  for (const scenario of TEST428_UX_SCENARIOS) {
    for (const surface of TEST428_UX_SURFACES) {
      it(`${scenario.expectedN}p ${surface}: ${scenario.label}`, () => {
        const result = runTest428UxCell(
          scenario.id,
          scenario.label,
          scenario.expectedN,
          surface,
          () => {
            const ctx = prepareTest428UxContext(scenario);
            runTest428UxSurface(ctx, surface);
          },
        );
        expect(result.pass, result.reason ?? "failed").toBe(true);
      });
    }
  }

  it("covers 6 representative TEST427 fixtures", () => {
    expect(TEST428_UX_SCENARIOS.length).toBe(6);
  });
});
