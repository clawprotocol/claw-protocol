import { describe, expect, it, beforeEach } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PremiumCompletionSnapshot } from "./premiumCompletionStorage";
import {
  endPremiumEnsureForIntake,
  resetPremiumEnsureMutexForTests,
  shouldSkipPremiumEnsureBecauseSnapshotAlreadyAuthoritative,
  tryBeginPremiumEnsureForIntake,
} from "./premiumAuthoritativeVisibleSurface";
import { computeProTruthSurface } from "./premiumProTruth";
import { resolveAgreementIntentContract } from "./agreementIntentContract";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

function minimalDraft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "DE",
    agreement_family: "services_agreement",
    parties: [
      { name: "A LLC", role: "party" },
      { name: "B LLC", role: "party" },
    ],
    purpose: "Development services with milestones.",
    payment_terms: "$5000 monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: "Jan 1",
    payment: emptyPayment,
  };
}

describe("premiumAuthoritativeVisibleSurface", () => {
  beforeEach(() => {
    resetPremiumEnsureMutexForTests();
  });

  it("shouldSkipPremiumEnsureBecauseSnapshotAlreadyAuthoritative is true when fingerprint matches and body is long", () => {
    const fp = "same_fp";
    const snap: PremiumCompletionSnapshot = {
      savedAt: Date.now(),
      premiumDraft: minimalDraft(),
      premiumParties: [],
      recipientCandidates: [],
      premiumAccepted: true,
      premiumWinningBodyText: "x".repeat(600),
      premiumReadonlyPlainText: "x".repeat(600),
      intakeTextFingerprint: fp,
      premiumPipelineRenderSource: "server_full_draft",
    };
    expect(
      shouldSkipPremiumEnsureBecauseSnapshotAlreadyAuthoritative({
        intakeFingerprint: fp,
        snapshot: snap,
      }),
    ).toBe(true);
  });

  it("tryBeginPremiumEnsureForIntake blocks parallel duplicate fingerprint until released", () => {
    expect(tryBeginPremiumEnsureForIntake("fp-a")).toBe(true);
    expect(tryBeginPremiumEnsureForIntake("fp-a")).toBe(false);
    endPremiumEnsureForIntake("fp-a");
    expect(tryBeginPremiumEnsureForIntake("fp-a")).toBe(true);
    endPremiumEnsureForIntake("fp-a");
  });

  /**
   * Regression: modal failopen must not permanently force recovery UI once authoritative success applies.
   * After reconciliation, Pro truth should allow premium_success when recovery flags are false.
   */
  it("computeProTruthSurface yields premium_success for authoritative readonly source after recovery cleared", () => {
    const intake =
      "SaaS website API work for Client A and Developer B in Oklahoma, $5000, May 2026.";
    const contract = resolveAgreementIntentContract(intake);
    const body =
      "WHEREAS parties agree.\n\n1. Services for SaaS website in Oklahoma.\n2. Fees $5000.\n3. IP.\n4. Term.\n5. Law Oklahoma.\n\n" +
      "x".repeat(4500);
    const s = computeProTruthSurface({
      intentContract: contract,
      documentText: body,
      renderSource: "server_full_document_text",
      premiumPipelineSource: "server_full_draft",
      intakeText: intake,
      draft: minimalDraft(),
      qualityRetryActive: false,
      serverGenerationDegraded: false,
      allowPaidSubstantiveStitch: true,
      stale: false,
    });
    expect(s.gate.state).toBe("premium_success");
    expect(s.validation.ok).toBe(true);
  });
});
