/**
 * After paid Pro LawDog → VS01 e-sign, sender is routed to `/app/agreements/:id`.
 * Signing links and receipt ids live here until the user dismisses the workspace banner.
 */
export const PAID_PRO_VS01_POST_SIGN_SESSION_KEY = "claw_paid_pro_vs01_post_sign_v1";

export type PaidProVs01PostSignSignerRow = {
  counterpartyId: string;
  displayName: string;
  email: string;
  signingUrl: string;
  signerRoleId?: string;
};

export type Vs01SignerPacketRowStatus = "waiting" | "opened" | "signed";

export type PaidProVs01PostSignHandoffV1 = {
  v: 1;
  agreementId: string;
  agreementTitle: string;
  vs01DocumentId: string;
  /** Empty when the sender finished packet preparation without a VS01 signer-session receipt. */
  receiptId: string;
  receiptHashSha256: string | null;
  /** True after “prepare signing packet” — no sender signature session yet. */
  packetPrepareOnly?: boolean;
  savedAt: string;
  signers: PaidProVs01PostSignSignerRow[];
  /** Owner/sender role id for status tracking. */
  ownerSignerRoleId?: string;
  /** When true, sender should sign before sharing counterparty links. */
  senderMustSignFirst?: boolean;
  /** Owner/sender deep link for packet-prepare-only flows. */
  ownerSigningUrl?: string;
};

export function writePaidProVs01PostSignHandoff(payload: PaidProVs01PostSignHandoffV1): void {
  try {
    sessionStorage.setItem(PAID_PRO_VS01_POST_SIGN_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readPaidProVs01PostSignHandoff(agreementId: string): PaidProVs01PostSignHandoffV1 | null {
  const id = (agreementId || "").trim();
  if (!id) return null;
  try {
    const raw = sessionStorage.getItem(PAID_PRO_VS01_POST_SIGN_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<PaidProVs01PostSignHandoffV1>;
    if (o?.v !== 1 || String(o.agreementId || "").trim() !== id) return null;
    if (!String(o.vs01DocumentId || "").trim()) return null;
    const rid = String(o.receiptId ?? "").trim();
    const packetPrepare = Boolean(o.packetPrepareOnly);
    if (!rid && !packetPrepare) return null;
    if (!Array.isArray(o.signers)) return null;
    return o as PaidProVs01PostSignHandoffV1;
  } catch {
    return null;
  }
}

export function clearPaidProVs01PostSignHandoff(): void {
  try {
    sessionStorage.removeItem(PAID_PRO_VS01_POST_SIGN_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
