/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPremiumPartyNamesHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import {
  buildTest432ServerFullDraftWithIncompleteNotices,
  TEST432_HARBOR_PEAK,
  TEST432_INTAKE,
  TEST432_RED_MESA,
  test432Draft,
} from "./paidProTest432Fixtures";
import { buildPaidProStructuralRecoveryBody } from "./paidProStructuralRecovery";

const USER_INTAKE = [
  "Create a consulting services agreement with the following terms:",
  "",
  "Client: Red Mesa Logistics LLC",
  "Service Provider: Harbor Peak Automation LLC",
  "",
  "Workflow automation consulting, systems integration support, reporting dashboards, and operational process optimization services.",
  "",
  "Term: 12 months",
  "Fee: $5,000 per month",
  "Payment due within 15 days of invoice.",
  "Governing law: Oklahoma.",
].join("\n");

describe("TEST434 — post-checkout Red Mesa / Harbor Peak Pro commit", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPremiumPartyNamesHandoff();
    clearCurrentSessionProEntitlementMarkers();
    resetPremiumRecipientHandoffDedupForTests();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("incomplete-notices server draft passes freeze + SoT after prepare", () => {
    const serverDraft = buildTest432ServerFullDraftWithIncompleteNotices();
    const prepared = preparePaidProServerDocumentForAcceptance(
      serverDraft,
      test432Draft(),
      TEST432_INTAKE,
      { surface: "test434_prepare" },
    );

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test432Draft(),
      intakeText: TEST432_INTAKE,
      surface: "test434_freeze",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);

    establishPaidProSourceOfTruth({
      text: freezeCommit.text,
      source: "server_full_draft",
      draft: test432Draft(),
      intakeText: TEST432_INTAKE,
    });

    expect(hasPaidProSourceOfTruth()).toBe(true);
    const sot = getPaidProSourceOfTruthText();
    expect(sot).toContain(TEST432_RED_MESA);
    expect(sot).toContain(TEST432_HARBOR_PEAK);
    expect(sot.length).toBeGreaterThan(5000);
  });

  it("user homepage intake structural recovery establishes SoT", () => {
    const built = buildPaidProStructuralRecoveryBody({
      intakeText: USER_INTAKE,
      draft: test432Draft(),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: built.body,
      source: "server_full_draft",
      draft: test432Draft(),
      intakeText: USER_INTAKE,
      surface: "test434_degraded_recovery_sot",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);

    establishPaidProSourceOfTruth({
      text: freezeCommit.text,
      source: "server_full_draft",
      draft: test432Draft(),
      intakeText: USER_INTAKE,
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);
  });
});
