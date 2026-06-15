import type { PublicVerifyPayload } from "../agreement/agreementPublicVerify";
import { fetchPublicAgreementVerify } from "../agreement/agreementPublicVerify";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  findVs01CanonicalPacketPortableByAgreementId,
  type Vs01CanonicalPacketPortableV1,
} from "../vs01/vs01CanonicalPacketSeed";
import {
  readPaidProVs01PostSignHandoff,
  type PaidProVs01PostSignHandoffV1,
} from "../vs01/vs01PaidProPostSignHandoff";
import {
  readLocalSigningProgressSnapshot,
  type SigningProgressSnapshot,
} from "../vs01/vs01WorkspaceSigningStatus";
import {
  readSigningPacketStatus,
  signerKeyForHandoffRow,
  writeSigningPacketStatus,
  type Vs01SignerPacketStatus,
  type Vs01SigningPacketStatusSnapshot,
} from "../vs01/vs01SigningPacketStatusStore";
import { isAgreementCompletedForDashboard } from "./creatorDashboardAgreementCompletion";
import type { CreatorSigningProgressSnapshot } from "./creatorDashboardSigningProgress";

/**
 * Owner signing status source-of-truth order (Test361):
 * 1. Workspace index `completed_signed` / draft audit signed hydration
 * 2. Public verify `signature_status` + `signature_events` (persisted server state)
 * 3. VS01 signing packet status store (localStorage)
 * 4. Portable packet / local fallback when persisted state is unavailable
 *
 * Local fully-signed or higher signedCount wins over stale server/workspace 0/N progress.
 */

export type OwnerSigningProgressSource =
  | "index"
  | "public_verify"
  | "local_packet"
  | "workspace_lock";

export type OwnerSigningProgress = SigningProgressSnapshot & {
  source: OwnerSigningProgressSource;
};

export function progressFromPublicVerify(verify: PublicVerifyPayload): OwnerSigningProgress | null {
  const sig = verify.signature_status;
  if (!sig) return null;
  const requiredCount = Math.max(sig.signer_party_count ?? 0, 2);
  const signedCount = Math.max(sig.signatures_recorded ?? 0, 0);
  const fullySigned =
    Boolean(sig.fully_executed) ||
    verify.signature_events.some((e) => e.event_type === "signed" && e.fully_executed) ||
    signedCount >= requiredCount;
  const hasSigningPhase =
    Boolean(sig.locked_version_id) ||
    signedCount > 0 ||
    fullySigned ||
    requiredCount > 0;
  if (!hasSigningPhase) return null;
  return {
    signedCount: fullySigned ? requiredCount : signedCount,
    requiredCount,
    partiallySigned: !fullySigned && signedCount > 0 && signedCount < requiredCount,
    fullySigned,
    source: "public_verify",
  };
}

export async function fetchPersistedSigningProgressSnapshot(
  agreementId: string,
): Promise<CreatorSigningProgressSnapshot | null> {
  const verify = await fetchPublicAgreementVerify(agreementId);
  if (!verify) return null;
  const progress = progressFromPublicVerify(verify);
  if (!progress) return null;
  return { ...progress, source: "public_verify" };
}

function inferRequiredSignerCount(row: WorkspaceIndexAgreement): number {
  return Math.max(row.signer_count ?? 0, row.party_count ?? 0, 2);
}

function progressFromWorkspaceLock(row: WorkspaceIndexAgreement): OwnerSigningProgress | null {
  if (!row.has_server_signing_lock && !row.locked_version_id) return null;
  const requiredCount = inferRequiredSignerCount(row);
  return {
    signedCount: 0,
    requiredCount,
    partiallySigned: false,
    fullySigned: false,
    source: "workspace_lock",
  };
}

function pickAuthoritativeProgress(
  row: WorkspaceIndexAgreement,
  server: CreatorSigningProgressSnapshot | null | undefined,
  local: SigningProgressSnapshot | null,
): OwnerSigningProgress | null {
  if (isAgreementCompletedForDashboard(row)) {
    const requiredCount =
      server?.requiredCount ?? local?.requiredCount ?? inferRequiredSignerCount(row);
    return {
      signedCount: requiredCount,
      requiredCount,
      partiallySigned: false,
      fullySigned: true,
      source: server?.fullySigned ? "public_verify" : local ? "local_packet" : "index",
    };
  }

  if (local?.fullySigned && !server?.fullySigned) {
    return { ...local, source: "local_packet" };
  }
  if (server?.fullySigned) return { ...server, source: "public_verify" };

  if (server && local) {
    if (local.signedCount > server.signedCount) return { ...local, source: "local_packet" };
    if (server.signedCount > local.signedCount) return { ...server, source: "public_verify" };
    if (local.fullySigned) return { ...local, source: "local_packet" };
    if (server.fullySigned) return { ...server, source: "public_verify" };
    if (local.signedCount > 0 && server.signedCount === 0) {
      return { ...local, source: "local_packet" };
    }
    return { ...server, source: "public_verify" };
  }

  if (local && (local.signedCount > 0 || local.fullySigned)) {
    return { ...local, source: "local_packet" };
  }
  if (server) return { ...server, source: "public_verify" };
  if (local) return { ...local, source: "local_packet" };

  return progressFromWorkspaceLock(row);
}

export function resolveOwnerSigningProgress(
  row: WorkspaceIndexAgreement,
  server?: CreatorSigningProgressSnapshot | null,
): OwnerSigningProgress | null {
  const local = readLocalSigningProgressSnapshot(row.id);
  return pickAuthoritativeProgress(row, server ?? null, local);
}

export function mergeWorkspaceRowFromSigningProgress(
  row: WorkspaceIndexAgreement,
  progress?: CreatorSigningProgressSnapshot | null,
): WorkspaceIndexAgreement {
  if (row.completed_signed) return row;
  if (progress?.fullySigned) return { ...row, completed_signed: true };
  if (isAgreementCompletedForDashboard(row)) return row;
  return row;
}

export function reconstructHandoffFromPortable(
  portable: Vs01CanonicalPacketPortableV1,
  agreementTitle?: string,
): PaidProVs01PostSignHandoffV1 {
  const ownerRole = portable.roles[0];
  const counterpartyRoles = portable.roles.slice(1);
  return {
    v: 1,
    agreementId: portable.seed.agreementId,
    agreementTitle: agreementTitle?.trim() || "Agreement",
    vs01DocumentId: portable.seed.documentId,
    receiptId: "",
    receiptHashSha256: null,
    savedAt: portable.seed.savedAt,
    packetPrepareOnly: true,
    ownerSignerRoleId: ownerRole?.roleId,
    ownerSigningUrl: "",
    signers: counterpartyRoles.map((role) => ({
      counterpartyId: role.vs01CounterpartyId ?? role.partyId ?? role.roleId,
      displayName: role.partyName || role.entityName || role.signerName || "Signer",
      email: role.signerEmail ?? "",
      signingUrl: "",
      signerRoleId: role.roleId,
    })),
  };
}

export function resolveOwnerSigningHandoff(
  agreementId: string,
  options?: { agreementTitle?: string },
): PaidProVs01PostSignHandoffV1 | null {
  const id = agreementId.trim();
  if (!id) return null;
  const sessionHandoff = readPaidProVs01PostSignHandoff(id);
  if (sessionHandoff) return sessionHandoff;

  const portable = findVs01CanonicalPacketPortableByAgreementId(id);
  if (portable) {
    return reconstructHandoffFromPortable(portable, options?.agreementTitle);
  }
  return null;
}

function completedParticipantNames(verify: PublicVerifyPayload): Set<string> {
  const names = new Set<string>();
  for (const event of verify.signature_events) {
    if (event.event_type !== "signature_completed") continue;
    const name = (event.participant_display_name ?? "").trim().toLowerCase();
    if (name) names.add(name);
  }
  return names;
}

function nameMatchesCompleted(displayName: string, completed: Set<string>): boolean {
  const dn = displayName.trim().toLowerCase();
  if (!dn) return false;
  if (completed.has(dn)) return true;
  for (const name of completed) {
    if (dn.includes(name) || name.includes(dn)) return true;
  }
  return false;
}

/** Merge persisted public-verify signer events into a packet status snapshot for owner UI. */
export function packetStatusFromPublicVerify(
  verify: PublicVerifyPayload,
  handoff: PaidProVs01PostSignHandoffV1,
  ownerRoleId: string,
): Vs01SigningPacketStatusSnapshot {
  const existing = readSigningPacketStatus(handoff.agreementId);
  const bySignerKey: Record<string, Vs01SignerPacketStatus> = {
    ...(existing?.bySignerKey ?? {}),
  };

  if (ownerRoleId) bySignerKey[ownerRoleId] = bySignerKey[ownerRoleId] ?? "waiting";
  for (const signer of handoff.signers) {
    const key = signerKeyForHandoffRow(signer, signer.signerRoleId);
    bySignerKey[key] = bySignerKey[key] ?? "waiting";
  }

  const completed = completedParticipantNames(verify);
  if (ownerRoleId) {
    const ownerName =
      handoff.signers.find((s) => s.signerRoleId === ownerRoleId)?.displayName ?? "";
    if (nameMatchesCompleted(ownerName, completed)) {
      bySignerKey[ownerRoleId] = "signed";
    }
  }

  for (const signer of handoff.signers) {
    const key = signerKeyForHandoffRow(signer, signer.signerRoleId);
    if (nameMatchesCompleted(signer.displayName, completed)) {
      bySignerKey[key] = "signed";
    }
  }

  const sig = verify.signature_status;
  const requiredCount = Math.max(sig?.signer_party_count ?? 0, Object.keys(bySignerKey).length, 2);
  let signedCount = Object.values(bySignerKey).filter((status) => status === "signed").length;
  const serverSigned = Math.max(sig?.signatures_recorded ?? 0, 0);
  const fullyExecuted =
    Boolean(sig?.fully_executed) ||
    verify.signature_events.some((e) => e.event_type === "signed" && e.fully_executed) ||
    serverSigned >= requiredCount;

  if (!fullyExecuted && serverSigned > signedCount) {
    const waitingKeys = Object.keys(bySignerKey).filter((key) => bySignerKey[key] !== "signed");
    for (let i = 0; i < serverSigned - signedCount && i < waitingKeys.length; i += 1) {
      bySignerKey[waitingKeys[i]!] = "signed";
      signedCount += 1;
    }
  }

  if (fullyExecuted) {
    for (const key of Object.keys(bySignerKey)) bySignerKey[key] = "signed";
  }

  const values = Object.values(bySignerKey);
  const snapshot: Vs01SigningPacketStatusSnapshot = {
    agreementId: handoff.agreementId,
    updatedAt: new Date().toISOString(),
    bySignerKey,
    fullySigned: fullyExecuted || (values.length > 0 && values.every((status) => status === "signed")),
  };

  const local = readLocalSigningProgressSnapshot(handoff.agreementId);
  const localSigned = local?.signedCount ?? 0;
  const shouldPersist =
    snapshot.fullySigned ||
    signedCount > localSigned ||
    (serverSigned > localSigned && serverSigned > 0);
  if (shouldPersist) {
    writeSigningPacketStatus(snapshot);
  }

  return snapshot;
}

export function ownerProofReceiptAvailable(
  agreementId: string,
  verify?: PublicVerifyPayload | null,
): boolean {
  const handoff = readPaidProVs01PostSignHandoff(agreementId);
  if ((handoff?.receiptId ?? "").trim()) return true;
  return Boolean(verify?.signature_status?.fully_executed);
}
