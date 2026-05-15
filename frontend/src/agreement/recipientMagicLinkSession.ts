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
 * When omitted, reads legacy single-slot storage if present (deprecated).
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
  const legacy = safeParse(sessionStorage.getItem(LEGACY_STORAGE_KEY));
  if (legacy && legacy.agreementId === want) return legacy;
  return null;
}

export function clearRecipientMagicLinkSession(): void {
  try {
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
