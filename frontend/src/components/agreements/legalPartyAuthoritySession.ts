/**
 * Session-scoped legal-party authority — keyed by agreement generation id + intake fingerprint.
 * Not a global singleton: each generation id holds at most one authority snapshot.
 */

import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  authorityIntakeMatches,
  establishLegalPartyAuthorityFromIntake,
  legalPartyAuthoritySessionKey,
  parseLegalPartyAuthoritySnapshot,
  type LegalPartyAuthorityResult,
} from "./legalPartyAuthority";

let inMemoryAuthorityByGeneration = new Map<string, LegalPartyAuthorityResult>();

export function clearLegalPartyAuthoritySessionForTests(): void {
  inMemoryAuthorityByGeneration = new Map();
  if (typeof sessionStorage === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith("claw_legal_party_authority_v1:")) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function clearLegalPartyAuthorityForCurrentSession(): void {
  const generationId = getOrInitSessionAgreementGenerationId();
  inMemoryAuthorityByGeneration.delete(generationId);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(legalPartyAuthoritySessionKey(generationId));
  } catch {
    /* ignore */
  }
}

export function writeLegalPartyAuthorityToSession(result: LegalPartyAuthorityResult): void {
  const generationId = getOrInitSessionAgreementGenerationId();
  inMemoryAuthorityByGeneration.set(generationId, result);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      legalPartyAuthoritySessionKey(generationId),
      JSON.stringify({
        v: 1,
        intakeFingerprint: result.intakeFingerprint,
        establishedAt: result.establishedAt,
        fallbackCount: result.fallbackCount,
        parties: result.parties,
      }),
    );
  } catch {
    /* ignore */
  }
}

export function readLegalPartyAuthorityFromSession(
  intakeText?: string | null,
): LegalPartyAuthorityResult | null {
  const generationId = getOrInitSessionAgreementGenerationId();
  const mem = inMemoryAuthorityByGeneration.get(generationId);
  if (mem && (!intakeText || authorityIntakeMatches(mem, intakeText))) return mem;

  if (typeof sessionStorage === "undefined") return mem ?? null;
  try {
    const raw = sessionStorage.getItem(legalPartyAuthoritySessionKey(generationId));
    if (!raw) return mem ?? null;
    const parsed = parseLegalPartyAuthoritySnapshot(raw);
    if (!parsed) return mem ?? null;
    if (intakeText && !authorityIntakeMatches(parsed, intakeText)) return null;
    inMemoryAuthorityByGeneration.set(generationId, parsed);
    return parsed;
  } catch {
    return mem ?? null;
  }
}

/**
 * Establish (or reuse matching) legal-party authority for the current agreement session.
 */
export function resolveLegalPartyAuthorityForIntake(
  intakeText: string | null | undefined,
): LegalPartyAuthorityResult {
  const intake = String(intakeText ?? "").trim();
  const cached = readLegalPartyAuthorityFromSession(intake);
  if (cached) return cached;
  const established = establishLegalPartyAuthorityFromIntake(intake);
  writeLegalPartyAuthorityToSession(established);
  return established;
}
