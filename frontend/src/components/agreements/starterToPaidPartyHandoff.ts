/**
 * Phase 2 — typed Starter→Paid legal-party handoff (no signer, entitlement, or SoT fields).
 */

import { getOrInitSessionAgreementGenerationId, shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import {
  authorityIntakeMatches,
  type LegalPartyAuthorityRecord,
  type LegalPartyAuthorityResult,
  type LegalPartyProvenanceSource,
  type LegalPartyConfidenceLevel,
  type LegalPartyRoleConfidence,
} from "./legalPartyAuthority";
import { readLegalPartyAuthorityFromSession, resolveLegalPartyAuthorityForIntake } from "./legalPartyAuthoritySession";
import {
  writePremiumRecipientHandoffLinear,
  type PremiumRecipientHandoffV2,
  type PremiumRecipientHandoffSlot,
} from "./premiumPartyNamesHandoff";
import { resolveCanonicalPartyRoleLabel } from "./canonicalPartyRoleAuthority";

export type StarterToPaidPartyHandoffPartyV1 = {
  agreementPartyId: string;
  legalEntityName: string;
  agreementRole?: string;
  commercialRoles: string[];
  canonicalOrder: number;
  sourceMentionIndex?: number;
  confidence: {
    entity: LegalPartyConfidenceLevel;
    role: LegalPartyRoleConfidence;
  };
  provenance: {
    extractedFrom: LegalPartyProvenanceSource;
    fallbackReason?: string;
  };
};

export type StarterToPaidPartyHandoffV1 = {
  version: 1;
  agreementSessionId: string;
  intakeFingerprint: string;
  partyCount: number;
  parties: StarterToPaidPartyHandoffPartyV1[];
  writtenAt: number;
};

const STORAGE_KEY_PREFIX = "claw_starter_paid_party_handoff_v1:";

let inMemoryHandoffByGeneration = new Map<string, StarterToPaidPartyHandoffV1>();

function handoffStorageKey(generationId: string): string {
  return `${STORAGE_KEY_PREFIX}${generationId}`;
}

function authorityRecordToHandoffParty(record: LegalPartyAuthorityRecord): StarterToPaidPartyHandoffPartyV1 {
  return {
    agreementPartyId: record.agreementPartyId,
    legalEntityName: record.legalEntityName,
    agreementRole: record.agreementRole,
    commercialRoles: [...record.commercialRoles],
    canonicalOrder: record.canonicalOrder,
    sourceMentionIndex: record.sourceMentionIndex,
    confidence: { ...record.confidence },
    provenance: { ...record.provenance },
  };
}

function buildHandoffFromAuthority(
  authority: LegalPartyAuthorityResult,
  agreementSessionId: string,
): StarterToPaidPartyHandoffV1 {
  const parties = [...authority.parties]
    .sort((a, b) => a.canonicalOrder - b.canonicalOrder)
    .map(authorityRecordToHandoffParty);
  return {
    version: 1,
    agreementSessionId,
    intakeFingerprint: authority.intakeFingerprint,
    partyCount: parties.length,
    parties,
    writtenAt: Date.now(),
  };
}

export function parseStarterToPaidPartyHandoff(raw: string): StarterToPaidPartyHandoffV1 | null {
  try {
    const parsed = JSON.parse(raw) as StarterToPaidPartyHandoffV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.parties)) return null;
    if (!parsed.agreementSessionId || !parsed.intakeFingerprint) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearStarterToPaidPartyHandoffForTests(): void {
  inMemoryHandoffByGeneration = new Map();
  if (typeof sessionStorage === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(STORAGE_KEY_PREFIX)) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function clearStarterToPaidPartyHandoffForCurrentSession(): void {
  const generationId = getOrInitSessionAgreementGenerationId();
  inMemoryHandoffByGeneration.delete(generationId);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(handoffStorageKey(generationId));
  } catch {
    /* ignore */
  }
}

function persistHandoff(handoff: StarterToPaidPartyHandoffV1): void {
  inMemoryHandoffByGeneration.set(handoff.agreementSessionId, handoff);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(handoffStorageKey(handoff.agreementSessionId), JSON.stringify(handoff));
  } catch {
    /* ignore */
  }
}

/**
 * Authoritative writer at upgrade — consumes Phase 1 legal-party authority only.
 * Does not attach signer metadata or reparse intake for party identity.
 */
export function writeStarterToPaidPartyHandoff(
  intakeText: string | null | undefined,
  authority?: LegalPartyAuthorityResult | null,
): StarterToPaidPartyHandoffV1 {
  const intake = String(intakeText ?? "").trim();
  const agreementSessionId = getOrInitSessionAgreementGenerationId();
  const resolvedAuthority =
    authority ?? readLegalPartyAuthorityFromSession(intake) ?? resolveLegalPartyAuthorityForIntake(intake);

  if (!authorityIntakeMatches(resolvedAuthority, intake)) {
    throw new Error("writeStarterToPaidPartyHandoff: authority intake fingerprint mismatch");
  }

  const handoff = buildHandoffFromAuthority(resolvedAuthority, agreementSessionId);
  persistHandoff(handoff);

  const legacySlots = projectPartyHandoffToLegacyPremiumRecipientSlots(handoff);
  if (legacySlots.length >= 2) {
    writePremiumRecipientHandoffLinear(legacySlots, handoff.partyCount);
  }

  if (typeof import.meta !== "undefined" && import.meta.env?.DEV && import.meta.env.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.info("[starter-paid-party-handoff-written]", {
      agreementSessionId,
      version: handoff.version,
      partyCount: handoff.partyCount,
      partyIds: handoff.parties.map((p) => p.agreementPartyId),
      intakeFingerprint: handoff.intakeFingerprint,
    });
  }

  return handoff;
}

export type ReadStarterToPaidPartyHandoffResult = {
  handoff: StarterToPaidPartyHandoffV1 | null;
  staleRejected: boolean;
  legacyFallbackUsed: boolean;
};

export function readStarterToPaidPartyHandoff(
  intakeText?: string | null,
): StarterToPaidPartyHandoffV1 | null {
  return readStarterToPaidPartyHandoffDetailed(intakeText).handoff;
}

export function readStarterToPaidPartyHandoffDetailed(
  intakeText?: string | null,
): ReadStarterToPaidPartyHandoffResult {
  const intake = String(intakeText ?? "").trim();
  if (!intake) {
    return { handoff: null, staleRejected: true, legacyFallbackUsed: true };
  }

  const generationId = getOrInitSessionAgreementGenerationId();
  const mem = inMemoryHandoffByGeneration.get(generationId) ?? null;

  let stored: StarterToPaidPartyHandoffV1 | null = mem;
  if (!stored && typeof sessionStorage !== "undefined") {
    try {
      const raw = sessionStorage.getItem(handoffStorageKey(generationId));
      if (raw) stored = parseStarterToPaidPartyHandoff(raw);
    } catch {
      /* ignore */
    }
  }

  if (!stored) {
    return { handoff: null, staleRejected: false, legacyFallbackUsed: true };
  }

  if (stored.agreementSessionId !== generationId) {
    if (import.meta.env?.DEV && import.meta.env.MODE !== "test") {
      // eslint-disable-next-line no-console
      console.warn("[starter-paid-party-handoff-stale]", {
        reason: "session_id_mismatch",
        expected: generationId,
        found: stored.agreementSessionId,
      });
    }
    return { handoff: null, staleRejected: true, legacyFallbackUsed: true };
  }

  const expectedFingerprint = shortIntakeFingerprint(intake);
  if (stored.intakeFingerprint !== expectedFingerprint) {
    if (import.meta.env?.DEV && import.meta.env.MODE !== "test") {
      // eslint-disable-next-line no-console
      console.warn("[starter-paid-party-handoff-stale]", {
        reason: "intake_fingerprint_mismatch",
        expectedFingerprint,
        handoffFingerprint: stored.intakeFingerprint,
      });
    }
    return { handoff: null, staleRejected: true, legacyFallbackUsed: true };
  }
  const authority = readLegalPartyAuthorityFromSession(intake);
  if (authority && authority.intakeFingerprint !== stored.intakeFingerprint) {
    if (import.meta.env?.DEV && import.meta.env.MODE !== "test") {
      // eslint-disable-next-line no-console
      console.warn("[starter-paid-party-handoff-stale]", {
        reason: "intake_fingerprint_mismatch",
        authorityFingerprint: authority.intakeFingerprint,
        handoffFingerprint: stored.intakeFingerprint,
      });
    }
    return { handoff: null, staleRejected: true, legacyFallbackUsed: true };
  }

  inMemoryHandoffByGeneration.set(generationId, stored);
  return { handoff: stored, staleRejected: false, legacyFallbackUsed: false };
}

/** Compatibility projection — legacy party1/party2 slots are not authoritative for N-party count. */
export function projectPartyHandoffToLegacyPremiumRecipientSlots(
  handoff: StarterToPaidPartyHandoffV1,
): PremiumRecipientHandoffSlot[] {
  return handoff.parties
    .sort((a, b) => a.canonicalOrder - b.canonicalOrder)
    .map((party, index) => ({
      name: party.legalEntityName,
      email: "",
      role: resolveCanonicalPartyRoleLabel({
        partyIndex: index,
        partyCount: handoff.partyCount,
        explicitRole: party.agreementRole,
        preserveIntakeRole: true,
      }),
    }));
}

export function projectPartyHandoffToLegacyPremiumRecipientHandoff(
  handoff: StarterToPaidPartyHandoffV1,
): PremiumRecipientHandoffV2 {
  const slots = projectPartyHandoffToLegacyPremiumRecipientSlots(handoff);
  const party1 = slots[0] ?? { name: "", email: "", role: "Client" };
  const party2 = slots[1] ?? { name: "", email: "", role: "Service Provider" };
  return {
    v: 2,
    party1,
    party2,
    savedAt: Date.now(),
    partyIndexSlots: slots.length > 2 ? slots.slice(2) : undefined,
  };
}

export function readLegalPartyCountFromTypedHandoff(intakeText?: string | null): number {
  const handoff = readStarterToPaidPartyHandoff(intakeText);
  return handoff?.partyCount ?? 0;
}

export function readTypedHandoffPartyNames(intakeText?: string | null): string[] {
  const handoff = readStarterToPaidPartyHandoff(intakeText);
  if (!handoff) return [];
  return handoff.parties
    .sort((a, b) => a.canonicalOrder - b.canonicalOrder)
    .map((p) => p.legalEntityName);
}

export function findTypedHandoffPartyById(
  agreementPartyId: string,
  intakeText?: string | null,
): StarterToPaidPartyHandoffPartyV1 | null {
  const handoff = readStarterToPaidPartyHandoff(intakeText);
  if (!handoff) return null;
  return handoff.parties.find((p) => p.agreementPartyId === agreementPartyId) ?? null;
}
