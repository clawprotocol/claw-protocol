import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "./AppShell";
import { useLaunchNav } from "./LaunchNavContext";
import { StepSigningPacketStatus } from "../vs01/StepSigningPacketStatus";
import {
  loadVs01CanonicalPacketPortable,
  type Vs01CanonicalPacketPortableRole,
} from "../vs01/vs01CanonicalPacketSeed";
import { ensureSigningPacketStatusFromHandoff } from "../vs01/vs01SigningPacketStatusStore";
import type { Vs01PrepareSigningRole } from "../vs01/vs01SignerFieldAssignment";
import { fetchPublicAgreementVerify } from "../agreement/agreementPublicVerify";
import { openReceiptProofBundleDownload } from "../export/dataExportApi";
import {
  CREATOR_DOWNLOAD_PROOF_LABEL,
  CREATOR_VIEW_SIGNED_AGREEMENT_LABEL,
} from "./creatorDashboardCopy";
import { creatorDashboardCompletedProofPath } from "./creatorDashboardReviewLinkRouting";
import {
  fetchPersistedSigningProgressSnapshot,
  ownerProofReceiptAvailable,
  packetStatusFromPublicVerify,
  resolveOwnerSigningHandoff,
  resolveOwnerSigningProgress,
} from "./ownerSigningStatusResolver";
import type { PaidProVs01PostSignHandoffV1 } from "../vs01/vs01PaidProPostSignHandoff";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { isAgreementCompletedForDashboard } from "./creatorDashboardAgreementCompletion";

function portableRolesToPrepareRoles(
  roles: readonly Vs01CanonicalPacketPortableRole[],
): Vs01PrepareSigningRole[] {
  return roles.map((r) => ({
    roleId: r.roleId,
    partyIndex: r.partyIndex,
    partyId: r.partyId,
    entityName: r.entityName,
    partyName: r.partyName,
    roleLabel: r.roleLabel,
    signerName: r.signerName,
    signerTitle: r.signerTitle,
    signerEmail: r.signerEmail,
    reviewEmail: r.reviewEmail,
    isEntityParty: r.isEntityParty,
    requiresSignature: r.requiresSignature,
    vs01CounterpartyId: r.vs01CounterpartyId,
    kind: r.kind,
  }));
}

export type OwnerSigningStatusPageProps = {
  agreementId: string;
};

function workspaceRowStub(agreementId: string): WorkspaceIndexAgreement {
  return {
    id: agreementId,
    title: "Agreement",
    updated_at: new Date().toISOString(),
    party_count: 2,
    signer_count: 2,
    version_ledger_count: 1,
    completed_signed: false,
    has_server_signing_lock: true,
    locked_version_id: "v1",
    workspace_archived_at: null,
    review_sent_at: null,
  };
}

/** Owner-facing VS01 signing progress — reuses prepare-time status cards, not legacy /app/send. */
export function OwnerSigningStatusPage({ agreementId }: OwnerSigningStatusPageProps) {
  const { navigate } = useLaunchNav();
  const aid = agreementId.trim();
  const [handoff, setHandoff] = useState<PaidProVs01PostSignHandoffV1 | null>(() =>
    aid ? resolveOwnerSigningHandoff(aid) : null,
  );
  const [serverProgress, setServerProgress] = useState<Awaited<
    ReturnType<typeof fetchPersistedSigningProgressSnapshot>
  > | null>(null);
  const [verifyLoaded, setVerifyLoaded] = useState(false);
  const [proofAvailable, setProofAvailable] = useState(false);

  const refreshPersistedState = useCallback(async () => {
    if (!aid) return;
    const verify = await fetchPublicAgreementVerify(aid);
    const progress = await fetchPersistedSigningProgressSnapshot(aid);
    setServerProgress(progress);
    setProofAvailable(ownerProofReceiptAvailable(aid, verify));
    setVerifyLoaded(true);

    const resolvedHandoff = resolveOwnerSigningHandoff(aid, {
      agreementTitle: verify?.summary?.title,
    });
    if (resolvedHandoff) {
      setHandoff(resolvedHandoff);
      const ownerRoleId =
        resolvedHandoff.ownerSignerRoleId ??
        portableRolesToPrepareRoles(
          loadVs01CanonicalPacketPortable(resolvedHandoff.vs01DocumentId)?.roles ?? [],
        )[0]?.roleId ??
        "";
      if (verify && ownerRoleId) {
        packetStatusFromPublicVerify(verify, resolvedHandoff, ownerRoleId);
      }
    }
  }, [aid]);

  useEffect(() => {
    void refreshPersistedState();
  }, [refreshPersistedState]);

  const portable = useMemo(() => {
    const did = handoff?.vs01DocumentId?.trim() ?? "";
    return did ? loadVs01CanonicalPacketPortable(did) : null;
  }, [handoff?.vs01DocumentId]);

  const prepareSignerRoles = useMemo(() => {
    if (portable && portable.roles.length >= 2) {
      return portableRolesToPrepareRoles(portable.roles);
    }
    return [];
  }, [portable]);

  const recipientPlacedFields = useMemo(() => {
    if (!portable?.fields.length) return [];
    return portable.initialsPolicy.enabled
      ? portable.fields
      : portable.fields.filter((f) => f.type !== "initials");
  }, [portable]);

  const row = useMemo(() => {
    const stub = workspaceRowStub(aid);
    if (serverProgress?.fullySigned) return { ...stub, completed_signed: true };
    return stub;
  }, [aid, serverProgress?.fullySigned]);

  const ownerProgress = useMemo(
    () => resolveOwnerSigningProgress(row, serverProgress),
    [row, serverProgress],
  );
  const completed = isAgreementCompletedForDashboard(row) || Boolean(ownerProgress?.fullySigned);

  if (!verifyLoaded && !handoff) {
    return (
      <AppShell title="Signing status" subtitle="Track who has signed this agreement.">
        <p className="text-sm text-slate-300">Loading signing status…</p>
      </AppShell>
    );
  }

  if (!handoff) {
    return (
      <AppShell title="Signing status" subtitle="Track who has signed this agreement.">
        <p className="text-sm text-slate-300">
          We could not find signing packet details for this agreement. Return to the dashboard and try again.
        </p>
        {ownerProgress ? (
          <p className="mt-2 text-sm text-slate-300" role="status">
            Server reports {ownerProgress.signedCount} of {ownerProgress.requiredCount} signed.
          </p>
        ) : null}
        <button type="button" className="vs01-btn vs01-btn--primary mt-4" onClick={() => navigate("/app")}>
          Back to dashboard
        </button>
      </AppShell>
    );
  }

  if (!prepareSignerRoles.length) {
    return (
      <AppShell title="Signing status" subtitle={handoff.agreementTitle || "Agreement"}>
        <p className="text-sm text-slate-300">
          Signing links were sent, but detailed signer cards are not available in this browser.
          {ownerProgress
            ? ` Server reports ${ownerProgress.signedCount} of ${ownerProgress.requiredCount} signed.`
            : " Open your signing email or return to the dashboard."}
        </p>
        {completed ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="vs01-btn vs01-btn--primary"
              onClick={() => navigate(creatorDashboardCompletedProofPath(aid))}
            >
              {CREATOR_VIEW_SIGNED_AGREEMENT_LABEL}
            </button>
            {proofAvailable && (handoff.receiptId ?? "").trim() ? (
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary"
                onClick={() => void openReceiptProofBundleDownload(handoff.receiptId!)}
              >
                {CREATOR_DOWNLOAD_PROOF_LABEL}
              </button>
            ) : null}
          </div>
        ) : null}
        <button type="button" className="vs01-btn vs01-btn--secondary mt-4" onClick={() => navigate("/app")}>
          Back to dashboard
        </button>
      </AppShell>
    );
  }

  const ownerRoleId = handoff.ownerSignerRoleId ?? prepareSignerRoles[0]!.roleId;
  ensureSigningPacketStatusFromHandoff(handoff, ownerRoleId);

  return (
    <AppShell
      title={completed ? "Agreement fully signed" : "Signing status"}
      subtitle={
        completed
          ? "All required parties have signed."
          : "Track who has signed and open signing links for each party."
      }
    >
      {completed ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="vs01-btn vs01-btn--primary vs01-btn--auto"
            onClick={() => navigate(creatorDashboardCompletedProofPath(aid))}
          >
            {CREATOR_VIEW_SIGNED_AGREEMENT_LABEL}
          </button>
          {proofAvailable && (handoff.receiptId ?? "").trim() ? (
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--auto"
              onClick={() => void openReceiptProofBundleDownload(handoff.receiptId!)}
            >
              {CREATOR_DOWNLOAD_PROOF_LABEL}
            </button>
          ) : null}
        </div>
      ) : null}
      <StepSigningPacketStatus
        handoff={handoff}
        prepareSignerRoles={prepareSignerRoles}
        senderPlacedFields={[]}
        recipientPlacedFields={recipientPlacedFields}
        creatorDisplayName=""
        onBack={() => navigate("/app")}
        onRefresh={() => {
          void refreshPersistedState();
        }}
      />
    </AppShell>
  );
}
