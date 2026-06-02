import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PremiumCompletionSnapshot } from "./premiumCompletionStorage";
import {
  needsAuthoritativeVisibleSurfaceRepair,
  shouldSkipAgreementDocLivePreviewSync,
} from "./premiumAuthoritativeVisibleCommit";

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
    purpose: "Development services.",
    payment_terms: "$5000 monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: "Jan 1",
    payment: emptyPayment,
  };
}

function snapAuthoritative(bodyLen: number): PremiumCompletionSnapshot {
  const body = "x".repeat(bodyLen);
  return {
    savedAt: Date.now(),
    premiumAccepted: true,
    premiumDraft: minimalDraft(),
    premiumParties: [],
    recipientCandidates: [],
    premiumWinningBodyText: body,
    premiumReadonlyPlainText: body,
    premiumPipelineRenderSource: "server_full_draft",
    intakeTextFingerprint: "fp",
  };
}

describe("premiumAuthoritativeVisibleCommit", () => {
  it("shouldSkipAgreementDocLivePreviewSync when snapshot has authoritative 16k body even if premiumPersistedFlowActive is false", () => {
    expect(
      shouldSkipAgreementDocLivePreviewSync({
        premiumPersistedFlowActive: false,
        snapshot: snapAuthoritative(16210),
        pipelineRenderSourceRef: "server_full_draft",
        hydratedBodyTrimmed: "",
      }),
    ).toBe(true);
  });

  it("shouldSkipAgreementDocLivePreviewSync when pipeline ref + hydrated body carry authoritative corpus", () => {
    expect(
      shouldSkipAgreementDocLivePreviewSync({
        premiumPersistedFlowActive: false,
        snapshot: null,
        pipelineRenderSourceRef: "server_full_draft",
        hydratedBodyTrimmed: "y".repeat(520),
      }),
    ).toBe(true);
  });

  it("needsAuthoritativeVisibleSurfaceRepair: starter ~800 visible vs 16k winning implies repair", () => {
    expect(
      needsAuthoritativeVisibleSurfaceRepair({
        winningBodyLen: 16210,
        agreementDocumentTextLen: 800,
      }),
    ).toBe(true);
  });

  it("shouldSkipAgreementDocLivePreviewSync for post-checkout degraded local recovery corpus", () => {
    const body = "x".repeat(4_500);
    expect(
      shouldSkipAgreementDocLivePreviewSync({
        premiumPersistedFlowActive: true,
        snapshot: {
          ...snapAuthoritative(4_500),
          premiumAccepted: false,
          premiumPipelineRenderSource: "premium_degraded_server_local_recovery",
          premiumWinningBodyText: body,
          premiumReadonlyPlainText: body,
        },
        pipelineRenderSourceRef: "premium_degraded_server_local_recovery",
        hydratedBodyTrimmed: body,
      }),
    ).toBe(true);
  });

  it("shouldSkipAgreementDocLivePreviewSync during send workflow phases", () => {
    expect(
      shouldSkipAgreementDocLivePreviewSync({
        premiumPersistedFlowActive: false,
        snapshot: null,
        pipelineRenderSourceRef: null,
        hydratedBodyTrimmed: "",
        createFlowPhase: "recipient_setup_required",
      }),
    ).toBe(true);
  });

  it("needsAuthoritativeVisibleSurfaceRepair: modal soft timeout repair scenario — visible caught up with winning", () => {
    expect(
      needsAuthoritativeVisibleSurfaceRepair({
        winningBodyLen: 16210,
        agreementDocumentTextLen: 16200,
      }),
    ).toBe(false);
  });
});
