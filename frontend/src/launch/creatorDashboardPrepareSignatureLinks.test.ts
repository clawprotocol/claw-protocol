/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft } from "../agreement/agreementTypes";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import * as agreementToVs01SigningBridge from "./simpleProduct/agreementToVs01SigningBridge";
import * as esignRemountReviewBind from "../vs01/vs01EsignRemountReviewBind";
import { navigateCreatorPrepareSignatureLinks } from "./creatorDashboardPrepareSignatureLinks";

const mockNavigate = vi.fn();

function baseDraft(): AgreementDraft {
  return {
    id: "ag_ready",
    title: "Services Agreement",
    jurisdiction: "CA",
    parties: [
      { name: "Blue Canyon Analytics LLC", role: "owner" },
      { name: "Iron Vale Systems Inc", role: "party" },
    ],
    purpose: "Services",
    payment_terms: "Net 30",
    duration: "1y",
    due_date: null,
    effective_date: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T12:00:00.000Z",
    versions: [{ version: 1, created_at: "2026-05-01T00:00:00.000Z" }],
    audit_log: [{ event_type: "recipient_approved", at: "2026-05-01T11:00:00.000Z" }],
    premium_full_document_text: "PRO_REVIEWED_BODY",
  } as AgreementDraft;
}

describe("navigateCreatorPrepareSignatureLinks", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("seeds VS01 signature prep when draft is ready", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft(),
      lockedVersionId: null,
    });
    const vs01Spy = vi.spyOn(agreementToVs01SigningBridge, "tryNavigatePaidProAgreementSenderFirstVs01Esign")
      .mockResolvedValue(true);

    const result = await navigateCreatorPrepareSignatureLinks({
      agreementId: "ag_ready",
      navigate: mockNavigate,
    });

    expect(vs01Spy).toHaveBeenCalledWith(
      expect.objectContaining({
        agreementId: "ag_ready",
        logReason: "creator_dashboard_prepare_signature_links",
        reviewerApprovedCleanHandoff: true,
        recipientSetup: null,
      }),
    );
    expect(result.navigated).toBe(true);
    expect(result.vs01RouteAttempted).toBe(true);
    expect(result.blockReason).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/app/done/"));
  });

  it("falls back to negotiation workspace when VS01 seed fails and legacy fallback enabled", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft(),
      lockedVersionId: null,
    });
    vi.spyOn(agreementToVs01SigningBridge, "tryNavigatePaidProAgreementSenderFirstVs01Esign").mockResolvedValue(
      false,
    );

    const result = await navigateCreatorPrepareSignatureLinks({
      agreementId: "ag_ready",
      navigate: mockNavigate,
      navigateOnBridgeFailure: true,
    });

    expect(result.navigated).toBe(true);
    expect(result.destination).toBe("/app/agreements/ag_ready");
    expect(result.blockReason).toBe("vs01_bridge_failed");
    expect(mockNavigate).toHaveBeenCalledWith("/app/agreements/ag_ready");
  });

  it("does not fall back to /app/done by default when VS01 seed fails", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft(),
      lockedVersionId: null,
    });
    vi.spyOn(agreementToVs01SigningBridge, "tryNavigatePaidProAgreementSenderFirstVs01Esign").mockResolvedValue(
      false,
    );

    const result = await navigateCreatorPrepareSignatureLinks({
      agreementId: "ag_ready",
      navigate: mockNavigate,
    });

    expect(result.navigated).toBe(false);
    expect(result.blockReason).toBe("vs01_bridge_failed");
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/app/done/"));
  });

  it("stays put when VS01 seed fails and dashboard disables fallback", async () => {
    vi.spyOn(agreementToVs01SigningBridge, "tryNavigatePaidProAgreementSenderFirstVs01Esign").mockResolvedValue(
      false,
    );
    vi.spyOn(agreementToVs01SigningBridge, "fetchAgreementVs01SigningSeed").mockResolvedValue({
      ok: false,
      reason: "missing_corpus",
    });

    const result = await navigateCreatorPrepareSignatureLinks({
      agreementId: "ag_ready",
      navigate: mockNavigate,
      draft: baseDraft(),
      lockedVersionId: null,
      navigateOnBridgeFailure: false,
    });

    expect(result.navigated).toBe(false);
    expect(result.blockReason).toBe("vs01_bridge_failed");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("resumes owner prepare from persisted bridge session when corpus bridge fails", async () => {
    vi.spyOn(agreementToVs01SigningBridge, "tryNavigatePaidProAgreementSenderFirstVs01Esign").mockResolvedValue(
      false,
    );
    vi.spyOn(agreementToVs01SigningBridge, "fetchAgreementVs01SigningSeed").mockResolvedValue({
      ok: false,
      reason: "missing_corpus",
    });
    const remountSpy = vi.spyOn(esignRemountReviewBind, "ensureReviewCorpusOnEsignEntry").mockResolvedValue({
      ok: true,
      documentId: "doc_resume",
      replaced: true,
      reason: "replace_stale_server_template_content_from_review_sot",
      fetchedWasTemplate: true,
      contentSha256: "a".repeat(64),
    });
    agreementToVs01SigningBridge.writeAgreementVs01BridgeSession({
      vs01DocumentId: "doc_resume",
      agreementId: "ag_ready",
      agreementTitle: "Services Agreement",
      creatorName: "Owner",
      creatorEmail: "owner@example.test",
      counterparties: [],
      targetStep: 2,
      senderFirstLawdogHandoff: true,
      reviewerApprovedCleanHandoff: true,
    });

    const result = await navigateCreatorPrepareSignatureLinks({
      agreementId: "ag_ready",
      navigate: mockNavigate,
      draft: baseDraft(),
      lockedVersionId: null,
      navigateOnBridgeFailure: false,
    });

    expect(remountSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc_resume",
        agreementId: "ag_ready",
      }),
    );
    expect(result.navigated).toBe(true);
    expect(result.destination).toBe("/app/esign/doc_resume?agreement_bridge=1");
    expect(mockNavigate).toHaveBeenCalledWith("/app/esign/doc_resume?agreement_bridge=1");
    expect(result.blockReason).toBeNull();
  });
});
