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
};

export type PaidProVs01PostSignHandoffV1 = {
  v: 1;
  agreementId: string;
  agreementTitle: string;
  vs01DocumentId: string;
  receiptId: string;
  receiptHashSha256: string | null;
  savedAt: string;
  signers: PaidProVs01PostSignSignerRow[];
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
    if (!String(o.receiptId || "").trim() || !String(o.vs01DocumentId || "").trim()) return null;
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
