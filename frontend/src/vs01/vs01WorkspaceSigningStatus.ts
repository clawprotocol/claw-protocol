import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { readPaidProVs01PostSignHandoff } from "./vs01PaidProPostSignHandoff";
import { readSigningPacketStatus } from "./vs01SigningPacketStatusStore";

const PACKET_PREPARED_KEY = "vs01_packet_prepared_v1:";
const FIELDS_PLACED_COUNT_KEY = "vs01_fields_placed_count_v1:";

function packetPreparedKey(agreementId: string): string {
  return `${PACKET_PREPARED_KEY}${agreementId.trim()}`;
}

function fieldsPlacedCountKey(agreementId: string): string {
  return `${FIELDS_PLACED_COUNT_KEY}${agreementId.trim()}`;
}

export function markAgreementFieldsPlacedCount(agreementId: string, count: number): void {
  const id = agreementId.trim();
  if (!id || count <= 0 || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(fieldsPlacedCountKey(id), String(Math.floor(count)));
  } catch {
    /* ignore */
  }
}

export function readAgreementFieldsPlacedCount(agreementId: string): number {
  const id = agreementId.trim();
  if (!id || typeof localStorage === "undefined") return 0;
  try {
    const raw = localStorage.getItem(fieldsPlacedCountKey(id));
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function markAgreementPacketPrepared(agreementId: string): void {
  const id = agreementId.trim();
  if (!id || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(packetPreparedKey(id), new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export function isAgreementPacketPrepared(agreementId: string): boolean {
  const id = agreementId.trim();
  if (!id) return false;
  if (readSigningPacketStatus(id)) return true;
  if (readPaidProVs01PostSignHandoff(id)?.packetPrepareOnly) return true;
  if (typeof localStorage === "undefined") return false;
  try {
    return Boolean(localStorage.getItem(packetPreparedKey(id)));
  } catch {
    return false;
  }
}

export function isAgreementFullySignedLocal(agreementId: string): boolean {
  const snap = readSigningPacketStatus(agreementId);
  if (!snap) return false;
  if (snap.fullySigned) return true;
  const values = Object.values(snap.bySignerKey);
  return values.length >= 2 && values.every((status) => status === "signed");
}

/**
 * Workspace/dashboard label: server index first, then local packet status snapshot.
 */
export function workspaceSigningStatusLabel(row: WorkspaceIndexAgreement): string {
  if (row.completed_signed) return "Fully signed";
  if (isAgreementFullySignedLocal(row.id)) return "Fully signed";
  if (row.has_server_signing_lock) return "Signing in progress";
  if (isAgreementPacketPrepared(row.id)) return "Signing in progress";
  if (row.all_reviewers_approved) return "Ready to prepare signing";
  const req = row.review_approvals_required ?? 0;
  const done = row.review_approvals_completed ?? 0;
  if (row.reviewer_approved && req > 1) {
    return `${done} of ${req} reviewers approved`;
  }
  if (row.reviewer_approved) return "Ready to prepare signing";
  if (row.review_sent_at) return "Waiting for review";
  if (row.version_ledger_count > 0) return "Ready to prepare signing";
  return "Draft";
}
