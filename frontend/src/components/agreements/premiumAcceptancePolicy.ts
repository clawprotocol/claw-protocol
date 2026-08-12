/**
 * Universal premium acceptance policy — long successful HTTP bodies must not be
 * downgraded to short preview fallbacks solely for advisory needs_details or soft gates.
 */

import type { PremiumCompletionOutcome } from "./agreementOutputQuality/types";
import { classifyPremiumCompletionOutcome } from "./agreementOutputQuality/premiumCompletionClassification";
import { extractIntakeContacts, type IntakeContactRecord } from "./paidProIntakeContactSubstitution";
import { resolveFullLegalPartiesFromIntake } from "./paidProPartyNamePreserve";
import { assessConciseCommercialServicesProQuality } from "./paidProConciseServicesQuality";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import { guardPaidProAuthoritativeWrite } from "./paidProAuthoritativeWriteGuard";
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

/** Short deterministic recovery must not replace a substantive server_full_draft above this length. */
export const SUBSTANTIVE_SERVER_DRAFT_MIN_LEN = 10_000;

/** Fallback/stitched previews shorter than this must not replace a long candidate. */
export const SHORT_PREMIUM_FALLBACK_MAX_LEN = 8_000;

/**
 * Server `generation_outcome: degraded` failure codes that only degrade intelligence/metadata
 * (key terms, missing-material hints, structured JSON), NOT the full agreement body. A long,
 * non-placeholder, section-complete HTTP-200 body must remain authoritative even when these fire —
 * rejecting it solely for a JSON/schema parse error strands the paid user on "Retry Pro draft".
 */
export const NONFATAL_GENERATION_FAILURE_CODES: ReadonlySet<string> = new Set([
  "json_parse",
  "json_decode",
  "schema_parse",
  "schema_validation",
  "metadata_parse",
  "intelligence_parse",
]);

export function isNonfatalGenerationFailureCode(code: string | null | undefined): boolean {
  return NONFATAL_GENERATION_FAILURE_CODES.has((code || "").trim().toLowerCase());
}

/**
 * Minimum body length a parse-degraded paid body must clear (in addition to placeholder/section
 * checks) to remain authoritative. Well below {@link LONG_PREMIUM_AUTHORITATIVE_MIN_LEN}: a complete
 * commercial services agreement is routinely 4k–12k chars, far longer than any stitched fallback.
 */
export const PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN = 4_000;

/**
 * A server `server_full_document_text` at/above this length (after a successful HTTP 200) is the
 * authoritative paid corpus and MUST win over client structural soft gates. Client heuristics
 * (similarity, anchor, length-shape) may not reject a validated full server document — doing so
 * strands the paid user on "Retry Pro draft" and lets a short fallback masquerade as the SoT.
 */
export const SERVER_FULL_DOCUMENT_AUTHORITATIVE_MIN_LEN = 10_000;

export function serverFullDocumentWinsOverClientGates(args: {
  serverFullDocumentLen: number;
  httpOk: boolean;
  /** Hard failures (airlock / dev-context leak) still block; only soft structural gates are bypassed. */
  hardStructuralFailure: boolean;
}): boolean {
  if (!args.httpOk) return false;
  if (args.hardStructuralFailure) return false;
  return args.serverFullDocumentLen >= SERVER_FULL_DOCUMENT_AUTHORITATIVE_MIN_LEN;
}

/**
 * Degraded nonfatal parse (e.g. json_parse) with no substantive body on the wire cannot establish
 * paid Pro SoT as `server_full_draft`. A long `document_text` (or other alias) counts as substantive
 * even when `server_full_document_text` is absent — json_parse often degrades metadata only.
 */
export function isDegradedJsonParseWithoutSubstantiveServerFull(args: {
  generationOutcome?: string | null;
  failureCode?: string | null | undefined;
  wireServerFullDocumentText?: string | null;
  wireDocumentText?: string | null;
  wireAuthoritativeBodyLen?: number | null;
}): boolean {
  const outcome = (args.generationOutcome || "").trim().toLowerCase();
  if (outcome !== "degraded") return false;
  if (!isNonfatalGenerationFailureCode(args.failureCode)) return false;
  const serverFullLen = (args.wireServerFullDocumentText || "").trim().length;
  if (serverFullLen >= PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN) return false;
  const wireLen =
    args.wireAuthoritativeBodyLen ??
    Math.max(serverFullLen, (args.wireDocumentText || "").trim().length);
  if (wireLen >= PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN) return false;
  // Short contaminated aliases still count as "no substantive server full" — only
  // bodies at/above PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN are substantive.
  return true;
}

/** A paid body has the required commercial sections (services/IP/term/governing-law/signature). */
export function premiumBodyHasRequiredPaidSections(args: {
  text: string;
  rawIntake: string;
  draft?: ParsedDraftShape | null;
}): boolean {
  const t = (args.text || "").trim();
  if (t.length < 1_500) return false;
  const assessment = assessConciseCommercialServicesProQuality({
    text: t,
    rawIntake: args.rawIntake,
    draft: args.draft ?? null,
  });
  if (assessment.applies) return assessment.ok && !assessment.malformedOpening;
  return /\b(?:ownership|work\s+product|confidential|terminat|electronic\s+signatures?|e-?sign|governing\s+law|payment|compensation)\b/i.test(
    t,
  );
}

/**
 * A `degraded` HTTP-200 body whose only failure is a nonfatal parse error stays authoritative when
 * it is long enough, has zero fatal placeholders, passes the structural gate, and contains the
 * required paid sections. Intelligence metadata degrades; the body does NOT get rejected.
 */
export function authoritativeWirePremiumBodyLen(args: {
  wireDocumentText?: string | null;
  wireServerFullDocumentText?: string | null;
}): number {
  return Math.max(
    (args.wireDocumentText || "").trim().length,
    (args.wireServerFullDocumentText || "").trim().length,
  );
}

export function isNonfatalParseDegradedPaidAccept(args: {
  failureCode: string | null | undefined;
  bodyLen: number;
  /** Original HTTP wire corpus length before local thin-body expansion — blocks expanded fallbacks. */
  wireAuthoritativeBodyLen?: number | null;
  fatalPlaceholderCount: number;
  structuralOk: boolean;
  hasRequiredSections: boolean;
}): boolean {
  if (!isNonfatalGenerationFailureCode(args.failureCode)) return false;
  if (!args.structuralOk) return false;
  if (args.fatalPlaceholderCount > 0) return false;
  if (!args.hasRequiredSections) return false;
  const wireLen = args.wireAuthoritativeBodyLen ?? args.bodyLen;
  if (wireLen < PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN) return false;
  if (args.bodyLen < PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN) return false;
  return true;
}

/**
 * Minimum length for a deterministically party-placeholder-repaired body to be accepted as the paid
 * corpus. Matches the substance floor in {@link premiumBodyHasRequiredPaidSections}; a repaired body
 * still must clear the section/substance gate, so this is a lightweight lower bound.
 */
export const PARTY_PLACEHOLDER_REPAIR_PAID_MIN_LEN = 1_500;

/**
 * A paid server body that only failed because it still contained [ORG_1]/[ORG_2]-style PARTY
 * placeholders becomes authoritative once those placeholders are deterministically repaired with the
 * KNOWN canonical parties — provided no unknown identity placeholders remain, the structural gate
 * passes, and the body has the required paid sections. This keeps a `needs_details` response from
 * stranding the paid user (or spawning guided questions) when the only gap was a party name we know.
 */
export function partyPlaceholderRepairYieldsAuthoritativePaidBody(args: {
  repaired: boolean;
  hasRemainingIdentityPlaceholder: boolean;
  structuralOk: boolean;
  bodyLen: number;
  hasRequiredSections: boolean;
}): boolean {
  if (!args.repaired) return false;
  // Unknown placeholders (no canonical name) must still hard-fail — never accept an unrepaired body.
  if (args.hasRemainingIdentityPlaceholder) return false;
  if (!args.structuralOk) return false;
  if (args.bodyLen < PARTY_PLACEHOLDER_REPAIR_PAID_MIN_LEN) return false;
  return args.hasRequiredSections;
}

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

type LatchedAcceptedServerFullDraft = {
  body: string;
  source: PremiumRenderSource;
  len: number;
  hash: string;
  /** True only after a successful freeze commit — blocks recovery replacement of long server corpus. */
  freezeEstablished: boolean;
};

let latchedAcceptedServerFullDraft: LatchedAcceptedServerFullDraft | null = null;

/** Longest accepted server_full_draft for this session (survives generation-id churn). */
export function latchAcceptedServerFullDraftAuthority(
  body: string,
  source: PremiumRenderSource,
  opts?: { freezeEstablished?: boolean },
): void {
  const t = (body || "").trim();
  if (!isLongCommerciallyUsablePremiumBody(t.length)) return;
  if (!isAuthoritativePremiumPipelineRenderSource(source)) return;
  const freezeEstablished = opts?.freezeEstablished ?? false;
  if (!latchedAcceptedServerFullDraft || t.length >= latchedAcceptedServerFullDraft.len) {
    latchedAcceptedServerFullDraft = {
      body: t,
      source,
      len: t.length,
      hash: fingerprintAgreementBody(t),
      freezeEstablished,
    };
  } else if (freezeEstablished) {
    latchedAcceptedServerFullDraft.freezeEstablished = true;
  }
}

export function getLatchedAcceptedServerFullDraftAuthority(): LatchedAcceptedServerFullDraft | null {
  return latchedAcceptedServerFullDraft;
}

/** Clears latch + per-generation frozen bodies after structural SoT rejection (TEST421). */
export function clearAcceptedServerFullDraftLatchAndSessionFrozenBodies(): void {
  sessionFrozenPremiumByGenerationId.clear();
  latchedAcceptedServerFullDraft = null;
}

export function clearFrozenPremiumSessionBodiesForTests(): void {
  clearAcceptedServerFullDraftLatchAndSessionFrozenBodies();
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

/** Session-only freeze — preserves long body across pipeline retries without establishing authority latch. */
export function freezeSessionPremiumBodyForGeneration(
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

export function freezeAcceptedPremiumBodyForSession(
  generationId: string | null | undefined,
  body: string,
  source: PremiumRenderSource,
  attemptSequence?: number | null,
): void {
  const writeGuard = guardPaidProAuthoritativeWrite({
    agreementGenerationId: generationId,
    attemptSequence,
    surface: "session_freeze",
  });
  if (!writeGuard.allowed) return;
  freezeSessionPremiumBodyForGeneration(generationId, body, source);
  latchAcceptedServerFullDraftAuthority(body, source, { freezeEstablished: true });
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
      freezeSessionPremiumBodyForGeneration(generationId, candidate, candidateSource);
    }
    return { body: candidate, source: candidateSource, usedFreeze: false };
  }
  if (!candidate || candidate.length < frozen.body.length) {
    return { body: frozen.body, source: frozen.source, usedFreeze: true };
  }
  if (candidate.length > frozen.body.length) {
    freezeSessionPremiumBodyForGeneration(generationId, candidate, candidateSource);
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
