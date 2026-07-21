import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "./AppShell";
import { useLaunchNav } from "./LaunchNavContext";
import { StepSigningPacketStatus } from "../vs01/StepSigningPacketStatus";
import type { Vs01PrepareSigningRole } from "../vs01/vs01SignerFieldAssignment";
import { downloadCompletedSignedAgreementPdf } from "../agreement/completedSignedAgreementPdfDownload";
import { openReceiptProofBundleDownload } from "../export/dataExportApi";
import {
  CREATOR_DOWNLOAD_PDF_LABEL,
  CREATOR_DOWNLOAD_PROOF_LABEL,
  CREATOR_VIEW_SIGNED_AGREEMENT_LABEL,
} from "./creatorDashboardCopy";
import { creatorDashboardSignedAgreementViewPath } from "./creatorDashboardReviewLinkRouting";
import {
  ownerProofReceiptAvailable,
  packetStatusFromPublicVerify,
  resolveOwnerSigningProgress,
} from "./ownerSigningStatusResolver";
import type { PaidProVs01PostSignHandoffV1 } from "../vs01/vs01PaidProPostSignHandoff";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { isAgreementCompletedForDashboard } from "./creatorDashboardAgreementCompletion";
import {
  hydrateOwnerSigningStatusPage,
  type OwnerSigningStatusHydratedState,
  type OwnerSigningStatusHydrationResult,
} from "./ownerSigningStatusHydration";
import type { CreatorSigningProgressSnapshot } from "./creatorDashboardSigningProgress";
import type { Vs01CanonicalPacketPortableV1 } from "../vs01/vs01CanonicalPacketSeed";

export type OwnerSigningStatusPageProps = {
  agreementId: string;
};

function workspaceRowStub(
  agreementId: string,
  title: string,
  partyCount: number,
  signerCount: number,
  completed: boolean,
): WorkspaceIndexAgreement {
  return {
    id: agreementId,
    title,
    updated_at: new Date().toISOString(),
    party_count: partyCount,
    signer_count: signerCount,
    version_ledger_count: 1,
    completed_signed: completed,
    has_server_signing_lock: true,
    locked_version_id: "v1",
    workspace_archived_at: null,
    review_sent_at: null,
  };
}

/** Owner-facing VS01 signing progress — durable backend hydration (Phase 3C). */
export function OwnerSigningStatusPage({ agreementId }: OwnerSigningStatusPageProps) {
  const { navigate } = useLaunchNav();
  const aid = agreementId.trim();
  const [hydrated, setHydrated] = useState<OwnerSigningStatusHydrationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);

  const refreshPersistedState = useCallback(async () => {
    if (!aid) return;
    setLoading(true);
    const result = await hydrateOwnerSigningStatusPage(aid);
    if (result.ok) {
      const ownerRoleId =
        result.handoff.ownerSignerRoleId ?? result.prepareSignerRoles[0]?.roleId ?? "";
      if (ownerRoleId && result.verify) {
        packetStatusFromPublicVerify(result.verify, result.handoff, ownerRoleId);
      }
    }
    setHydrated(result);
    setLoading(false);
  }, [aid]);

  useEffect(() => {
    void refreshPersistedState();
  }, [refreshPersistedState]);

  const successState: OwnerSigningStatusHydratedState | null =
    hydrated?.ok === true ? hydrated : null;

  const handoff: PaidProVs01PostSignHandoffV1 | null = successState?.handoff ?? null;
  const prepareSignerRoles: Vs01PrepareSigningRole[] = successState?.prepareSignerRoles ?? [];
  const portable: Vs01CanonicalPacketPortableV1 | null = successState?.portable ?? null;
  const serverProgress: CreatorSigningProgressSnapshot | null = successState?.progress ?? null;
  const verifyLoaded = !loading;
  void verifyLoaded;
  const proofAvailable = ownerProofReceiptAvailable(
    aid,
    successState?.verify ?? (hydrated && !hydrated.ok ? hydrated.verify ?? null : null),
  );

  const downloadCompletedPdf = useCallback(async () => {
    if (!aid || pdfBusy) return;
    setPdfBusy(true);
    try {
      await downloadCompletedSignedAgreementPdf({
        agreementId: aid,
        title: handoff?.agreementTitle,
      });
    } catch {
      /* owner can open view-signed and retry */
    } finally {
      setPdfBusy(false);
    }
  }, [aid, handoff?.agreementTitle, pdfBusy]);

  const row = useMemo(() => {
    if (!successState) {
      return workspaceRowStub(aid, "Agreement", 2, 2, false);
    }
    const counts = successState.frozenSnapshot;
    return workspaceRowStub(
      aid,
      successState.agreementTitle,
      counts.parties.length,
      counts.signers.filter((s) => s.requiresSignature).length,
      Boolean(serverProgress?.fullySigned),
    );
  }, [aid, successState, serverProgress?.fullySigned]);

  const ownerProgress = useMemo(
    () => resolveOwnerSigningProgress(row, serverProgress),
    [row, serverProgress],
  );
  const completed = isAgreementCompletedForDashboard(row) || Boolean(ownerProgress?.fullySigned);

  const recipientPlacedFields = useMemo(() => {
    if (!portable?.fields.length) return [];
    return portable.initialsPolicy.enabled
      ? portable.fields
      : portable.fields.filter((f) => f.type !== "initials");
  }, [portable]);

  if (loading) {
    return (
      <AppShell title="Signing status" subtitle="Track who has signed this agreement.">
        <p className="text-sm text-slate-300">Loading signing status…</p>
      </AppShell>
    );
  }

  if (!hydrated?.ok) {
    const err = hydrated?.error ?? "backend_unavailable";
    const detail = hydrated && !hydrated.ok ? hydrated.detail : undefined;
    const progress =
      hydrated && !hydrated.ok && hydrated.verify
        ? resolveOwnerSigningProgress(
            workspaceRowStub(aid, "Agreement", 2, 2, false),
            null,
          )
        : null;
    return (
      <AppShell title="Signing status" subtitle="Track who has signed this agreement.">
        <p className="text-sm text-slate-300" role="alert">
          {err === "packet_cancelled"
            ? "This signing packet has been cancelled."
            : err === "legacy_reissue_required"
              ? "This agreement requires a formal packet reissue before signing can continue."
              : "We could not load durable signing authority for this agreement."}
        </p>
        {detail ? <p className="mt-1 text-xs text-slate-400">{detail}</p> : null}
        {progress ? (
          <p className="mt-2 text-sm text-slate-300" role="status">
            Server reports {progress.signedCount} of {progress.requiredCount} signed.
          </p>
        ) : null}
        <button type="button" className="vs01-btn vs01-btn--primary mt-4" onClick={() => navigate("/app")}>
          Back to dashboard
        </button>
      </AppShell>
    );
  }

  if (!handoff || !prepareSignerRoles.length) {
    return (
      <AppShell title="Signing status" subtitle={handoff?.agreementTitle || "Agreement"}>
        <p className="text-sm text-slate-300">
          Signing packet details could not be resolved from durable backend records.
        </p>
        <button type="button" className="vs01-btn vs01-btn--secondary mt-4" onClick={() => navigate("/app")}>
          Back to dashboard
        </button>
      </AppShell>
    );
  }

  const ownerRoleId = handoff.ownerSignerRoleId ?? prepareSignerRoles[0]!.roleId;

  return (
    <AppShell
      title={completed ? "Agreement fully signed" : "Signing status"}
      subtitle={
        completed
          ? "All required parties have signed."
          : `Track who has signed — ${ownerProgress?.signedCount ?? 0} of ${ownerProgress?.requiredCount ?? 0} required signers.`
      }
    >
      {successState?.packetState === "superseded" ? (
        <p className="mb-3 text-sm text-amber-200" role="status">
          A newer signing packet revision is active.
        </p>
      ) : null}
      {completed ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="vs01-btn vs01-btn--primary vs01-btn--auto"
            onClick={() => navigate(creatorDashboardSignedAgreementViewPath(aid))}
          >
            {CREATOR_VIEW_SIGNED_AGREEMENT_LABEL}
          </button>
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary vs01-btn--auto"
            data-testid="owner-signing-status-download-pdf"
            disabled={pdfBusy}
            onClick={() => void downloadCompletedPdf()}
          >
            {pdfBusy ? "Preparing PDF…" : CREATOR_DOWNLOAD_PDF_LABEL}
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
      <input type="hidden" data-testid="owner-signing-status-owner-role" value={ownerRoleId} />
      <input type="hidden" data-testid="owner-signing-status-packet-revision" value={successState?.packetRevision ?? ""} />
    </AppShell>
  );
}
