import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { fetchPublicAgreementVerify } from "../agreement/agreementPublicVerify";
import { isAgreementCompletedForDashboard } from "./creatorDashboardAgreementCompletion";
import {
  formatSigningProgressLabel,
  isAgreementFullySignedLocal,
  isAgreementPacketPrepared,
  isAgreementPartiallySignedLocal,
  readLocalSigningProgressSnapshot,
  type SigningProgressSnapshot,
} from "../vs01/vs01WorkspaceSigningStatus";

export type CreatorSigningProgressSnapshot = SigningProgressSnapshot & {
  source: "local_packet" | "public_verify" | "index";
};

export async function fetchServerSigningProgressSnapshot(
  agreementId: string,
): Promise<CreatorSigningProgressSnapshot | null> {
  const verify = await fetchPublicAgreementVerify(agreementId);
  if (!verify?.signature_status) return null;
  const sig = verify.signature_status;
  const requiredCount = Math.max(sig.signer_party_count ?? 0, 2);
  const signedCount = Math.max(sig.signatures_recorded ?? 0, 0);
  const fullySigned = Boolean(sig.fully_executed) || signedCount >= requiredCount;
  if (!fullySigned && signedCount <= 0) return null;
  return {
    signedCount: fullySigned ? requiredCount : signedCount,
    requiredCount,
    partiallySigned: !fullySigned && signedCount > 0 && signedCount < requiredCount,
    fullySigned,
    source: "public_verify",
  };
}

export function resolveCreatorSigningProgressSnapshot(
  row: WorkspaceIndexAgreement,
  server?: CreatorSigningProgressSnapshot | null,
): CreatorSigningProgressSnapshot | null {
  if (isAgreementCompletedForDashboard(row)) {
    const local = readLocalSigningProgressSnapshot(row.id);
    const requiredCount = local?.requiredCount ?? Math.max(row.signer_count ?? 0, row.party_count ?? 0, 2);
    return {
      signedCount: requiredCount,
      requiredCount,
      partiallySigned: false,
      fullySigned: true,
      source: server?.source ?? "index",
    };
  }
  if (server && (server.partiallySigned || server.fullySigned)) return server;
  const local = readLocalSigningProgressSnapshot(row.id);
  if (local) {
    return { ...local, source: "local_packet" };
  }
  if (isAgreementFullySignedLocal(row.id) || isAgreementPartiallySignedLocal(row.id)) {
    const snap = readLocalSigningProgressSnapshot(row.id);
    if (snap) return { ...snap, source: "local_packet" };
  }
  return null;
}

export function formatCreatorSigningProgressLabel(progress: SigningProgressSnapshot): string {
  return formatSigningProgressLabel(progress);
}

export function workspaceRowNeedsSigningProgressHydration(row: WorkspaceIndexAgreement): boolean {
  if (isAgreementCompletedForDashboard(row)) return false;
  return (
    row.has_server_signing_lock ||
    isAgreementPacketPrepared(row.id) ||
    isAgreementPartiallySignedLocal(row.id)
  );
}

export function creatorDashboardHasPartialSigningProgress(
  row: WorkspaceIndexAgreement,
  serverProgress?: CreatorSigningProgressSnapshot | null,
): boolean {
  const progress = resolveCreatorSigningProgressSnapshot(row, serverProgress ?? null);
  return Boolean(progress?.partiallySigned);
}
