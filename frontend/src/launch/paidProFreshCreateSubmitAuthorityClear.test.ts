/** @vitest-environment jsdom */
/**
 * Same-session Create draft must clear prior paid Pro SoT so a new intake cannot paint
 * a previous agreement (PixelForge relic after unrelated counsel-prep / SaaS prompt).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "../components/agreements/paidProSourceOfTruth";
import {
  clearPremiumCompletionSnapshot,
  markPaidPremiumCompletionSession,
  persistPremiumCompletionSnapshot,
  readPremiumCompletionSnapshot,
} from "../components/agreements/premiumCompletionStorage";
import { getOrInitSessionAgreementGenerationId, getSessionAgreementGenerationId } from "../lib/agreementGenerationId";
import { clearPriorPaidAuthorityForFreshCreateSubmit } from "./newAgreementSessionReset";
import { buildStarterIsolationSubstantiveProCorpus } from "./starterIsolationFixtures";

describe("clearPriorPaidAuthorityForFreshCreateSubmit", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "info").mockImplementation(() => {});
    clearPaidProSourceOfTruth();
    clearPremiumCompletionSnapshot();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearPaidProSourceOfTruth();
    clearPremiumCompletionSnapshot();
    sessionStorage.clear();
  });

  it("clears SoT + premium snapshot and bumps generation id", () => {
    const corpus = buildStarterIsolationSubstantiveProCorpus();
    const gen = getOrInitSessionAgreementGenerationId();
    establishPaidProSourceOfTruth({
      text: corpus,
      source: "server_full_draft",
      agreementGenerationId: gen,
      reviewSessionId: gen,
    });
    markPaidPremiumCompletionSession();
    persistPremiumCompletionSnapshot({
      premiumDraft: {
        title: "Services Agreement",
        parties: [],
        purpose: "",
        payment_terms: "",
        jurisdiction: "",
        duration: null,
        due_date: null,
        effective_date: null,
        payment: { amount: null, cadence: null, valid: false },
      },
      premiumParties: [],
      recipientCandidates: [],
      paidProSourceOfTruthText: corpus,
      paidProSourceOfTruthHash: "deadbeef",
      premiumAccepted: true,
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(readPremiumCompletionSnapshot()?.paidProSourceOfTruthText).toBeTruthy();
    const beforeGen = getSessionAgreementGenerationId();

    clearPriorPaidAuthorityForFreshCreateSubmit();

    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(readPremiumCompletionSnapshot()).toBeNull();
    const afterGen = getSessionAgreementGenerationId();
    expect(afterGen).toBeTruthy();
    if (beforeGen) expect(afterGen).not.toBe(beforeGen);
  });
});
