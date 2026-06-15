/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import * as agreementPublicVerify from "../agreement/agreementPublicVerify";
import {
  ensureSigningPacketStatusFromHandoff,
  patchSignerPacketStatus,
} from "../vs01/vs01SigningPacketStatusStore";
import type { PaidProVs01PostSignHandoffV1 } from "../vs01/vs01PaidProPostSignHandoff";
import {
  deriveCreatorSigningStatusLabel,
  deriveCreatorDashboardStatusPillFromGate,
} from "./creatorDashboardPresentation";
import { resolveCreatorDashboardReviewGate } from "./creatorDashboardReviewGate";
import {
  CREATOR_CONTINUE_SIGNING_LABEL,
  resolveCreatorDashboardSignatureTrackAction,
} from "./creatorDashboardSignatureTrack";
import {
  deriveWhatsNextHeadline,
  deriveWhatsNextProgressLine,
} from "./dashboardWhatsNextPresentation";
import { deriveLawdogProductStatus } from "./lawdogDashboardPresentation";
import {
  fetchServerSigningProgressSnapshot,
  resolveCreatorSigningProgressSnapshot,
} from "./creatorDashboardSigningProgress";
import { isAgreementCompletedForDashboard } from "./creatorDashboardAgreementCompletion";

const AG = "ag_qa363_progress";

function indexRow(overrides: Partial<WorkspaceIndexAgreement> = {}): WorkspaceIndexAgreement {
  return {
    id: AG,
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

function twoPartyHandoff(): PaidProVs01PostSignHandoffV1 {
  return {
    v: 1,
    agreementId: AG,
    agreementTitle: "Services Agreement",
    vs01DocumentId: "doc_qa363",
    receiptId: "",
    receiptHashSha256: null,
    savedAt: new Date().toISOString(),
    ownerSignerRoleId: "vs01r:ag_qa363_scope:i0:owner",
    ownerSigningUrl: "https://example.test/owner",
    signers: [
      {
        counterpartyId: "cp_harbor",
        displayName: "Harbor Peak",
        email: "cp@example.test",
        signingUrl: "https://example.test/cp",
        signerRoleId: "vs01r:ag_qa363_scope:i1:cp_harbor",
      },
    ],
    packetPrepareOnly: true,
    senderMustSignFirst: false,
  };
}

describe("creatorDashboardSigningProgress (QA363)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows partial signing after one party signs locally", () => {
    const handoff = twoPartyHandoff();
    ensureSigningPacketStatusFromHandoff(handoff, handoff.ownerSignerRoleId!);
    patchSignerPacketStatus(AG, handoff.signers[0]!.signerRoleId!, "signed");

    const row = indexRow();
    const gate = resolveCreatorDashboardReviewGate(row, []);
    const progress = resolveCreatorSigningProgressSnapshot(row, null);

    expect(progress?.partiallySigned).toBe(true);
    expect(progress?.signedCount).toBe(1);
    expect(progress?.requiredCount).toBe(2);
    expect(deriveCreatorSigningStatusLabel(row)).toBe("1 of 2 signed");
    expect(deriveCreatorDashboardStatusPillFromGate(row, gate)).toBe("Partially Signed");
    expect(deriveWhatsNextHeadline(row, gate)).toBe("Partially signed");
    expect(deriveWhatsNextProgressLine(row, gate)).toBe("Waiting for remaining signatures");
    expect(deriveLawdogProductStatus(row, progress)).toBe("partially_signed");

    const action = resolveCreatorDashboardSignatureTrackAction(row, gate, { signingProgress: progress });
    expect(action.label).not.toBe(CREATOR_CONTINUE_SIGNING_LABEL);
    expect(action.label).toBe("View signing status");
  });

  it("hydrates partial progress from public verify when server reports one signature", async () => {
    vi.spyOn(agreementPublicVerify, "fetchPublicAgreementVerify").mockResolvedValue({
      agreement_id: AG,
      summary: { title: "Services Agreement" },
      participants: [],
      version_history: [],
      signature_status: {
        fully_executed: false,
        signatures_recorded: 1,
        signer_party_count: 2,
      },
      signature_events: [],
      verification: { agreement_hash: "abc" },
    });

    const snap = await fetchServerSigningProgressSnapshot(AG);
    expect(snap?.partiallySigned).toBe(true);
    expect(snap?.signedCount).toBe(1);

    const row = indexRow();
    expect(deriveCreatorSigningStatusLabel(row, snap)).toBe("1 of 2 signed");
  });

  it("preserves QA362 fully signed completion", () => {
    const handoff = twoPartyHandoff();
    ensureSigningPacketStatusFromHandoff(handoff, handoff.ownerSignerRoleId!);
    patchSignerPacketStatus(AG, handoff.signers[0]!.signerRoleId!, "signed");
    patchSignerPacketStatus(AG, handoff.ownerSignerRoleId!, "signed");

    const row = indexRow({ completed_signed: true });
    const gate = resolveCreatorDashboardReviewGate(row, []);
    expect(isAgreementCompletedForDashboard(row)).toBe(true);
    expect(deriveCreatorSigningStatusLabel(row)).toBe("Fully signed");
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate);
    expect(action.label).not.toBe(CREATOR_CONTINUE_SIGNING_LABEL);
  });
});
