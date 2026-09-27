/**
 * After paid Pro LawDog → VS01 e-sign, sender is routed to `/app/agreements/:id`.
 * Signing links and receipt ids live here until the user dismisses the workspace banner.
 */
export const PAID_PRO_VS01_POST_SIGN_SESSION_KEY = "claw_paid_pro_vs01_post_sign_v1";
const PAID_PRO_VS01_POST_SIGN_LS_PREFIX = "claw_paid_pro_vs01_post_sign_ls_v1:";

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
  /** Explicit opt-in ordered signing only — default is parallel (see vs01SigningOrderPolicy). */
  senderMustSignFirst?: boolean;
  /** Owner/sender deep link for packet-prepare-only flows. */
  ownerSigningUrl?: string;
  /** Revision token for stored canonical portable packet (initials toggle / rebuild). */
  packetRevision?: string;
  /** Whether body-page initials were enabled when the packet was prepared. */
  initialsEnabled?: boolean;
};

function localHandoffKey(agreementId: string): string {
  return `${PAID_PRO_VS01_POST_SIGN_LS_PREFIX}${agreementId.trim()}`;
}

function readLocalPaidProVs01PostSignHandoff(agreementId: string): PaidProVs01PostSignHandoffV1 | null {
  const id = agreementId.trim();
  if (!id || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(localHandoffKey(id));
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

export function writePaidProVs01PostSignHandoff(payload: PaidProVs01PostSignHandoffV1): void {
  try {
    sessionStorage.setItem(PAID_PRO_VS01_POST_SIGN_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(localHandoffKey(payload.agreementId), JSON.stringify(payload));
    }
  } catch {
    /* ignore */
  }
}

/** Session handoff for the active persist — no agreement id required. */
export function readActivePaidProVs01PostSignHandoff(): PaidProVs01PostSignHandoffV1 | null {
  try {
    const raw = sessionStorage.getItem(PAID_PRO_VS01_POST_SIGN_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<PaidProVs01PostSignHandoffV1>;
    const id = String(o?.agreementId || "").trim();
    if (o?.v !== 1 || !id) return null;
    return readPaidProVs01PostSignHandoff(id);
  } catch {
    return null;
  }
}

/** Newest localStorage packet handoff — hard-refresh / new-tab fallback. */
export function readLatestLocalPaidProVs01PostSignHandoff(): PaidProVs01PostSignHandoffV1 | null {
  if (typeof localStorage === "undefined") return null;
  let best: PaidProVs01PostSignHandoffV1 | null = null;
  let bestAt = -1;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PAID_PRO_VS01_POST_SIGN_LS_PREFIX)) continue;
      const id = key.slice(PAID_PRO_VS01_POST_SIGN_LS_PREFIX.length).trim();
      const parsed = readLocalPaidProVs01PostSignHandoff(id);
      if (!parsed) continue;
      const at = Date.parse(parsed.savedAt) || 0;
      if (at >= bestAt) {
        best = parsed;
        bestAt = at;
      }
    }
  } catch {
    return best;
  }
  return best;
}

export function readPaidProVs01PostSignHandoff(agreementId: string): PaidProVs01PostSignHandoffV1 | null {
  const id = (agreementId || "").trim();
  if (!id) return null;
  try {
    const raw = sessionStorage.getItem(PAID_PRO_VS01_POST_SIGN_SESSION_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<PaidProVs01PostSignHandoffV1>;
      if (o?.v === 1 && String(o.agreementId || "").trim() === id) {
        if (!String(o.vs01DocumentId || "").trim()) return readLocalPaidProVs01PostSignHandoff(id);
        const rid = String(o.receiptId ?? "").trim();
        const packetPrepare = Boolean(o.packetPrepareOnly);
        if (!rid && !packetPrepare) return readLocalPaidProVs01PostSignHandoff(id);
        if (!Array.isArray(o.signers)) return readLocalPaidProVs01PostSignHandoff(id);
        return o as PaidProVs01PostSignHandoffV1;
      }
    }
  } catch {
    /* fall through */
  }
  return readLocalPaidProVs01PostSignHandoff(id);
}

export function clearPaidProVs01PostSignHandoff(): void {
  try {
    sessionStorage.removeItem(PAID_PRO_VS01_POST_SIGN_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
