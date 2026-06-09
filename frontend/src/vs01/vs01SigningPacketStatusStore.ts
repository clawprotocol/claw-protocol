import type { PaidProVs01PostSignHandoffV1 } from "./vs01PaidProPostSignHandoff";
import { markAgreementPacketPrepared } from "./vs01WorkspaceSigningStatus";

export type Vs01SignerPacketStatus = "waiting" | "opened" | "signed";

export type Vs01SigningPacketStatusSnapshot = {
  agreementId: string;
  updatedAt: string;
  /** owner role uses key `owner` */
  bySignerKey: Record<string, Vs01SignerPacketStatus>;
  fullySigned: boolean;
};

const KEY_PREFIX = "vs01_signing_packet_status_v1:";

function storageKey(agreementId: string): string {
  return `${KEY_PREFIX}${agreementId.trim()}`;
}

export function signerKeyForHandoffRow(
  row: PaidProVs01PostSignHandoffV1["signers"][number],
  signerRoleId?: string | null,
): string {
  const rid = (signerRoleId ?? row.signerRoleId ?? "").trim();
  if (rid) return rid;
  const cp = (row.counterpartyId ?? "").trim();
  return cp || row.displayName.trim() || "signer";
}

export function readSigningPacketStatus(agreementId: string): Vs01SigningPacketStatusSnapshot | null {
  const id = agreementId.trim();
  if (!id || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return null;
    const o = JSON.parse(raw) as Vs01SigningPacketStatusSnapshot;
    if (o?.agreementId !== id || typeof o.bySignerKey !== "object") return null;
    return o;
  } catch {
    return null;
  }
}

export function writeSigningPacketStatus(snapshot: Vs01SigningPacketStatusSnapshot): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(snapshot.agreementId), JSON.stringify(snapshot));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("vs01-signing-packet-status-changed", {
          detail: { agreementId: snapshot.agreementId },
        }),
      );
    }
  } catch {
    /* ignore */
  }
}

export function ensureSigningPacketStatusFromHandoff(
  handoff: PaidProVs01PostSignHandoffV1,
  ownerRoleId: string,
): Vs01SigningPacketStatusSnapshot {
  const existing = readSigningPacketStatus(handoff.agreementId);
  if (existing) return existing;
  const bySignerKey: Record<string, Vs01SignerPacketStatus> = {
    [ownerRoleId]: "waiting",
  };
  for (const s of handoff.signers) {
    bySignerKey[signerKeyForHandoffRow(s, s.signerRoleId)] = "waiting";
  }
  const snap: Vs01SigningPacketStatusSnapshot = {
    agreementId: handoff.agreementId,
    updatedAt: new Date().toISOString(),
    bySignerKey,
    fullySigned: false,
  };
  writeSigningPacketStatus(snap);
  markAgreementPacketPrepared(handoff.agreementId);
  return snap;
}

export function patchSignerPacketStatus(
  agreementId: string,
  signerKey: string,
  status: Vs01SignerPacketStatus,
): Vs01SigningPacketStatusSnapshot | null {
  const cur = readSigningPacketStatus(agreementId);
  if (!cur) return null;
  const next: Vs01SigningPacketStatusSnapshot = {
    ...cur,
    updatedAt: new Date().toISOString(),
    bySignerKey: { ...cur.bySignerKey, [signerKey]: status },
    fullySigned: false,
  };
  const values = Object.values(next.bySignerKey);
  next.fullySigned = values.length > 0 && values.every((v) => v === "signed");
  writeSigningPacketStatus(next);
  return next;
}
