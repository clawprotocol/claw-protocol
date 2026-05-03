/**
 * Session handoff for premium recipient flow: names, emails, and roles survive
 * Continue / checkout / modal remounts. Merge rules never replace a valid email with blank.
 */

const LEGACY_KEY = "claw_premium_party_names_handoff_v1";
const KEY_V2 = "claw_premium_recipient_handoff_v2";

export type PremiumRecipientHandoffSlot = {
  name: string;
  email: string;
  role: string;
};

export type PremiumRecipientHandoffV2 = {
  v: 2;
  party1: PremiumRecipientHandoffSlot;
  party2: PremiumRecipientHandoffSlot;
  savedAt: number;
};

function emptySlot(): PremiumRecipientHandoffSlot {
  return { name: "", email: "", role: "" };
}

function readLegacyPartyNamesOnly(): { party1: string; party2: string } | null {
  try {
    const raw = sessionStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { party1?: string; party2?: string };
    if (!parsed || typeof parsed.party1 !== "string" || typeof parsed.party2 !== "string") return null;
    return { party1: parsed.party1.trim(), party2: parsed.party2.trim() };
  } catch {
    return null;
  }
}

/** Full handoff (v2). Migrates legacy name-only key once. */
export function readPremiumRecipientHandoff(): PremiumRecipientHandoffV2 | null {
  try {
    const raw = sessionStorage.getItem(KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw) as PremiumRecipientHandoffV2;
      if (parsed?.v === 2 && parsed.party1 && parsed.party2) {
        return {
          v: 2,
          party1: {
            name: String(parsed.party1.name || "").trim(),
            email: String(parsed.party1.email || "").trim(),
            role: String(parsed.party1.role || "").trim(),
          },
          party2: {
            name: String(parsed.party2.name || "").trim(),
            email: String(parsed.party2.email || "").trim(),
            role: String(parsed.party2.role || "").trim(),
          },
          savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
        };
      }
    }
  } catch {
    /* ignore */
  }
  const leg = readLegacyPartyNamesOnly();
  if (!leg) return null;
  const migrated: PremiumRecipientHandoffV2 = {
    v: 2,
    party1: { name: leg.party1, email: "", role: "" },
    party2: { name: leg.party2, email: "", role: "" },
    savedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(KEY_V2, JSON.stringify(migrated));
    sessionStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  return migrated;
}

function mergeSlot(
  prev: PremiumRecipientHandoffSlot,
  patch: Partial<{ name: string; email: string; role: string }>,
): PremiumRecipientHandoffSlot {
  const name = patch.name !== undefined ? String(patch.name || "").trim() || prev.name : prev.name;
  const email =
    patch.email !== undefined
      ? String(patch.email || "").trim() || String(prev.email || "").trim()
      : String(prev.email || "").trim();
  const role =
    patch.role !== undefined
      ? String(patch.role || "").trim() || prev.role || "party"
      : prev.role || "party";
  return { name, email, role };
}

/**
 * Persist names, emails, and roles in one write. Undefined patch fields keep previous values.
 * Emails: blank patch never clears a previously stored non-blank email.
 */
export function persistPremiumRecipientHandoff(patch: {
  party1?: Partial<{ name: string; email: string; role: string }>;
  party2?: Partial<{ name: string; email: string; role: string }>;
}): void {
  const cur = readPremiumRecipientHandoff();
  const base1 = cur?.party1 ?? emptySlot();
  const base2 = cur?.party2 ?? emptySlot();
  const party1 = mergeSlot(base1, patch.party1 ?? {});
  const party2 = mergeSlot(base2, patch.party2 ?? {});
  if (!party1.name && !party2.name && !party1.email && !party2.email) return;
  try {
    const payload: PremiumRecipientHandoffV2 = { v: 2, party1, party2, savedAt: Date.now() };
    sessionStorage.setItem(KEY_V2, JSON.stringify(payload));
    sessionStorage.removeItem(LEGACY_KEY);
    const p1e = Boolean(String(party1.email || "").trim());
    const p2e = Boolean(String(party2.email || "").trim());
    if (p1e || p2e) {
      // eslint-disable-next-line no-console
      console.info("[review-link-recipient-email-handoff-write]", {
        partySlotsWithEmail: (p1e ? 1 : 0) + (p2e ? 1 : 0),
        party1HasEmail: p1e,
        party2HasEmail: p2e,
      });
    }
  } catch {
    /* ignore */
  }
}

/** @deprecated Use persistPremiumRecipientHandoff — kept for call sites; merges without clearing emails. */
export function writePremiumPartyNamesHandoff(party1: string, party2: string): void {
  persistPremiumRecipientHandoff({
    party1: { name: (party1 || "").trim() },
    party2: { name: (party2 || "").trim() },
  });
}

/** Names only — for mergePremiumDraftPartiesWithRecipientPriority. */
export function readPremiumPartyNamesHandoff(): { party1: string; party2: string } | null {
  const full = readPremiumRecipientHandoff();
  if (!full) return null;
  return { party1: full.party1.name, party2: full.party2.name };
}

export function clearPremiumPartyNamesHandoff(): void {
  try {
    sessionStorage.removeItem(KEY_V2);
    sessionStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

/** Replace session handoff entirely (e.g. premium snapshot hydration). Allows explicit empty emails. */
export function writePremiumRecipientHandoffExact(party1: PremiumRecipientHandoffSlot, party2: PremiumRecipientHandoffSlot): void {
  try {
    const payload: PremiumRecipientHandoffV2 = {
      v: 2,
      party1: {
        name: String(party1.name ?? "").trim(),
        email: String(party1.email ?? "").trim(),
        role: String(party1.role ?? "").trim() || "party",
      },
      party2: {
        name: String(party2.name ?? "").trim(),
        email: String(party2.email ?? "").trim(),
        role: String(party2.role ?? "").trim() || "party",
      },
      savedAt: Date.now(),
    };
    if (!payload.party1.name && !payload.party2.name && !payload.party1.email && !payload.party2.email) return;
    sessionStorage.setItem(KEY_V2, JSON.stringify(payload));
    sessionStorage.removeItem(LEGACY_KEY);
    const p1e = Boolean(String(payload.party1.email || "").trim());
    const p2e = Boolean(String(payload.party2.email || "").trim());
    if (p1e || p2e) {
      // eslint-disable-next-line no-console
      console.info("[review-link-recipient-email-handoff-write]", {
        partySlotsWithEmail: (p1e ? 1 : 0) + (p2e ? 1 : 0),
        party1HasEmail: p1e,
        party2HasEmail: p2e,
      });
    }
  } catch {
    /* ignore */
  }
}

/** Prefer local when non-empty; otherwise handoff. Never replaces non-empty local with blank. */
export function hydrateEmailFromHandoff(localEmail: string, handoffEmail: string): string {
  const l = String(localEmail ?? "").trim();
  const h = String(handoffEmail ?? "").trim();
  if (l) return l;
  return h;
}

export function hydrateNameFromHandoff(localName: string, handoffName: string): string {
  const l = String(localName ?? "").trim();
  const h = String(handoffName ?? "").trim();
  if (l) return l;
  return h;
}
