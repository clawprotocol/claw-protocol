import { recipientLinkTokenFingerprint } from "./recipientLinkTokenFingerprint";

/** Legacy single-slot key (one token per browser); do not use for new writes. */
const LEGACY_STORAGE_KEY = "claw_recipient_magic_link_v1";

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

function scopedStorageKey(agreementId: string, token: string): string {
  const a = (agreementId || "").trim();
  const fp = recipientLinkTokenFingerprint(token);
  return `claw_rml_v2:${a}:${fp}`;
}

export function saveRecipientMagicLinkSession(s: RecipientMagicLinkSession): void {
  try {
    const key = scopedStorageKey(s.agreementId, s.token);
    sessionStorage.setItem(key, JSON.stringify(s));
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Load the magic-link session for this agreement.
 * When ``token`` is provided, only the matching scoped row is returned (multi-reviewer safe).
 * When omitted, returns null. Legacy single-slot storage is write-cleared and intentionally ignored
 * so a tokenless recipient route cannot inherit another recipient's token in the same browser.
 */
export function loadRecipientMagicLinkSession(
  agreementId: string,
  token?: string | null,
): RecipientMagicLinkSession | null {
  const want = (agreementId || "").trim();
  if (!want) return null;
  const explicit = (token || "").trim();
  if (explicit) {
    const cur = safeParse(sessionStorage.getItem(scopedStorageKey(want, explicit)));
    if (cur && cur.agreementId === want && cur.token === explicit) return cur;
    return null;
  }
  return null;
}

export function clearRecipientMagicLinkSession(): void {
  try {
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
