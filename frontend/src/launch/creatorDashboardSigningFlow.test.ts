/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  ensureSigningPacketStatusFromHandoff,
  patchSignerPacketStatus,
} from "../vs01/vs01SigningPacketStatusStore";
import type { PaidProVs01PostSignHandoffV1 } from "../vs01/vs01PaidProPostSignHandoff";
import { resolveCreatorDashboardReviewGate } from "./creatorDashboardReviewGate";
import {
  deriveCreatorDashboardStatusPillFromGate,
  deriveCreatorNextActionLabel,
  deriveCreatorSigningStatusLabel,
} from "./creatorDashboardPresentation";
import {
  deriveDashboardWhatsNextPresentation,
  deriveWhatsNextHeadline,
  deriveWhatsNextProgressLine,
} from "./dashboardWhatsNextPresentation";
import {
  formatLawdogAgreementStatusLabel,
  countLawdogDashboardKpis,
} from "./lawdogDashboardPresentation";
import { CREATOR_VIEW_SIGNING_STATUS_LABEL,
  CREATOR_VIEW_SIGNED_AGREEMENT_LABEL,
  CREATOR_WAITING_FOR_SIGNATURES_PILL,
} from "./creatorDashboardCopy";
import { resolveCreatorDashboardSignatureTrackAction } from "./creatorDashboardSignatureTrack";
import { creatorDashboardSigningStatusPath } from "./creatorDashboardReviewLinkRouting";
import {
  resolveCreatorSigningProgressSnapshot,
} from "./creatorDashboardSigningProgress";
import { isAgreementCompletedForDashboard } from "./creatorDashboardAgreementCompletion";

const AG = "ag_test359";

function indexRow(overrides: Partial<WorkspaceIndexAgreement> = {}): WorkspaceIndexAgreement {
  return {
    id: AG,
    title: "Services Agreement",
    updated_at: "2026-06-15T00:00:00.000Z",
    created_at: "2026-06-14T00:00:00.000Z",
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
    vs01DocumentId: "doc_test359",
    receiptId: "rcpt_test359",
    receiptHashSha256: null,
    savedAt: new Date().toISOString(),
    ownerSignerRoleId: "vs01r:ag_test359_scope:i0:owner",
    ownerSigningUrl: "https://example.test/owner",
    signers: [
      {
        counterpartyId: "cp_harbor",
        displayName: "Harbor Peak",
        email: "cp@example.test",
        signingUrl: "https://example.test/cp",
        signerRoleId: "vs01r:ag_test359_scope:i1:cp_harbor",
      },
    ],
    packetPrepareOnly: true,
    senderMustSignFirst: false,
  };
}

describe("creator dashboard signing flow (Test359)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("links prepared 0 of 2 signed routes to signing status surface", () => {
    const row = indexRow();
    const gate = resolveCreatorDashboardReviewGate(row, []);
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate);

    expect(action.kind).toBe("view_signing_status");
    expect(action.label).toBe(CREATOR_VIEW_SIGNING_STATUS_LABEL);
    expect(action.path).toBe(creatorDashboardSigningStatusPath(AG));
    expect(action.path).not.toContain("/app/send/");

    const presentation = deriveDashboardWhatsNextPresentation(row, gate);
    expect(deriveWhatsNextHeadline(row, gate)).toBe("Waiting for signatures");
    expect(deriveWhatsNextProgressLine(row, gate)).toBe("0 of 2 signed");
    expect(presentation.nextStepLabel).toBe("View signing status");
    expect(deriveCreatorDashboardStatusPillFromGate(row, gate)).toBe(CREATOR_WAITING_FOR_SIGNATURES_PILL);
    expect(deriveCreatorSigningStatusLabel(row)).toBe("0 of 2 signed");
    expect(formatLawdogAgreementStatusLabel(row)).toBe("Waiting for signatures");
    expect(deriveCreatorNextActionLabel(row, gate)).toBe(CREATOR_VIEW_SIGNING_STATUS_LABEL);
  });

  it("1 of 2 signed shows partial progress and signing status route", () => {
    const handoff = twoPartyHandoff();
    ensureSigningPacketStatusFromHandoff(handoff, handoff.ownerSignerRoleId!);
    patchSignerPacketStatus(AG, handoff.signers[0]!.signerRoleId!, "signed");

    const row = indexRow();
    const gate = resolveCreatorDashboardReviewGate(row, []);
    const progress = resolveCreatorSigningProgressSnapshot(row, null);

    expect(progress?.signedCount).toBe(1);
    expect(progress?.requiredCount).toBe(2);

    const action = resolveCreatorDashboardSignatureTrackAction(row, gate, { signingProgress: progress });
    expect(action.path).toBe(creatorDashboardSigningStatusPath(AG));
    expect(action.path).not.toContain("/app/send/");

    expect(deriveWhatsNextHeadline(row, gate, progress)).toBe("Waiting for remaining signatures");
    expect(deriveWhatsNextProgressLine(row, gate, progress)).toBe("1 of 2 signed");
    expect(deriveCreatorSigningStatusLabel(row, progress)).toBe("1 of 2 signed");
    expect(formatLawdogAgreementStatusLabel(row, progress)).toBe("Signing: 1 of 2 signed");
    expect(deriveCreatorDashboardStatusPillFromGate(row, gate, progress)).toBe(CREATOR_WAITING_FOR_SIGNATURES_PILL);
  });

  it("2 of 2 signed updates completion presentation and KPIs", () => {
    const handoff = twoPartyHandoff();
    ensureSigningPacketStatusFromHandoff(handoff, handoff.ownerSignerRoleId!);
    patchSignerPacketStatus(AG, handoff.signers[0]!.signerRoleId!, "signed");
    patchSignerPacketStatus(AG, handoff.ownerSignerRoleId!, "signed");

    const row = indexRow({ completed_signed: true });
    const gate = resolveCreatorDashboardReviewGate(row, []);

    expect(isAgreementCompletedForDashboard(row)).toBe(true);

    const action = resolveCreatorDashboardSignatureTrackAction(row, gate);
    expect(action.label).toBe(CREATOR_VIEW_SIGNED_AGREEMENT_LABEL);
    expect(action.path).toContain("/app/done/");
    expect(action.path).not.toContain("/app/send/");

    expect(deriveWhatsNextHeadline(row, gate)).toBe("Agreement fully signed");
    expect(deriveWhatsNextProgressLine(row, gate)).toContain("proof record is ready");

    const kpis = countLawdogDashboardKpis([row]);
    expect(kpis.completedAgreements).toBe(1);
    expect(kpis.activeAgreements).toBe(0);
    expect(formatLawdogAgreementStatusLabel(row)).toBe("Completed");
  });
});
