/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import {
  deriveCreatorDashboardStatus,
  deriveCreatorSigningStatusLabel,
  creatorDashboardPrimaryAction,
} from "./creatorDashboardPresentation";
import {
  isAgreementCompletedForDashboard,
  mergeWorkspaceAgreementCompletion,
  resolveCompletedAgreementRoute,
} from "./creatorDashboardAgreementCompletion";
import { resolveCreatorDashboardSignatureTrackAction } from "./creatorDashboardSignatureTrack";
import { resolveCreatorDashboardReviewGate } from "./creatorDashboardReviewGate";
import {
  ensureSigningPacketStatusFromHandoff,
  patchSignerPacketStatus,
} from "../vs01/vs01SigningPacketStatusStore";
import type { PaidProVs01PostSignHandoffV1 } from "../vs01/vs01PaidProPostSignHandoff";
import { CREATOR_CONTINUE_SIGNING_LABEL } from "./creatorDashboardSignatureTrack";
import { CREATOR_NEXT_ACTION_OPEN_AGREEMENT_WORKSPACE } from "./creatorDashboardCopy";

function row(overrides: Partial<WorkspaceIndexAgreement> = {}): WorkspaceIndexAgreement {
  return {
    id: "ag_qa362",
    title: "Services Agreement",
    updated_at: "2026-06-14T00:00:00.000Z",
    party_count: 2,
    signer_count: 2,
    version_ledger_count: 1,
    completed_signed: false,
    has_server_signing_lock: true,
    locked_version_id: "v1",
    workspace_archived_at: null,
    review_sent_at: "2026-06-13T00:00:00.000Z",
    reviewer_approved: true,
    all_reviewers_approved: true,
    review_approvals_required: 2,
    review_approvals_completed: 2,
    ...overrides,
  };
}

describe("creatorDashboardAgreementCompletion", () => {
  it("merges audit-signed completion onto stale workspace index rows", () => {
    const merged = mergeWorkspaceAgreementCompletion(row(), true);
    expect(merged.completed_signed).toBe(true);
    expect(deriveCreatorDashboardStatus(merged)).toBe("completed");
    expect(deriveCreatorSigningStatusLabel(merged)).toBe("Fully signed");
  });

  it("routes completed agreements away from Continue signing CTA", () => {
    const merged = mergeWorkspaceAgreementCompletion(row(), true);
    const gate = resolveCreatorDashboardReviewGate(merged, []);
    const action = resolveCreatorDashboardSignatureTrackAction(merged, gate);
    expect(action.label).toBe(CREATOR_NEXT_ACTION_OPEN_AGREEMENT_WORKSPACE);
    expect(action.label).not.toBe(CREATOR_CONTINUE_SIGNING_LABEL);
    expect(action.path).toBe("/app/done/ag_qa362");
  });

  it("opens completed view from All Agreements table", () => {
    const merged = mergeWorkspaceAgreementCompletion(row(), true);
    const open = creatorDashboardPrimaryAction(merged);
    expect(open.path).toBe("/app/done/ag_qa362");
    expect(open.label).toBe(CREATOR_NEXT_ACTION_OPEN_AGREEMENT_WORKSPACE);
  });

  it("detects local VS01 fully signed packet as completed", () => {
    const agreementId = "ag_local_done";
    localStorage.clear();
    const handoff: PaidProVs01PostSignHandoffV1 = {
      v: 1,
      agreementId,
      agreementTitle: "Services Agreement",
      vs01DocumentId: "doc_done",
      receiptId: "",
      receiptHashSha256: null,
      savedAt: new Date().toISOString(),
      signers: [
        {
          counterpartyId: "cp1",
          displayName: "Counterparty",
          email: "cp@example.test",
          signingUrl: "https://example.test/cp",
          signerRoleId: "role_cp1",
        },
      ],
      ownerSignerRoleId: "role_owner",
      ownerSigningUrl: "https://example.test/sign",
      packetPrepareOnly: true,
      senderMustSignFirst: true,
    };
    const snap = ensureSigningPacketStatusFromHandoff(handoff, "role_owner");
    for (const key of Object.keys(snap.bySignerKey)) {
      patchSignerPacketStatus(agreementId, key, "signed");
    }
    expect(isAgreementCompletedForDashboard(row({ id: agreementId }))).toBe(true);
  });

  it("resolveCompletedAgreementRoute uses draft audit signed event", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementAuditSignedFlag").mockResolvedValue(true);
    await expect(resolveCompletedAgreementRoute("ag_audit")).resolves.toBe("/app/done/ag_audit");
  });
});
