import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { isAgreementCompletedForDashboard } from "./creatorDashboardAgreementCompletion";
import { deriveCreatorDashboardStatus } from "./creatorDashboardPresentation";
import { isAgreementPacketPrepared } from "../vs01/vs01WorkspaceSigningStatus";
import { PAID_PRO_VS01_POST_SIGN_SESSION_KEY } from "../vs01/vs01PaidProPostSignHandoff";

function normalizeAgreementTitleForDedupe(title: string): string {
  const t = (title || "").trim().toLowerCase();
  return t || "untitled agreement";
}

function readSessionHandoffAgreementId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PAID_PRO_VS01_POST_SIGN_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { v?: unknown; agreementId?: unknown };
    const id = String(o?.agreementId ?? "").trim();
    return o?.v === 1 && id ? id : null;
  } catch {
    return null;
  }
}

/**
 * True when a never-submitted draft row is a stale duplicate of a completed agreement
 * (same title / signing session) and should not appear on the dashboard index.
 */
export function isSupersededStaleDraftWorkspaceRow(
  row: WorkspaceIndexAgreement,
  allRows: readonly WorkspaceIndexAgreement[],
): boolean {
  if (isAgreementCompletedForDashboard(row)) return false;
  if (deriveCreatorDashboardStatus(row) !== "draft") return false;
  if ((row.review_sent_at || "").trim()) return false;
  if (row.has_server_signing_lock) return false;
  if (isAgreementPacketPrepared(row.id)) return false;

  const titleKey = normalizeAgreementTitleForDedupe(row.title);
  const completedPeers = allRows.filter(
    (peer) => peer.id !== row.id && isAgreementCompletedForDashboard(peer),
  );
  const matchingCompleted = completedPeers.filter(
    (peer) => normalizeAgreementTitleForDedupe(peer.title) === titleKey,
  );
  if (matchingCompleted.length === 0) return false;

  const handoffAgreementId = readSessionHandoffAgreementId();
  if (handoffAgreementId && matchingCompleted.some((peer) => peer.id === handoffAgreementId)) {
    return row.id !== handoffAgreementId;
  }

  const draftUpdated = Date.parse(row.updated_at);
  for (const peer of matchingCompleted) {
    const peerUpdated = Date.parse(peer.updated_at);
    if (
      !Number.isNaN(draftUpdated) &&
      !Number.isNaN(peerUpdated) &&
      draftUpdated > peerUpdated + 60_000
    ) {
      return false;
    }
  }

  return true;
}

export function filterSupersededStaleDraftWorkspaceRows(
  rows: readonly WorkspaceIndexAgreement[],
): WorkspaceIndexAgreement[] {
  return rows.filter((row) => !isSupersededStaleDraftWorkspaceRow(row, rows));
}
