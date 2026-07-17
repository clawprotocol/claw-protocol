import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { fetchPublicAgreementVerify } from "../agreement/agreementPublicVerify";
import { isAgreementCompletedForDashboard } from "./creatorDashboardAgreementCompletion";
import {
  readLocalSigningProgressSnapshot,
  isAgreementFullySignedLocal,
  isAgreementPartiallySignedLocal,
  isAgreementPacketPrepared,
  type SigningProgressSnapshot,
} from "../vs01/vs01WorkspaceSigningStatus";
import {
  fetchPersistedSigningProgressSnapshot,
  resolveOwnerSigningProgress,
} from "./ownerSigningStatusResolver";

export type CreatorSigningProgressSnapshot = SigningProgressSnapshot & {
  source: "local_packet" | "public_verify" | "index" | "workspace_lock";
};

export async function fetchServerSigningProgressSnapshot(
  agreementId: string,
): Promise<CreatorSigningProgressSnapshot | null> {
  return fetchPersistedSigningProgressSnapshot(agreementId);
}

export function resolveCreatorSigningProgressSnapshot(
  row: WorkspaceIndexAgreement,
  server?: CreatorSigningProgressSnapshot | null,
): CreatorSigningProgressSnapshot | null {
  const local = readLocalSigningProgressSnapshot(row.id);
  if (
    !server &&
    row.has_server_signing_lock &&
    local?.partiallySigned &&
    !local.fullySigned
  ) {
    return { ...local, source: "local_packet" };
  }
  const resolved = resolveOwnerSigningProgress(row, server ?? null);
  if (resolved) return resolved;

  if (isAgreementFullySignedLocal(row.id) || isAgreementPartiallySignedLocal(row.id)) {
    if (local && !local.fullySigned) return { ...local, source: "local_packet" };
  }
  return null;
}

export function formatCreatorSigningProgressLabel(progress: SigningProgressSnapshot): string {
  if (progress.fullySigned) return "Fully signed";
  if (progress.requiredCount > 0) {
    return `${progress.signedCount} of ${progress.requiredCount} signed`;
  }
  if (progress.partiallySigned) {
    return `${progress.signedCount} of ${progress.requiredCount} signed`;
  }
  return "Signature links ready";
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

/** Hydrate signing progress from public verify when local packet state is absent (hard refresh). */
export async function hydrateSigningProgressForAgreement(
  agreementId: string,
): Promise<CreatorSigningProgressSnapshot | null> {
  const verify = await fetchPublicAgreementVerify(agreementId);
  if (!verify) return null;
  const snap = await fetchPersistedSigningProgressSnapshot(agreementId);
  return snap;
}
