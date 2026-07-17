import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import { useLaunchNav } from "./LaunchNavContext";
import { StepSigningPacketStatus } from "../vs01/StepSigningPacketStatus";
import {
  loadVs01CanonicalPacketPortable,
  type Vs01CanonicalPacketPortableRole,
} from "../vs01/vs01CanonicalPacketSeed";
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
  resolveOwnerSigningHandoff,
} from "./ownerSigningStatusResolver";
import type { PaidProVs01PostSignHandoffV1 } from "../vs01/vs01PaidProPostSignHandoff";
import {
  createOwnerSigningStatusHydrationBoundary,
  type OwnerSigningStatusHydratedState,
} from "./ownerSigningStatusHydration";
import {
  BackendSignerPresentation,
  OwnerAuthorityBanner,
} from "./ownerSigningStatusPresentation";
import {
  localPresentationPermitted,
  portableMatchesBackendAuthority,
} from "./ownerSigningStatusPresentationPolicy";

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

/** Owner-facing VS01 signing progress with backend authority controlling state and completion. */
export function OwnerSigningStatusPage({ agreementId }: OwnerSigningStatusPageProps) {
  const { navigate } = useLaunchNav();
  const aid = agreementId.trim();
  const boundaryRef = useRef(createOwnerSigningStatusHydrationBoundary());
  const [hydrated, setHydrated] = useState<OwnerSigningStatusHydratedState | null>(null);
  const [handoff, setHandoff] = useState<PaidProVs01PostSignHandoffV1 | null>(null);
  const [proofAvailable, setProofAvailable] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const downloadCompletedPdf = useCallback(async () => {
    if (!aid || pdfBusy) return;
    setPdfBusy(true);
    try {
      await downloadCompletedSignedAgreementPdf({
        agreementId: aid,
        title: handoff?.agreementTitle ?? hydrated?.agreementTitle,
      });
    } catch {
      /* backend endpoint remains the completion gate */
    } finally {
      setPdfBusy(false);
    }
  }, [aid, handoff?.agreementTitle, hydrated?.agreementTitle, pdfBusy]);

  const refreshPersistedState = useCallback(() => {
    const boundary = boundaryRef.current;
    boundary.activate(aid);
    void boundary.load(aid).then(
      (next) => {
        setHydrated(next);
        const resolvedHandoff = localPresentationPermitted(next)
          ? resolveOwnerSigningHandoff(aid, { agreementTitle: next.agreementTitle })
          : null;
        const resolvedPortable = resolvedHandoff
          ? loadVs01CanonicalPacketPortable(resolvedHandoff.vs01DocumentId)
          : null;
        const confirmedHandoff =
          resolvedHandoff && portableMatchesBackendAuthority(resolvedPortable, next)
            ? resolvedHandoff
            : null;
        setHandoff(confirmedHandoff);
        setProofAvailable(ownerProofReceiptAvailable(aid, next.verify));
        const ownerRoleId =
          confirmedHandoff?.ownerSignerRoleId ??
          portableRolesToPrepareRoles(resolvedPortable?.roles ?? []).find(
            (role) => role.kind === "owner",
          )?.roleId ??
          "";
        if (next.verify && confirmedHandoff && ownerRoleId) {
          packetStatusFromPublicVerify(next.verify, confirmedHandoff, ownerRoleId);
        }
      },
      (error: unknown) => {
        if (error instanceof Error && error.message === "owner_signing_status_stale_load") return;
        setHydrated({
          agreementId: aid,
          agreementTitle: "Agreement",
          status: "conflict",
          authorityClassification: "authority_conflict",
          accepted: null,
          frozen: null,
          signedCount: 0,
          requiredCount: 0,
          conflict: "backend_unavailable",
        });
        setHandoff(null);
        setProofAvailable(false);
      },
    );
  }, [aid]);

  useEffect(() => {
    const boundary = boundaryRef.current;
    refreshPersistedState();
    return () => boundary.cancel();
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

  if (!hydrated || hydrated.agreementId !== aid) {
    return (
      <AppShell title="Signing status" subtitle="Track who has signed this agreement.">
        <p className="text-sm text-slate-300" role="status">
          Loading signing status…
        </p>
      </AppShell>
    );
  }

  const backendCompleted = Boolean(hydrated.backendCompleted);
  const completed = hydrated.status === "legacy" && backendCompleted;
  const authoritativeProgress = {
    signedCount: hydrated.signedCount,
    requiredCount: hydrated.requiredCount,
    partiallySigned:
      !backendCompleted &&
      hydrated.signedCount > 0 &&
      hydrated.signedCount < hydrated.requiredCount,
    fullySigned: completed,
  };

  if (!handoff) {
    return (
      <AppShell title={completed ? "Legacy signed agreement" : "Signing status"} subtitle={hydrated.agreementTitle}>
        <OwnerAuthorityBanner state={hydrated} />
        <BackendSignerPresentation state={hydrated} />
        {backendCompleted ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row" data-testid="owner-signed-actions">
            <button
              type="button"
              className="vs01-btn vs01-btn--primary"
              onClick={() => navigate(creatorDashboardSignedAgreementViewPath(aid))}
            >
              {CREATOR_VIEW_SIGNED_AGREEMENT_LABEL}
            </button>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary"
              data-testid="owner-signing-status-download-pdf"
              disabled={pdfBusy}
              onClick={() => void downloadCompletedPdf()}
            >
              {pdfBusy ? "Preparing PDF…" : CREATOR_DOWNLOAD_PDF_LABEL}
            </button>
          </div>
        ) : null}
        <button type="button" className="vs01-btn vs01-btn--primary mt-4" onClick={() => navigate("/app")}>
          Back to dashboard
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary mt-4"
          onClick={refreshPersistedState}
        >
          Refresh backend status
        </button>
      </AppShell>
    );
  }

  if (!prepareSignerRoles.length) {
    return (
      <AppShell title={completed ? "Legacy signed agreement" : "Signing status"} subtitle={handoff.agreementTitle || "Agreement"}>
        <OwnerAuthorityBanner state={hydrated} />
        <p className="mt-2 text-sm text-slate-300">
          Detailed signer cards are not available in this browser.
          {hydrated.requiredCount > 0
            ? ` Backend reports ${hydrated.signedCount} of ${hydrated.requiredCount} signed.`
            : ""}
        </p>
        {backendCompleted ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row" data-testid="owner-signed-actions">
            <button
              type="button"
              className="vs01-btn vs01-btn--primary"
              onClick={() => navigate(creatorDashboardSignedAgreementViewPath(aid))}
            >
              {CREATOR_VIEW_SIGNED_AGREEMENT_LABEL}
            </button>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary"
              data-testid="owner-signing-status-download-pdf"
              disabled={pdfBusy}
              onClick={() => void downloadCompletedPdf()}
            >
              {pdfBusy ? "Preparing PDF…" : CREATOR_DOWNLOAD_PDF_LABEL}
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

  return (
    <AppShell
      title={completed ? "Legacy signed agreement" : "Signing status"}
      subtitle={handoff.agreementTitle || hydrated.agreementTitle}
    >
      <OwnerAuthorityBanner state={hydrated} />
      {backendCompleted ? (
        <div className="mb-4 mt-4 flex flex-wrap gap-2" data-testid="owner-signed-actions">
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
        authoritativeProgress={authoritativeProgress}
        onBack={() => navigate("/app")}
        onRefresh={refreshPersistedState}
      />
    </AppShell>
  );
}
