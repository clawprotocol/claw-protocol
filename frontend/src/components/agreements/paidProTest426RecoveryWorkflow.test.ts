/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import {
  clearConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { clearPaidProSourceOfTruth, getPaidProSourceOfTruthText } from "./paidProSourceOfTruth";
import {
  clearPremiumPartyNamesHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";
import { runJourneyERecovery } from "./paidProTest424JourneyHelpers";
import {
  countPartyBlocksInExecutionTail,
  executionTail,
} from "./paidProTest423Helpers";
import { TEST426_RECOVERY_SCENARIOS } from "./paidProTest426Fixtures";
import { clearPaidProVs01PostSignHandoff } from "../../vs01/vs01PaidProPostSignHandoff";

describe("TEST426 — Recovery Workflow Reliability", () => {
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

  for (const scenario of TEST426_RECOVERY_SCENARIOS) {
    it(`${scenario.expectedN}-party ${scenario.fixtureLabel} (${scenario.recoveryLabel})`, () => {
      runJourneyERecovery(scenario);

      const sot = getPaidProSourceOfTruthText();
      expect(sot.length).toBeGreaterThan(2000);

      if (scenario.requireNoticeStanzas !== false) {
        expect(countOperativeIfToNoticeStanzas(sot)).toBeGreaterThanOrEqual(scenario.expectedN);
      }

      expect(countPaidProExecutionBlocks(sot)).toBe(1);
      expect(countPartyBlocksInExecutionTail(sot, scenario.parties)).toBe(scenario.expectedN);

      const tail = executionTail(sot);
      for (const party of scenario.parties) {
        expect(tail.toLowerCase()).toContain(party.toLowerCase().replace(/\.$/, ""));
      }
    });
  }
});
