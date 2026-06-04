/**
 * Session handoff for premium recipient flow: names, emails, and roles survive
 * Continue / checkout / modal remounts. Merge rules never replace a valid email with blank.
 */

import {
  normalizeSignerMetadataForSave,
  signerMetadataInputRaw,
} from "../../agreement/signerMetadataNormalize";

import { invalidatePremiumRecipientHandoffReadCache } from "./premiumRecipientHandoffReadCache";

const LEGACY_KEY = "claw_premium_party_names_handoff_v1";
const KEY_V2 = "claw_premium_recipient_handoff_v2";

let lastHandoffReadLogFingerprint = "";

export type PremiumRecipientHandoffSlot = {
  name: string;
  email: string;
  role: string;
  /** Human authorized signer (optional; never implied from entity {@link name}). */
  signerName?: string;
  signerTitle?: string;
  partyAddress?: string;
};

export type PremiumRecipientHandoffV2 = {
  v: 2;
  party1: PremiumRecipientHandoffSlot;
  party2: PremiumRecipientHandoffSlot;
  savedAt: number;
  /**
   * Party indices 2..n-1 (agreement order). Indices 0–1 stay in `party1` / `party2` for backward compatibility.
   */
  partyIndexSlots?: PremiumRecipientHandoffSlot[];
};

function emptySlot(): PremiumRecipientHandoffSlot {
  return { name: "", email: "", role: "", signerName: "", signerTitle: "", partyAddress: "" };
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
        const rawExtra = (parsed as { partyIndexSlots?: unknown }).partyIndexSlots;
        let partyIndexSlots: PremiumRecipientHandoffSlot[] | undefined;
        if (Array.isArray(rawExtra)) {
          const cleaned = rawExtra
            .filter((x): x is PremiumRecipientHandoffSlot => Boolean(x) && typeof x === "object")
            .map((x) => ({
              name: String((x as PremiumRecipientHandoffSlot).name || "").trim(),
              email: String((x as PremiumRecipientHandoffSlot).email || "").trim(),
              role: String((x as PremiumRecipientHandoffSlot).role || "").trim() || "party",
              signerName: String((x as PremiumRecipientHandoffSlot).signerName || "").trim(),
              signerTitle: String((x as PremiumRecipientHandoffSlot).signerTitle || "").trim(),
              partyAddress: String((x as PremiumRecipientHandoffSlot).partyAddress || "").trim(),
            }));
          if (cleaned.length > 0) partyIndexSlots = cleaned;
        }
        const handoff: PremiumRecipientHandoffV2 = {
          v: 2,
          party1: {
            name: String(parsed.party1.name || "").trim(),
            email: String(parsed.party1.email || "").trim(),
            role: String(parsed.party1.role || "").trim(),
            signerName: signerMetadataInputRaw(parsed.party1.signerName),
            signerTitle: signerMetadataInputRaw(parsed.party1.signerTitle),
            partyAddress: String(parsed.party1.partyAddress || "").trim(),
          },
          party2: {
            name: String(parsed.party2.name || "").trim(),
            email: String(parsed.party2.email || "").trim(),
            role: String(parsed.party2.role || "").trim(),
            signerName: signerMetadataInputRaw(parsed.party2.signerName),
            signerTitle: signerMetadataInputRaw(parsed.party2.signerTitle),
            partyAddress: String(parsed.party2.partyAddress || "").trim(),
          },
          savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
          ...(partyIndexSlots ? { partyIndexSlots } : {}),
        };
        logReviewLinkSignerMetadataHandoffRead(handoff);
        return handoff;
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
  patch: Partial<{
    name: string;
    email: string;
    role: string;
    signerName: string;
    signerTitle: string;
    partyAddress: string;
  }>,
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
  const signerName =
    patch.signerName !== undefined
      ? normalizeSignerMetadataForSave(patch.signerName) ?? ""
      : signerMetadataInputRaw(prev.signerName);
  const signerTitle =
    patch.signerTitle !== undefined
      ? normalizeSignerMetadataForSave(patch.signerTitle) ?? ""
      : signerMetadataInputRaw(prev.signerTitle);
  const partyAddress =
    patch.partyAddress !== undefined
      ? String(patch.partyAddress || "").trim()
      : String(prev.partyAddress || "").trim();
  return { name, email, role, signerName, signerTitle, partyAddress };
}

function logReviewLinkSignerMetadataHandoffRead(handoff: PremiumRecipientHandoffV2): void {
  const slots = linearPremiumRecipientSlots(handoff, 2 + (handoff.partyIndexSlots?.length ?? 0));
  const fingerprint = JSON.stringify(
    slots.map((s) => ({
      email: (s.email || "").trim(),
      signerName: signerMetadataInputRaw(s.signerName),
      signerTitle: signerMetadataInputRaw(s.signerTitle),
    })),
  );
  if (fingerprint === lastHandoffReadLogFingerprint) return;
  lastHandoffReadLogFingerprint = fingerprint;
  const withSignerName = slots.filter((s) => signerMetadataInputRaw(s.signerName).length > 0).length;
  const withSignerTitle = slots.filter((s) => signerMetadataInputRaw(s.signerTitle).length > 0).length;
  // eslint-disable-next-line no-console
  console.info("[review-link-signer-metadata-handoff-read]", {
    partySlots: slots.length,
    slotsWithSignerName: withSignerName,
    slotsWithSignerTitle: withSignerTitle,
  });
}

function logReviewLinkSignerMetadataHandoffWrite(payload: PremiumRecipientHandoffV2): void {
  const slots = linearPremiumRecipientSlots(payload, 2 + (payload.partyIndexSlots?.length ?? 0));
  const withSignerName = slots.filter((s) => signerMetadataInputRaw(s.signerName).length > 0).length;
  const withSignerTitle = slots.filter((s) => signerMetadataInputRaw(s.signerTitle).length > 0).length;
  if (!withSignerName && !withSignerTitle) return;
  // eslint-disable-next-line no-console
  console.info("[review-link-signer-metadata-handoff-write]", {
    partySlots: slots.length,
    slotsWithSignerName: withSignerName,
    slotsWithSignerTitle: withSignerTitle,
  });
}

/**
 * Persist names, emails, and roles in one write. Undefined patch fields keep previous values.
 * Emails: blank patch never clears a previously stored non-blank email.
 */
export function persistPremiumRecipientHandoff(patch: {
  party1?: Partial<{
    name: string;
    email: string;
    role: string;
    signerName: string;
    signerTitle: string;
    partyAddress: string;
  }>;
  party2?: Partial<{
    name: string;
    email: string;
    role: string;
    signerName: string;
    signerTitle: string;
    partyAddress: string;
  }>;
  partyIndexSlots?: Array<
    | Partial<{
        name: string;
        email: string;
        role: string;
        signerName: string;
        signerTitle: string;
        partyAddress: string;
      }>
    | null
    | undefined
  >;
}): void {
  const cur = readPremiumRecipientHandoff();
  const base1 = cur?.party1 ?? emptySlot();
  const base2 = cur?.party2 ?? emptySlot();
  const party1 = mergeSlot(base1, patch.party1 ?? {});
  const party2 = mergeSlot(base2, patch.party2 ?? {});
  let partyIndexSlots: PremiumRecipientHandoffSlot[] | undefined = cur?.partyIndexSlots;
  if (patch.partyIndexSlots !== undefined) {
    const prevExtra = cur?.partyIndexSlots ?? [];
    partyIndexSlots = patch.partyIndexSlots.map((p, j) => {
      const base = prevExtra[j] ?? emptySlot();
      return mergeSlot(base, p ?? {});
    });
    if (partyIndexSlots.length === 0) partyIndexSlots = undefined;
  }
  const extraHasSignal = (partyIndexSlots ?? []).some((s) => s.name || s.email || s.partyAddress);
  if (
    !party1.name &&
    !party2.name &&
    !party1.email &&
    !party2.email &&
    !party1.partyAddress &&
    !party2.partyAddress &&
    !extraHasSignal
  ) {
    return;
  }
  try {
    const payload: PremiumRecipientHandoffV2 = {
      v: 2,
      party1,
      party2,
      savedAt: Date.now(),
      ...(partyIndexSlots?.length ? { partyIndexSlots } : {}),
    };
    sessionStorage.setItem(KEY_V2, JSON.stringify(payload));
    sessionStorage.removeItem(LEGACY_KEY);
    invalidatePremiumRecipientHandoffReadCache();
    logReviewLinkSignerMetadataHandoffWrite(payload);
    const slots = linearPremiumRecipientSlots(payload, 2 + (partyIndexSlots?.length ?? 0));
    const withEmail = slots.filter((s) => Boolean(String(s.email || "").trim())).length;
    if (withEmail > 0) {
      // eslint-disable-next-line no-console
      console.info("[review-link-recipient-email-handoff-write]", {
        partySlots: slots.length,
        partySlotsWithEmail: withEmail,
        party1HasEmail: Boolean(String(party1.email || "").trim()),
        party2HasEmail: Boolean(String(party2.email || "").trim()),
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
export function writePremiumRecipientHandoffExact(
  party1: PremiumRecipientHandoffSlot,
  party2: PremiumRecipientHandoffSlot,
  partyIndexSlots?: PremiumRecipientHandoffSlot[],
): void {
  try {
    const extra = (partyIndexSlots ?? []).filter((s) => s && (s.name || s.email));
    const payload: PremiumRecipientHandoffV2 = {
      v: 2,
      party1: {
        name: String(party1.name ?? "").trim(),
        email: String(party1.email ?? "").trim(),
        role: String(party1.role ?? "").trim() || "party",
        signerName: String(party1.signerName ?? "").trim(),
        signerTitle: String(party1.signerTitle ?? "").trim(),
      },
      party2: {
        name: String(party2.name ?? "").trim(),
        email: String(party2.email ?? "").trim(),
        role: String(party2.role ?? "").trim() || "party",
        signerName: String(party2.signerName ?? "").trim(),
        signerTitle: String(party2.signerTitle ?? "").trim(),
      },
      savedAt: Date.now(),
      ...(extra.length > 0 ? { partyIndexSlots: extra } : {}),
    };
    if (
      !payload.party1.name &&
      !payload.party2.name &&
      !payload.party1.email &&
      !payload.party2.email &&
      !extra.length
    )
      return;
    sessionStorage.setItem(KEY_V2, JSON.stringify(payload));
    sessionStorage.removeItem(LEGACY_KEY);
    invalidatePremiumRecipientHandoffReadCache();
    logReviewLinkSignerMetadataHandoffWrite(payload);
    const slots = linearPremiumRecipientSlots(payload, 2 + (extra.length ?? 0));
    const withEmail = slots.filter((s) => Boolean(String(s.email || "").trim())).length;
    if (withEmail > 0) {
      // eslint-disable-next-line no-console
      console.info("[review-link-recipient-email-handoff-write]", {
        partySlots: slots.length,
        partySlotsWithEmail: withEmail,
        party1HasEmail: Boolean(String(payload.party1.email || "").trim()),
        party2HasEmail: Boolean(String(payload.party2.email || "").trim()),
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

/** Cap for multi-party review-link recipient session rows (agreement party order). */
export const MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS = 24;

/** One session slot per agreement party index (0..n-1), capped. */
export function linearPremiumRecipientSlots(
  handoff: PremiumRecipientHandoffV2 | null,
  partyCount: number,
): PremiumRecipientHandoffSlot[] {
  const n = Math.min(Math.max(partyCount, 0), MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS);
  const out: PremiumRecipientHandoffSlot[] = [];
  for (let i = 0; i < n; i++) {
    if (!handoff) {
      out.push(emptySlot());
      continue;
    }
    if (i === 0) out.push({ ...handoff.party1 });
    else if (i === 1) out.push({ ...handoff.party2 });
    else out.push({ ...(handoff.partyIndexSlots?.[i - 2] ?? emptySlot()) });
  }
  return out;
}

/** Persist full ordered party-indexed reviewer rows (`party1`/`party2` + optional `partyIndexSlots`). */
export function writePremiumRecipientHandoffLinear(slots: PremiumRecipientHandoffSlot[]): void {
  const party1 = slots[0] ?? emptySlot();
  const party2 = slots[1] ?? emptySlot();
  const partyIndexSlots = slots.length > 2 ? slots.slice(2, MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS) : undefined;
  writePremiumRecipientHandoffExact(party1, party2, partyIndexSlots);
}

/** Force signer metadata onto session handoff (review-link payload) without dropping legal names/emails. */
export function writePremiumRecipientHandoffSignerMetadata(args: {
  signerNames: readonly string[];
  signerTitles: readonly string[];
  partyLegalNames?: readonly string[];
  partyEmails?: readonly string[];
}): void {
  const cur = readPremiumRecipientHandoff();
  const base1 = cur?.party1 ?? emptySlot();
  const base2 = cur?.party2 ?? emptySlot();
  const legal = args.partyLegalNames ?? [];
  const emails = args.partyEmails ?? [];
  const party1 = mergeSlot(base1, {
    name: legal[0]?.trim() || base1.name,
    email: emails[0]?.trim() || base1.email,
    signerName: args.signerNames[0] ?? "",
    signerTitle: args.signerTitles[0] ?? "",
  });
  const party2 = mergeSlot(base2, {
    name: legal[1]?.trim() || base2.name,
    email: emails[1]?.trim() || base2.email,
    signerName: args.signerNames[1] ?? "",
    signerTitle: args.signerTitles[1] ?? "",
  });
  if (!party1.name && !party2.name && !party1.signerName && !party2.signerName) return;
  writePremiumRecipientHandoffExact(party1, party2, cur?.partyIndexSlots);
}

/** Build `partyIndexSlots` for indices ≥2 from authoritative parties + optional checkout candidates. */
export function buildPartyIndexSlotsFromPartiesAndCandidates(
  parties: readonly {
    name?: string | null;
    role?: string | null;
    email?: string | null;
    signerName?: string | null;
    signerTitle?: string | null;
  }[],
  candidates: readonly { email?: string | null }[],
): PremiumRecipientHandoffSlot[] | undefined {
  const max = Math.min(parties.length, MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS);
  if (max <= 2) return undefined;
  const out: PremiumRecipientHandoffSlot[] = [];
  for (let i = 2; i < max; i++) {
    const p = parties[i]!;
    const em = String(candidates[i]?.email ?? p.email ?? "").trim();
    out.push({
      name: String(p.name || "").trim(),
      email: em,
      role: String(p.role || "party").trim() || "party",
      signerName: signerMetadataInputRaw(p.signerName),
      signerTitle: signerMetadataInputRaw(p.signerTitle),
    });
  }
  return out.length ? out : undefined;
}

/** Build handoff slots from draft parties (indices 0–1 + optional extra). */
export function premiumHandoffSlotFromParty(
  p: {
    name?: string | null;
    role?: string | null;
    email?: string | null;
    signerName?: string | null;
    signerTitle?: string | null;
  },
  nameOverride?: string,
): PremiumRecipientHandoffSlot {
  return {
    name: (nameOverride ?? p.name ?? "").trim(),
    email: String(p.email ?? "").trim(),
    role: String(p.role ?? "party").trim() || "party",
    signerName: signerMetadataInputRaw(p.signerName),
    signerTitle: signerMetadataInputRaw(p.signerTitle),
  };
}
