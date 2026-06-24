/** @vitest-environment jsdom */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
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
import {
  clearAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import {
  clearConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import { clearPaidProVs01PostSignHandoff } from "../../vs01/vs01PaidProPostSignHandoff";
import { TEST429_CASES } from "./paidProTest429HistoricalRegressionFixtures";
import {
  formatTest429Matrix,
  runTest429Cell,
  TEST429_MATRIX_RESULTS,
} from "./paidProTest429Helpers";

describe("TEST429 — Real User Regression Corpus", () => {
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
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProVs01PostSignHandoff();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    cleanup();
    clearPaidProSourceOfTruth();
    clearPremiumPartyNamesHandoff();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
    clearCurrentSessionProEntitlementMarkers();
    resetPremiumRecipientHandoffDedupForTests();
    storage.clear();
    local.clear();
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.info(`TEST429: ${TEST429_CASES.length} historical cases; matrix:\n${formatTest429Matrix()}`);
  });

  it("registers exactly 27 sanitized historical regression cases", () => {
    expect(TEST429_CASES.length).toBe(27);
  });

  for (const testCase of TEST429_CASES) {
    it(`${testCase.id} (${testCase.historicalRef}): ${testCase.historicalFailure}`, () => {
      const row = runTest429Cell(testCase);
      expect(row.pass, row.reason ?? "failed").toBe(true);
    });
  }
});

describe("TEST429 matrix guard", () => {
  it("matrix row count matches case count after corpus run", () => {
    expect(TEST429_MATRIX_RESULTS.length).toBeGreaterThanOrEqual(TEST429_CASES.length);
  });
});
