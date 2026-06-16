/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import * as agreementPublicVerify from "../agreement/agreementPublicVerify";
import {
  ensureSigningPacketStatusFromHandoff,
  patchSignerPacketStatus,
} from "../vs01/vs01SigningPacketStatusStore";
import type { PaidProVs01PostSignHandoffV1 } from "../vs01/vs01PaidProPostSignHandoff";
import { storeVs01CanonicalPacketPortable } from "../vs01/vs01CanonicalPacketSeed";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import {
  fetchPersistedSigningProgressSnapshot,
  mergeWorkspaceRowFromSigningProgress,
  progressFromPublicVerify,
  resolveOwnerSigningHandoff,
  resolveOwnerSigningProgress,
} from "./ownerSigningStatusResolver";
import { isAgreementCompletedForDashboard } from "./creatorDashboardAgreementCompletion";
import {
  deriveCreatorDashboardStatusPillFromGate,
  deriveCreatorSigningStatusLabel,
} from "./creatorDashboardPresentation";
import { resolveCreatorDashboardReviewGate } from "./creatorDashboardReviewGate";
import { deriveWhatsNextHeadline, deriveWhatsNextProgressLine } from "./dashboardWhatsNextPresentation";
import { countLawdogDashboardKpis, formatLawdogAgreementStatusLabel } from "./lawdogDashboardPresentation";
import { CREATOR_WAITING_FOR_SIGNATURES_PILL } from "./creatorDashboardCopy";

const AG = "ag_test359_resolver";

function indexRow(overrides: Partial<WorkspaceIndexAgreement> = {}): WorkspaceIndexAgreement {
  return {
    id: AG,
    title: "Services Agreement",
    updated_at: "2026-06-15T00:00:00.000Z",
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

function publicVerifyPayload(overrides: {
  signatures_recorded?: number;
  fully_executed?: boolean;
  signer_party_count?: number;
}) {
  return {
    agreement_id: AG,
    summary: { title: "Services Agreement" },
    participants: [],
    version_history: [],
    signature_status: {
      fully_executed: overrides.fully_executed ?? false,
      signatures_recorded: overrides.signatures_recorded ?? 0,
      signer_party_count: overrides.signer_party_count ?? 2,
      locked_version_id: "v1",
    },
    signature_events: [],
    verification: { agreement_hash: "abc" },
  };
}

describe("ownerSigningStatusResolver (Test359 follow-up)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("reports 0 of 2 from persisted public verify when localStorage is empty", async () => {
    vi.spyOn(agreementPublicVerify, "fetchPublicAgreementVerify").mockResolvedValue(
      publicVerifyPayload({ signatures_recorded: 0 }) as never,
    );
    const snap = await fetchPersistedSigningProgressSnapshot(AG);
    expect(snap).toEqual({
      signedCount: 0,
      requiredCount: 2,
      partiallySigned: false,
      fullySigned: false,
      source: "public_verify",
    });

    const row = indexRow();
    const progress = resolveOwnerSigningProgress(row, snap);
    expect(progress?.signedCount).toBe(0);
    expect(progress?.requiredCount).toBe(2);
    expect(deriveWhatsNextProgressLine(row, resolveCreatorDashboardReviewGate(row, []), snap)).toBe(
      "0 of 2 signed",
    );
  });

  it("prefers persisted 2/2 over stale local 1/2", () => {
    const handoff = twoPartyHandoff();
    ensureSigningPacketStatusFromHandoff(handoff, handoff.ownerSignerRoleId!);
    patchSignerPacketStatus(AG, handoff.signers[0]!.signerRoleId!, "signed");

    const server = progressFromPublicVerify(
      publicVerifyPayload({ signatures_recorded: 2, fully_executed: true }) as never,
    );
    expect(server?.fullySigned).toBe(true);

    const row = indexRow();
    const progress = resolveOwnerSigningProgress(row, server);
    expect(progress?.fullySigned).toBe(true);
    expect(progress?.signedCount).toBe(2);
    expect(isAgreementCompletedForDashboard(mergeWorkspaceRowFromSigningProgress(row, server))).toBe(true);
  });

  it("reconstructs handoff from portable packet after session handoff is cleared", () => {
    const handoff = twoPartyHandoff();
    const corpusPlain = "x".repeat(1500);
    const portable = {
      v: 1 as const,
      seed: {
        v: 1 as const,
        documentId: "doc_test359",
        agreementId: AG,
        corpusPlain,
        corpusHash: fingerprintAgreementBody(corpusPlain),
        savedAt: new Date().toISOString(),
      },
      fields: [],
      roles: [
        {
          roleId: handoff.ownerSignerRoleId!,
          partyIndex: 0,
          partyId: "owner",
          entityName: "Owner Co",
          partyName: "Owner Co",
          roleLabel: "Client",
          signerName: "Owner",
          signerTitle: "CEO",
          signerEmail: "owner@example.test",
          reviewEmail: "owner@example.test",
          isEntityParty: true,
          requiresSignature: true,
          vs01CounterpartyId: "owner",
          kind: "owner" as const,
        },
        {
          roleId: handoff.signers[0]!.signerRoleId!,
          partyIndex: 1,
          partyId: "cp_harbor",
          entityName: "Harbor Peak",
          partyName: "Harbor Peak",
          roleLabel: "Provider",
          signerName: "Henry",
          signerTitle: "COO",
          signerEmail: "cp@example.test",
          reviewEmail: "cp@example.test",
          isEntityParty: true,
          requiresSignature: true,
          vs01CounterpartyId: "cp_harbor",
          kind: "counterparty" as const,
        },
      ],
      pageCount: 12,
      witnessPageIndex: 11,
      initialsPolicy: { enabled: false, bodyPagesOnly: true },
      fieldCount: 0,
    };

    storeVs01CanonicalPacketPortable("doc_test359", portable as never);
    sessionStorage.clear();

    const resolved = resolveOwnerSigningHandoff(AG);
    expect(resolved?.agreementId).toBe(AG);
    expect(resolved?.vs01DocumentId).toBe("doc_test359");
    expect(resolved?.signers).toHaveLength(1);
  });

  it("updates dashboard KPIs when server completion is merged onto rows", () => {
    const row = indexRow({ completed_signed: true });
    const kpis = countLawdogDashboardKpis([row]);
    expect(kpis.completedAgreements).toBe(1);
    expect(kpis.activeAgreements).toBe(0);
  });

  it("uses Waiting for signatures pill for in-progress signing", () => {
    const row = indexRow();
    const gate = resolveCreatorDashboardReviewGate(row, []);
    const server = progressFromPublicVerify(publicVerifyPayload({ signatures_recorded: 1 }) as never);
    expect(deriveCreatorDashboardStatusPillFromGate(row, gate, server)).toBe(
      CREATOR_WAITING_FOR_SIGNATURES_PILL,
    );
    expect(deriveWhatsNextHeadline(row, gate, server)).toBe("Waiting for remaining signatures");
    expect(formatLawdogAgreementStatusLabel(row, server)).toBe("Signing: 1 of 2 signed");
    expect(deriveCreatorSigningStatusLabel(row, server)).toBe("1 of 2 signed");
  });

  it("prefers local 2/2 over stale server 0/2", () => {
    const handoff = twoPartyHandoff();
    ensureSigningPacketStatusFromHandoff(handoff, handoff.ownerSignerRoleId!);
    patchSignerPacketStatus(AG, handoff.ownerSignerRoleId!, "signed");
    patchSignerPacketStatus(AG, handoff.signers[0]!.signerRoleId!, "signed");

    const server = progressFromPublicVerify(publicVerifyPayload({ signatures_recorded: 0 }) as never);
    const row = indexRow();
    const progress = resolveOwnerSigningProgress(row, server);
    expect(progress?.fullySigned).toBe(true);
    expect(progress?.signedCount).toBe(2);
    expect(progress?.source).toBe("local_packet");
  });

  it("prefers server 2/2 completed over stale local 1/2", () => {
    const handoff = twoPartyHandoff();
    ensureSigningPacketStatusFromHandoff(handoff, handoff.ownerSignerRoleId!);
    patchSignerPacketStatus(AG, handoff.ownerSignerRoleId!, "signed");

    const server = progressFromPublicVerify(
      publicVerifyPayload({ signatures_recorded: 2, fully_executed: true }) as never,
    );
    const row = indexRow();
    const progress = resolveOwnerSigningProgress(row, server);
    expect(progress?.fullySigned).toBe(true);
    expect(progress?.signedCount).toBe(2);
    expect(progress?.source).toBe("public_verify");
  });
});
