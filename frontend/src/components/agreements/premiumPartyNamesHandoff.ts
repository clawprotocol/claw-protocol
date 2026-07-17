/**
 * Session handoff for premium recipient flow: names, emails, and roles survive
 * Continue / checkout / modal remounts. Merge rules never replace a valid email with blank.
 */

import {
  normalizeSignerMetadataForSave,
  signerMetadataInputRaw,
} from "../../agreement/signerMetadataNormalize";

import {
  clearCanonicalPartyMetadata,
} from "./canonicalPartyMetadataAuthority";
import { invalidatePremiumRecipientHandoffReadCache } from "./premiumRecipientHandoffReadCache";
import {
  applyPremiumRecipientHandoffReadGate,
  resetPaidProPremiumRecipientHandoffReadGateForTests,
} from "./paidProPremiumRecipientHandoffReadGate";
import { readFrozenCanonicalManifestPartyCount } from "./frozenCanonicalManifestAuthority";
import {
  readSignerMetadataEffectiveMax,
  latchSignerMetadataEffectiveMax,
  countSignerMetadataSlots,
} from "./signerMetadataEffective";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { readConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import {
  canonicalBundleToAuthorityParties,
  readCanonicalPartyMetadata,
} from "./canonicalPartyMetadataAuthority";
import {
  isLikelyHumanSignerName,
  looksLikeConcatenatedSignerNames,
  resolveAuthorityPartyLegalNameField,
} from "./intakeSignerMetadataAuthority";
import { sanitizeAuthorityPartyLegalName } from "./signerSetupPartyIdentity";
import {
  hasCurrentSessionFreeStarterIntent,
  hasCurrentSessionProEntitlement,
} from "./paidProSessionEligibility";

const LEGACY_KEY = "claw_premium_party_names_handoff_v1";
const KEY_V2 = "claw_premium_recipient_handoff_v2";

let lastHandoffReadLogFingerprint = "";
let lastHandoffWriteLogFingerprint = "";
let lastPersistedHandoffFingerprint = "";

function premiumRecipientHandoffFingerprint(payload: PremiumRecipientHandoffV2): string {
  return JSON.stringify({
    party1: payload.party1,
    party2: payload.party2,
    partyIndexSlots: payload.partyIndexSlots ?? null,
  });
}

/** Test-only */
export function resetPremiumRecipientHandoffDedupForTests(): void {
  lastHandoffReadLogFingerprint = "";
  lastHandoffWriteLogFingerprint = "";
  lastPersistedHandoffFingerprint = "";
  clearCanonicalPartyMetadata();
  resetPaidProPremiumRecipientHandoffReadGateForTests();
}

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

/** Never persist signer names or scope phrases into handoff legal-entity `name` fields. */
function sanitizeHandoffSlotEntityName(
  slot: PremiumRecipientHandoffSlot,
): PremiumRecipientHandoffSlot {
  const signerName = signerMetadataInputRaw(slot.signerName);
  const rawName = String(slot.name ?? "").trim();
  let name = resolveAuthorityPartyLegalNameField(rawName, "");
  if (!name && rawName && isAuthoritativeLegalEntityName(rawName)) {
    name = rawName.trim();
  }
  if (!name && rawName && signerName && rawName.toLowerCase() === signerName.toLowerCase()) {
    name = "";
  }
  if (
    rawName &&
    !name &&
  (isLikelyHumanSignerName(rawName) || looksLikeConcatenatedSignerNames(rawName))
  ) {
    name = "";
  }
  return { ...slot, name };
}

function sanitizeHandoffSlots(slots: PremiumRecipientHandoffSlot[]): PremiumRecipientHandoffSlot[] {
  return slots.map(sanitizeHandoffSlotEntityName);
}

function stripStalePremiumHandoffExtraSlots(
  handoff: PremiumRecipientHandoffV2,
): PremiumRecipientHandoffV2 {
  if (!handoff.partyIndexSlots?.length) return handoff;
  if (hasCurrentSessionProEntitlement()) return handoff;
  if (!hasCurrentSessionFreeStarterIntent()) return handoff;
  return { ...handoff, partyIndexSlots: undefined };
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
        const stripped = stripStalePremiumHandoffExtraSlots(handoff);
        const gated = applyPremiumRecipientHandoffReadGate(stripped, {
          partySlotCount: resolveHandoffAuthorityPartyCount({
            partySlotCount: resolveHandoffPartySlotCount(stripped),
          }),
        });
        if (gated) logReviewLinkSignerMetadataHandoffRead(gated);
        return gated;
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
  opts?: {
    preserveSignerFieldsOnEmptyPatch?: boolean;
    allowEmptyEmailClear?: boolean;
  },
): PremiumRecipientHandoffSlot {
  const name = patch.name !== undefined ? String(patch.name || "").trim() || prev.name : prev.name;
  const email =
    patch.email !== undefined
      ? opts?.allowEmptyEmailClear
        ? String(patch.email || "").trim()
        : String(patch.email || "").trim() || String(prev.email || "").trim()
      : String(prev.email || "").trim();
  const role =
    patch.role !== undefined
      ? String(patch.role || "").trim() || prev.role || "party"
      : prev.role || "party";
  const preserveSigner = opts?.preserveSignerFieldsOnEmptyPatch ?? hasPaidProSourceOfTruth();
  const patchSignerName =
    patch.signerName !== undefined ? normalizeSignerMetadataForSave(patch.signerName) ?? "" : null;
  const signerName =
    patchSignerName !== null
      ? preserveSigner && !patchSignerName
        ? signerMetadataInputRaw(prev.signerName)
        : patchSignerName
      : signerMetadataInputRaw(prev.signerName);
  const patchSignerTitle =
    patch.signerTitle !== undefined ? normalizeSignerMetadataForSave(patch.signerTitle) ?? "" : null;
  const signerTitle =
    patchSignerTitle !== null
      ? preserveSigner && !patchSignerTitle
        ? signerMetadataInputRaw(prev.signerTitle)
        : patchSignerTitle
      : signerMetadataInputRaw(prev.signerTitle);
  const partyAddress =
    patch.partyAddress !== undefined
      ? String(patch.partyAddress || "").trim()
      : String(prev.partyAddress || "").trim();
  return { name, email, role, signerName, signerTitle, partyAddress };
}

export function resolveHandoffPartySlotCount(
  handoff: PremiumRecipientHandoffV2,
  authoritativeCount?: number,
): number {
  const indexed = 2 + (handoff.partyIndexSlots?.length ?? 0);
  if (authoritativeCount != null && authoritativeCount >= 2) {
    return authoritativeCount;
  }
  return Math.max(2, indexed);
}

/** Trim stored handoff to authoritative party count — prevents phantom extra slots. */
export function trimPremiumRecipientHandoffToPartyCount(
  handoff: PremiumRecipientHandoffV2,
  partyCount: number,
): PremiumRecipientHandoffV2 {
  const n = Math.min(Math.max(partyCount, 2), MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS);
  const slots = linearPremiumRecipientSlots(handoff, n);
  const party1 = slots[0] ?? emptySlot();
  const party2 = slots[1] ?? emptySlot();
  const partyIndexSlots = n > 2 ? slots.slice(2, n) : undefined;
  return {
    v: 2,
    party1,
    party2,
    savedAt: handoff.savedAt,
    ...(partyIndexSlots?.length ? { partyIndexSlots } : {}),
  };
}

function authoritativeHandoffPartyCap(explicitAuthoritativeCount?: number): number | undefined {
  if (explicitAuthoritativeCount != null && explicitAuthoritativeCount >= 2) {
    return Math.min(explicitAuthoritativeCount, MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS);
  }
  const caps: number[] = [];
  if (hasPaidProSourceOfTruth()) {
    const frozen = readFrozenCanonicalManifestPartyCount();
    if (frozen >= 2) caps.push(frozen);
  }
  const consumed = readConsumedPaidProSignerMetadataAuthority()?.parties;
  if (!consumed?.length) {
    /* continue */
  } else {
    const authoritativeRows = consumed.filter((p) => {
      const legal = sanitizeAuthorityPartyLegalName(p.partyLegalName);
      return legal.length >= 2 && isAuthoritativeLegalEntityName(legal);
    }).length;
    if (authoritativeRows >= 2) {
      caps.push(Math.min(authoritativeRows, MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS));
    }
  }
  if (explicitAuthoritativeCount == null) {
    const monotonic = readSignerMetadataEffectiveMax().partySlots;
    if (monotonic >= 2) {
      caps.push(Math.min(monotonic, MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS));
    }
  }
  if (caps.length === 0) return undefined;
  return Math.min(...caps);
}

/** Canonical party count for handoff read/write — never inflated by phantom draft or consumed rows. */
export function resolveHandoffAuthorityPartyCount(opts?: {
  partySlotCount?: number;
}): number {
  const requested = Math.max(opts?.partySlotCount ?? 0, 2);
  if (hasCurrentSessionFreeStarterIntent() && !hasCurrentSessionProEntitlement()) {
    return Math.min(requested, 2);
  }
  const cap = authoritativeHandoffPartyCap();
  if (cap != null && cap >= 2) return Math.min(requested, cap);
  return requested;
}

function logReviewLinkSignerMetadataHandoffRead(handoff: PremiumRecipientHandoffV2): void {
  const cap = authoritativeHandoffPartyCap();
  const slots = linearPremiumRecipientSlots(handoff, resolveHandoffPartySlotCount(handoff, cap));
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
  const cap = authoritativeHandoffPartyCap();
  const slots = linearPremiumRecipientSlots(payload, resolveHandoffPartySlotCount(payload, cap));
  const withSignerName = slots.filter((s) => signerMetadataInputRaw(s.signerName).length > 0).length;
  const withSignerTitle = slots.filter((s) => signerMetadataInputRaw(s.signerTitle).length > 0).length;
  if (!withSignerName && !withSignerTitle) return;
  const fingerprint = premiumRecipientHandoffFingerprint(payload);
  if (fingerprint === lastHandoffWriteLogFingerprint) return;
  lastHandoffWriteLogFingerprint = fingerprint;
  // eslint-disable-next-line no-console
  console.info("[review-link-signer-metadata-handoff-write]", {
    partySlots: slots.length,
    slotsWithSignerName: withSignerName,
    slotsWithSignerTitle: withSignerTitle,
  });
}

/** Post-freeze direct write — bypasses writeExact trim/cap that can drop intake manifest slots. */
function writePremiumRecipientHandoffDirectLinear(
  slots: PremiumRecipientHandoffSlot[],
  partyCount: number,
): void {
  const n = Math.min(Math.max(partyCount, 2), MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS);
  const trimmed = slots.slice(0, n);
  const payload: PremiumRecipientHandoffV2 = {
    v: 2,
    party1: trimmed[0] ?? emptySlot(),
    party2: trimmed[1] ?? emptySlot(),
    savedAt: Date.now(),
    ...(n > 2 ? { partyIndexSlots: trimmed.slice(2, n) } : {}),
  };
  sessionStorage.setItem(KEY_V2, JSON.stringify(payload));
  sessionStorage.removeItem(LEGACY_KEY);
  invalidatePremiumRecipientHandoffReadCache();
  logReviewLinkSignerMetadataHandoffWrite(payload);
  latchSignerMetadataEffectiveMax(countSignerMetadataSlots(payload, n));
}

/** Persist full ordered party-indexed handoff from consumed signer metadata authority. */
export function writePremiumRecipientHandoffFromAuthorityParties(
  parties: readonly {
    partyLegalName: string;
    signerEmail: string;
    signerName: string;
    signerTitle: string;
    partyAddress: string;
  }[],
): void {
  if (parties.length < 2) return;
  const cur = readPremiumRecipientHandoff();
  const curSlots = linearPremiumRecipientSlots(cur, Math.max(parties.length, 2));
  const slots: PremiumRecipientHandoffSlot[] = parties.map((party, i) =>
    mergeSlot(curSlots[i] ?? emptySlot(), {
      name: String(party.partyLegalName ?? "").trim(),
      email: String(party.signerEmail ?? "").trim(),
      role: "party",
      signerName: signerMetadataInputRaw(party.signerName),
      signerTitle: signerMetadataInputRaw(party.signerTitle),
      partyAddress: String(party.partyAddress ?? "").trim(),
    }, { preserveSignerFieldsOnEmptyPatch: true }),
  );
  if (hasPaidProSourceOfTruth()) {
    writePremiumRecipientHandoffDirectLinear(slots, parties.length);
    return;
  }
  writePremiumRecipientHandoffLinear(slots, parties.length);
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
    const cap = authoritativeHandoffPartyCap();
    const trimmedPayload =
      cap != null && cap >= 2
        ? trimPremiumRecipientHandoffToPartyCount(payload, cap)
        : payload;
    const slotCount = resolveHandoffPartySlotCount(trimmedPayload, cap);
    const mergedPayload = mergeHandoffPayloadFromConsumedSignerAuthority(trimmedPayload, slotCount);
    if (wouldHandoffWriteDowngradeSignerMetadata(mergedPayload, slotCount)) {
      return;
    }
    const fingerprint = premiumRecipientHandoffFingerprint(mergedPayload);
    if (fingerprint === lastPersistedHandoffFingerprint) {
      return;
    }
    lastPersistedHandoffFingerprint = fingerprint;
    sessionStorage.setItem(KEY_V2, JSON.stringify(mergedPayload));
    sessionStorage.removeItem(LEGACY_KEY);
    invalidatePremiumRecipientHandoffReadCache();
    logReviewLinkSignerMetadataHandoffWrite(mergedPayload);
    const slots = linearPremiumRecipientSlots(mergedPayload, slotCount);
    latchSignerMetadataEffectiveMax(countSignerMetadataSlots(mergedPayload, slots.length));
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

function resolveAuthorityPartiesForHandoffMerge(): NonNullable<
  ReturnType<typeof readConsumedPaidProSignerMetadataAuthority>
>["parties"] | null {
  const consumed = readConsumedPaidProSignerMetadataAuthority();
  if (consumed?.parties?.some((p) => p.signerName.trim() || p.signerEmail.trim())) {
    return consumed.parties;
  }
  const canonical = readCanonicalPartyMetadata();
  if (canonical?.parties?.some((p) => p.signerName.trim() || p.signerEmail.trim())) {
    return canonicalBundleToAuthorityParties(canonical);
  }
  return consumed?.parties ?? null;
}

function mergeHandoffPayloadFromConsumedSignerAuthority(
  payload: PremiumRecipientHandoffV2,
  partySlotCount: number,
): PremiumRecipientHandoffV2 {
  const authorityParties = resolveAuthorityPartiesForHandoffMerge();
  if (!authorityParties?.length) return payload;
  const slots = linearPremiumRecipientSlots(payload, partySlotCount);
  const mergedSlots = Array.from({ length: partySlotCount }, (_, i) => {
    const slot = slots[i] ?? emptySlot();
    const auth = authorityParties[i];
    if (!auth) return slot;
    return mergeSlot(
      slot,
      {
        name: slot.name || auth.partyLegalName,
        email: slot.email || auth.signerEmail,
        signerName: slot.signerName || auth.signerName,
        signerTitle: slot.signerTitle || auth.signerTitle,
        partyAddress: slot.partyAddress || auth.partyAddress,
      },
      { preserveSignerFieldsOnEmptyPatch: true },
    );
  });
  const party1 = mergedSlots[0] ?? payload.party1;
  const party2 = mergedSlots[1] ?? payload.party2;
  const partyIndexSlots = partySlotCount > 2 ? mergedSlots.slice(2, partySlotCount) : undefined;
  return {
    v: 2,
    party1,
    party2,
    savedAt: payload.savedAt,
    ...(partyIndexSlots?.length ? { partyIndexSlots } : {}),
  };
}

function canonicalSignerMetadataFloor(): ReturnType<typeof readSignerMetadataEffectiveMax> {
  const max = readSignerMetadataEffectiveMax();
  const canonical = readCanonicalPartyMetadata();
  if (!canonical?.parties?.length) return max;
  const canonicalHandoff: PremiumRecipientHandoffV2 = {
    v: 2,
    party1: {
      name: canonical.parties[0]?.partyLegalName ?? "",
      email: canonical.parties[0]?.signerEmail ?? "",
      role: "party",
      signerName: canonical.parties[0]?.signerName ?? "",
      signerTitle: canonical.parties[0]?.signerTitle ?? "",
      partyAddress: canonical.parties[0]?.partyAddress ?? "",
    },
    party2: {
      name: canonical.parties[1]?.partyLegalName ?? "",
      email: canonical.parties[1]?.signerEmail ?? "",
      role: "party",
      signerName: canonical.parties[1]?.signerName ?? "",
      signerTitle: canonical.parties[1]?.signerTitle ?? "",
      partyAddress: canonical.parties[1]?.partyAddress ?? "",
    },
    savedAt: Date.now(),
    ...(canonical.parties.length > 2
      ? {
          partyIndexSlots: canonical.parties.slice(2).map((p) => ({
            name: p.partyLegalName,
            email: p.signerEmail,
            role: "party",
            signerName: p.signerName,
            signerTitle: p.signerTitle,
            partyAddress: p.partyAddress,
          })),
        }
      : {}),
  };
  const canonicalCounts = countSignerMetadataSlots(canonicalHandoff, canonical.parties.length);
  return {
    partySlots: Math.max(max.partySlots, canonicalCounts.partySlots),
    slotsWithSignerName: Math.max(max.slotsWithSignerName, canonicalCounts.slotsWithSignerName),
    slotsWithSignerTitle: Math.max(max.slotsWithSignerTitle, canonicalCounts.slotsWithSignerTitle),
    slotsWithSignerEmail: Math.max(max.slotsWithSignerEmail, canonicalCounts.slotsWithSignerEmail),
  };
}

function wouldHandoffWriteDowngradeSignerMetadata(
  payload: PremiumRecipientHandoffV2,
  partySlotCount: number,
  opts?: { allowExplicitEmailClear?: boolean },
): boolean {
  const max = canonicalSignerMetadataFloor();
  if (max.slotsWithSignerName < 1) return false;
  const newCounts = countSignerMetadataSlots(payload, partySlotCount);
  if (newCounts.partySlots > max.partySlots) return false;
  if (newCounts.slotsWithSignerName < max.slotsWithSignerName) return true;
  if (max.slotsWithSignerTitle >= 1 && newCounts.slotsWithSignerTitle < max.slotsWithSignerTitle) {
    return true;
  }
  if (
    !opts?.allowExplicitEmailClear &&
    max.slotsWithSignerEmail >= 1 &&
    newCounts.slotsWithSignerEmail < max.slotsWithSignerEmail
  ) {
    return true;
  }
  return false;
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
  authoritativePartyCount?: number,
): void {
  try {
    const cur = readPremiumRecipientHandoff();
    const curSlots = linearPremiumRecipientSlots(cur, Math.max(2 + (partyIndexSlots?.length ?? 0), 2));
    const exactMergeOptions = {
      preserveSignerFieldsOnEmptyPatch: true,
      allowEmptyEmailClear: true,
    };
    const mergedParty1 = mergeSlot(curSlots[0] ?? emptySlot(), party1, exactMergeOptions);
    const mergedParty2 = mergeSlot(curSlots[1] ?? emptySlot(), party2, exactMergeOptions);
    const extra = partyIndexSlots ?? [];
    const mergedExtra = extra.map((s, i) =>
      mergeSlot(curSlots[i + 2] ?? emptySlot(), s, exactMergeOptions),
    );
    const mapExtraSlot = (s: PremiumRecipientHandoffSlot): PremiumRecipientHandoffSlot => ({
      name: String(s.name ?? "").trim(),
      email: String(s.email ?? "").trim(),
      role: String(s.role ?? "").trim() || "party",
      signerName: String(s.signerName ?? "").trim(),
      signerTitle: String(s.signerTitle ?? "").trim(),
      partyAddress: String(s.partyAddress ?? "").trim(),
    });
    const payload: PremiumRecipientHandoffV2 = {
      v: 2,
      party1: {
        name: String(mergedParty1.name ?? "").trim(),
        email: String(mergedParty1.email ?? "").trim(),
        role: String(mergedParty1.role ?? "").trim() || "party",
        signerName: String(mergedParty1.signerName ?? "").trim(),
        signerTitle: String(mergedParty1.signerTitle ?? "").trim(),
        partyAddress: String(mergedParty1.partyAddress ?? "").trim(),
      },
      party2: {
        name: String(mergedParty2.name ?? "").trim(),
        email: String(mergedParty2.email ?? "").trim(),
        role: String(mergedParty2.role ?? "").trim() || "party",
        signerName: String(mergedParty2.signerName ?? "").trim(),
        signerTitle: String(mergedParty2.signerTitle ?? "").trim(),
        partyAddress: String(mergedParty2.partyAddress ?? "").trim(),
      },
      savedAt: Date.now(),
      ...(mergedExtra.length > 0 ? { partyIndexSlots: mergedExtra.map(mapExtraSlot) } : {}),
    };
    if (
      !payload.party1.name &&
      !payload.party2.name &&
      !payload.party1.email &&
      !payload.party2.email &&
      !extra.length
    )
      return;
    const exactPartyCount = 2 + mergedExtra.length;
    const cap = authoritativeHandoffPartyCap(authoritativePartyCount ?? exactPartyCount);
    const trimmedPayload =
      cap != null && cap >= 2
        ? trimPremiumRecipientHandoffToPartyCount(payload, cap)
        : authoritativePartyCount != null && authoritativePartyCount >= 2
          ? trimPremiumRecipientHandoffToPartyCount(payload, authoritativePartyCount)
          : payload;
    const slotCount = resolveHandoffPartySlotCount(
      trimmedPayload,
      authoritativePartyCount ?? cap,
    );
    const authorityMergedPayload = mergeHandoffPayloadFromConsumedSignerAuthority(trimmedPayload, slotCount);
    const authorityMergedSlots = linearPremiumRecipientSlots(authorityMergedPayload, slotCount);
    const exactInputSlots = [party1, party2, ...(partyIndexSlots ?? [])];
    const exactSlots = authorityMergedSlots.map((slot, index) =>
      exactInputSlots[index]?.email !== undefined
        ? { ...slot, email: String(exactInputSlots[index].email ?? "").trim() }
        : slot,
    );
    const mergedPayload: PremiumRecipientHandoffV2 = {
      ...authorityMergedPayload,
      party1: exactSlots[0] ?? authorityMergedPayload.party1,
      party2: exactSlots[1] ?? authorityMergedPayload.party2,
      ...(slotCount > 2 ? { partyIndexSlots: exactSlots.slice(2, slotCount) } : {}),
    };
    if (
      wouldHandoffWriteDowngradeSignerMetadata(mergedPayload, slotCount, {
        allowExplicitEmailClear: true,
      })
    ) {
      if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[review-link-signer-metadata-handoff-write-blocked]", {
          reason: "monotonic_signer_metadata_downgrade",
          partySlots: slotCount,
          priorSlotsWithSignerName: readSignerMetadataEffectiveMax().slotsWithSignerName,
          attemptedSlotsWithSignerName: countSignerMetadataSlots(mergedPayload, slotCount).slotsWithSignerName,
        });
      }
      return;
    }
    sessionStorage.setItem(KEY_V2, JSON.stringify(mergedPayload));
    sessionStorage.removeItem(LEGACY_KEY);
    invalidatePremiumRecipientHandoffReadCache();
    logReviewLinkSignerMetadataHandoffWrite(mergedPayload);
    const slots = linearPremiumRecipientSlots(mergedPayload, slotCount);
    const counts = countSignerMetadataSlots(mergedPayload, slots.length);
    if (authoritativePartyCount != null && authoritativePartyCount >= 2) {
      counts.partySlots = Math.min(counts.partySlots, authoritativePartyCount);
    }
    latchSignerMetadataEffectiveMax(counts);
    const withEmail = slots.filter((s) => Boolean(String(s.email || "").trim())).length;
    if (withEmail > 0) {
      // eslint-disable-next-line no-console
      console.info("[review-link-recipient-email-handoff-write]", {
        partySlots: slots.length,
        partySlotsWithEmail: withEmail,
        party1HasEmail: Boolean(String(mergedPayload.party1.email || "").trim()),
        party2HasEmail: Boolean(String(mergedPayload.party2.email || "").trim()),
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

/** Party identity only — for handoff read gate (signer fields excluded). */
export function premiumRecipientHandoffPartyFingerprint(payload: PremiumRecipientHandoffV2): string {
  const slots = linearPremiumRecipientSlots(payload, 2 + (payload.partyIndexSlots?.length ?? 0));
  return JSON.stringify(slots.map((s) => ({ name: s.name, email: s.email, role: s.role })));
}

/** Persist full ordered party-indexed reviewer rows (`party1`/`party2` + optional `partyIndexSlots`). */
export function writePremiumRecipientHandoffLinear(
  slots: PremiumRecipientHandoffSlot[],
  authoritativePartyCount?: number,
): void {
  const cap =
    authoritativePartyCount != null && authoritativePartyCount >= 2
      ? authoritativePartyCount
      : authoritativeHandoffPartyCap();
  const sanitized = sanitizeHandoffSlots(slots);
  const trimmed =
    cap != null && cap >= 2 ? sanitized.slice(0, Math.min(sanitized.length, cap)) : sanitized;
  const party1 = trimmed[0] ?? emptySlot();
  const party2 = trimmed[1] ?? emptySlot();
  const partyIndexSlots =
    trimmed.length > 2 ? trimmed.slice(2, MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS) : undefined;
  writePremiumRecipientHandoffExact(party1, party2, partyIndexSlots, cap ?? authoritativePartyCount);
}

/** Force signer metadata onto session handoff (review-link payload) without dropping legal names/emails. */
export function writePremiumRecipientHandoffSignerMetadata(args: {
  signerNames: readonly string[];
  signerTitles: readonly string[];
  partyLegalNames?: readonly string[];
  partyEmails?: readonly string[];
  partyAddresses?: readonly string[];
  authoritativePartyCount?: number;
}): void {
  const cur = readPremiumRecipientHandoff();
  const base1 = cur?.party1 ?? emptySlot();
  const base2 = cur?.party2 ?? emptySlot();
  const legal = args.partyLegalNames ?? [];
  const emails = args.partyEmails ?? [];
  const addresses = args.partyAddresses ?? [];
  const count = Math.max(
    args.authoritativePartyCount ?? 0,
    args.signerNames.length,
    legal.length,
    emails.length,
    addresses.length,
    2,
  );
  const party1 = mergeSlot(base1, {
    name: legal[0]?.trim() || base1.name,
    email: emails[0]?.trim() || base1.email,
    signerName: args.signerNames[0] ?? "",
    signerTitle: args.signerTitles[0] ?? "",
    partyAddress: addresses[0]?.trim() || base1.partyAddress,
  });
  const party2 = mergeSlot(base2, {
    name: legal[1]?.trim() || base2.name,
    email: emails[1]?.trim() || base2.email,
    signerName: args.signerNames[1] ?? "",
    signerTitle: args.signerTitles[1] ?? "",
    partyAddress: addresses[1]?.trim() || base2.partyAddress,
  });
  const extraSlots: PremiumRecipientHandoffSlot[] = [];
  for (let i = 2; i < count; i++) {
    const base = cur?.partyIndexSlots?.[i - 2] ?? emptySlot();
    extraSlots.push(
      mergeSlot(base, {
        name: legal[i]?.trim() || base.name,
        email: emails[i]?.trim() || base.email,
        signerName: args.signerNames[i] ?? "",
        signerTitle: args.signerTitles[i] ?? "",
        partyAddress: addresses[i]?.trim() || base.partyAddress,
      }),
    );
  }
  if (
    !party1.name &&
    !party2.name &&
    !party1.signerName &&
    !party2.signerName &&
    !extraSlots.length
  ) {
    return;
  }
  writePremiumRecipientHandoffExact(party1, party2, extraSlots.length ? extraSlots : undefined);
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
