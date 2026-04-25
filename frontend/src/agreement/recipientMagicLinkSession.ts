const STORAGE_KEY = "claw_recipient_magic_link_v1";

export type RecipientMagicLinkSession = {
  agreementId: string;
  token: string;
  recipientPartyId?: string;
  recipientLinkRole?: "signer" | "reviewer" | "counterparty";
  inviterDisplayName?: string;
};

function safeParse(raw: string | null): RecipientMagicLinkSession | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as RecipientMagicLinkSession;
    if (!o || typeof o.agreementId !== "string" || typeof o.token !== "string") return null;
    return o;
  } catch {
    return null;
  }
}

export function saveRecipientMagicLinkSession(s: RecipientMagicLinkSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadRecipientMagicLinkSession(agreementId: string): RecipientMagicLinkSession | null {
  const want = (agreementId || "").trim();
  if (!want) return null;
  const cur = safeParse(sessionStorage.getItem(STORAGE_KEY));
  if (!cur || cur.agreementId !== want) return null;
  return cur;
}

export function clearRecipientMagicLinkSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
