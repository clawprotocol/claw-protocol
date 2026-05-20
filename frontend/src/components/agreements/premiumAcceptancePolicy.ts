/**
 * Universal premium acceptance policy — long successful HTTP bodies must not be
 * downgraded to short preview fallbacks solely for advisory needs_details or soft gates.
 */

import type { PremiumCompletionOutcome } from "./agreementOutputQuality/types";
import { classifyPremiumCompletionOutcome } from "./agreementOutputQuality/premiumCompletionClassification";
import { extractIntakeContacts, type IntakeContactRecord } from "./paidProIntakeContactSubstitution";
import { resolveFullLegalPartiesFromIntake } from "./paidProPartyNamePreserve";
export type PremiumRecipientCandidate = { name: string; email: string; role: string };

export type PremiumRenderSource =
  | "server_full_draft"
  | "server_full_draft_retry"
  | "server_full_draft_degraded"
  | "fallback_preview"
  | "fallback_preview_error"
  | "snapshot_server_full_draft"
  | "snapshot_fallback"
  | "stale_intake"
  | "rejected_paid_corpus"
  | "premium_network_retryable"
  | "premium_generation_retryable"
  | string;

/** Minimum server body length treated as commercially authoritative. */
export const LONG_PREMIUM_AUTHORITATIVE_MIN_LEN = 15_000;

/** Fallback/stitched previews shorter than this must not replace a long candidate. */
export const SHORT_PREMIUM_FALLBACK_MAX_LEN = 8_000;

export type PremiumAcceptanceDecisionLog = {
  accepted: boolean;
  reason: string;
  bodyLen: number;
  fatalPlaceholderCount: number;
  structuralFatalCount: number;
  generationOutcome: string | null;
  renderSource: string | null;
};

const sessionFrozenPremiumByGenerationId = new Map<
  string,
  { body: string; source: PremiumRenderSource; frozenAt: number }
>();

export function clearFrozenPremiumSessionBodiesForTests(): void {
  sessionFrozenPremiumByGenerationId.clear();
}

export function isLongCommerciallyUsablePremiumBody(bodyLen: number): boolean {
  return bodyLen >= LONG_PREMIUM_AUTHORITATIVE_MIN_LEN;
}

export function shouldSuppressShortFallbackOverLongCandidate(
  candidateLen: number,
  fallbackLen: number,
): boolean {
  return (
    isLongCommerciallyUsablePremiumBody(candidateLen) &&
    fallbackLen > 0 &&
    fallbackLen < SHORT_PREMIUM_FALLBACK_MAX_LEN
  );
}

export function countStructuralFatals(accReasons: readonly string[]): number {
  return (accReasons || []).filter(
    (r) => r.startsWith("placeholder:") || r.startsWith("banned_substring:") || r.startsWith("degraded_filler:"),
  ).length;
}

/**
 * Long HTTP-success bodies with only advisory needs_details (no fatal placeholders) are authoritative.
 */
export function classifyLongPremiumHttpOutcome(args: {
  documentText: string;
  missingMaterial?: readonly string[];
  serverOutcome?: string | null;
  fatalPlaceholderCount?: number;
  validationFailed?: boolean;
  httpOk?: boolean;
}): PremiumCompletionOutcome {
  const len = (args.documentText || "").trim().length;
  const fatals = args.fatalPlaceholderCount ?? 0;
  if (isLongCommerciallyUsablePremiumBody(len) && fatals === 0) {
    const server = (args.serverOutcome || "").trim().toLowerCase();
    if (server === "needs_details" || (args.missingMaterial || []).length > 0) {
      return "authoritative_draft_complete_with_recommended_clarifications";
    }
    return classifyPremiumCompletionOutcome({
      documentText: args.documentText,
      missingMaterial: args.missingMaterial,
      serverOutcome: args.serverOutcome,
      validationFailed: args.validationFailed,
    });
  }
  return classifyPremiumCompletionOutcome({
    documentText: args.documentText,
    missingMaterial: args.missingMaterial,
    serverOutcome: args.serverOutcome,
    validationFailed: args.validationFailed,
  });
}

export function shouldPreserveLongPremiumDespiteSoftGateFailure(args: {
  bodyLen: number;
  fatalPlaceholderCount: number;
  structuralFatalCount: number;
  httpOk?: boolean;
}): boolean {
  if (!isLongCommerciallyUsablePremiumBody(args.bodyLen)) return false;
  if (args.fatalPlaceholderCount > 0 || args.structuralFatalCount > 0) return false;
  if (args.httpOk === false) return false;
  return true;
}

export function freezeAcceptedPremiumBodyForSession(
  generationId: string | null | undefined,
  body: string,
  source: PremiumRenderSource,
): void {
  const id = (generationId || "").trim();
  const t = (body || "").trim();
  if (!id || !isLongCommerciallyUsablePremiumBody(t.length)) return;
  const prev = sessionFrozenPremiumByGenerationId.get(id);
  if (prev && prev.body.length >= t.length) return;
  sessionFrozenPremiumByGenerationId.set(id, { body: t, source, frozenAt: Date.now() });
}

export function getFrozenPremiumBodyForSession(
  generationId: string | null | undefined,
): { body: string; source: PremiumRenderSource } | null {
  const id = (generationId || "").trim();
  if (!id) return null;
  const hit = sessionFrozenPremiumByGenerationId.get(id);
  if (!hit) return null;
  return { body: hit.body, source: hit.source };
}

/** Later responses may validate-only; never replace a frozen long body with a shorter corpus. */
export function resolvePremiumBodyAgainstSessionFreeze(
  generationId: string | null | undefined,
  candidateBody: string,
  candidateSource: PremiumRenderSource,
): { body: string; source: PremiumRenderSource; usedFreeze: boolean } {
  const candidate = (candidateBody || "").trim();
  const frozen = getFrozenPremiumBodyForSession(generationId);
  if (!frozen) {
    if (isLongCommerciallyUsablePremiumBody(candidate.length)) {
      freezeAcceptedPremiumBodyForSession(generationId, candidate, candidateSource);
    }
    return { body: candidate, source: candidateSource, usedFreeze: false };
  }
  if (!candidate || candidate.length < frozen.body.length) {
    return { body: frozen.body, source: frozen.source, usedFreeze: true };
  }
  if (candidate.length > frozen.body.length) {
    freezeAcceptedPremiumBodyForSession(generationId, candidate, candidateSource);
    return { body: candidate, source: candidateSource, usedFreeze: false };
  }
  return { body: frozen.body, source: frozen.source, usedFreeze: true };
}

function normalizePartyToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function matchContactToParty(contact: IntakeContactRecord, partyName: string): boolean {
  const pn = normalizePartyToken(partyName);
  const cn = normalizePartyToken(contact.name || "");
  const company = normalizePartyToken(contact.companyHint || "");
  if (!pn || (!cn && !company)) return false;
  if (cn && (pn.includes(cn) || cn.includes(pn))) return true;
  if (company && pn.includes(company)) return true;
  const pnParts = pn.split(/\s+/).filter((p) => p.length > 2);
  const cnParts = cn.split(/\s+/).filter((p) => p.length > 2);
  if (pnParts.length >= 2 && cnParts.length >= 2) {
    const overlap = pnParts.filter((p) => cnParts.includes(p)).length;
    if (overlap >= 2) return true;
    if (overlap >= 1 && pnParts.length <= 3 && cnParts.length <= 3) return true;
  }
  return false;
}

/** Preserve signer names/titles/emails from intake through premium completion (not VS01-only). */
export function buildPremiumRecipientCandidatesFromIntake(
  partyNames: readonly string[],
  intakeText: string | null | undefined,
  defaultRole = "Party",
): PremiumRecipientCandidate[] {
  const authoritative = resolveFullLegalPartiesFromIntake(partyNames, intakeText);
  const slots =
    authoritative.length >= partyNames.length && partyNames.length > 0
      ? partyNames.map((slot, i) => authoritative[i] || slot)
      : authoritative.length > 0
        ? authoritative
        : [...partyNames];
  const contacts = extractIntakeContacts(intakeText);
  const used = new Set<number>();
  return slots.map((rawName) => {
    const name = String(rawName || "").trim();
    let hitIdx = contacts.findIndex((c, i) => !used.has(i) && matchContactToParty(c, name));
    if (hitIdx < 0 && contacts.length === partyNames.length) {
      const ordinal = partyNames.indexOf(rawName);
      if (ordinal >= 0 && ordinal < contacts.length && !used.has(ordinal)) hitIdx = ordinal;
    }
    if (hitIdx >= 0) used.add(hitIdx);
    const c = hitIdx >= 0 ? contacts[hitIdx] : null;
    return {
      name: name || c?.name || "",
      email: (c?.email || "").trim(),
      role: (c?.title || "").trim() || defaultRole,
    };
  });
}

export function logPremiumAcceptanceDecision(payload: PremiumAcceptanceDecisionLog): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[premium-acceptance-decision]", payload);
}
