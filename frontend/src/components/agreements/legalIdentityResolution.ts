/**
 * Legal Identity Resolution — mandatory layer between Entity Extraction and Legal Party Authority.
 *
 * Extraction output is NOT legal party authority. This module classifies tokens as:
 *   - legal entities (promotable to authority)
 *   - role aliases (enrich only — never create slots)
 *   - metadata (email, delivery, reviewer — never create slots)
 *
 * Pipeline: Extraction → Resolution (this module) → Legal Party Authority
 */

import {
  extractAgreementEntityCandidates,
  textContainsUnresolvedIdentityPlaceholders,
} from "../../agreement/partyPlaceholderDisplay";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import {
  isAuthoritativeLegalEntityName,
  isDisallowedPartyPhrase,
} from "./paidProPartyNamePreserve";
import {
  collapsePartySlotCandidates,
  isInternalPartyAliasToken,
  normalizeAgreementPartyName,
  resolveAuthoritativeIntakePartyNames,
} from "./partySlotIdentityNormalize";
import { looksLikeEmail } from "./recipientEmailValidation";
import {
  collapseRepeatedEntityMentionCandidate,
  isolateLegalEntityFromContaminatedName,
  stripJurisdictionPrefixFromEntityName,
} from "./starterPartyIdentityIsolation";

export type IdentityTokenClass = "legal_entity" | "role_alias" | "metadata" | "unknown";

export type ResolvedLegalIdentity = {
  legalEntityName: string;
  resolvedFrom: "extraction" | "intake_authority" | "alias_parenthetical";
};

const ROLE_ALIAS_STANDALONE_RE =
  /^(?:my company|our company|the company|your company|their company|each party|both parties|either party)$/i;

const THE_ROLE_ALIAS_RE =
  /^(?:the\s+)?(?:client|customer|vendor|contractor|company|party)$/i;

const ROLE_LABEL_ALIAS_RE =
  /^(?:client|customer|buyer|vendor|contractor|consultant|service provider|provider|company|party|signer|recipient)$/i;

const PARTY_AB_ALIAS_RE = /^(?:party\s*[ab]|first\s+party|second\s+party|third\s+party|fourth\s+party)$/i;

/** Role label with parenthetical legal entity — alias enriches entity, does not create a second slot. */
const ROLE_WITH_ENTITY_PAREN_RE =
  /^(?:the\s+)?(?:client|customer|buyer|vendor|contractor|consultant|service\s+provider|provider|my|our|your|their)\s+company\s*[\(\s"“”']+(.+?)["”'\)]*\s*$/i;

const ROLE_WITH_ENTITY_PAREN_ALT_RE =
  /^(?:client|customer|buyer|vendor|contractor|consultant|service\s+provider|provider|party\s*[ab]|first\s+party|second\s+party)\s*\(\s*(.+?)\s*\)\s*$/i;

const METADATA_TOKEN_RE =
  /^(?:reviewer|notice|delivery|archive|billing|affiliate|coordinator|organization|org)(?:\s+contact|\s+email)?$/i;

const STATE_OF_RE = /^state\s+of\s+/i;
const COUNTY_OF_RE = /^(?:county\s+of\s+.+|.+?\s+county)$/i;
const CITY_STATE_RE =
  /^[A-Za-z][A-Za-z\s'.-]+,\s*(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming)$/i;

const STANDALONE_US_STATE_RE =
  /^(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming)$/i;

function normToken(raw: string): string {
  return normalizeAgreementPartyName(stripJurisdictionPrefixFromEntityName(String(raw ?? "")));
}

/** Sanitize a raw extraction candidate before resolution — never promotes aliases or jurisdiction noise. */
export function sanitizeExtractionCandidateForResolution(raw: string): string {
  const collapsed = collapseRepeatedEntityMentionCandidate(normToken(raw));
  return normalizeAgreementPartyName(isolateLegalEntityFromContaminatedName(collapsed));
}

/** True when token is a jurisdiction, geography, or venue reference — never a legal entity. */
export function isJurisdictionOrGeographyCandidate(token: string): boolean {
  const t = normToken(token);
  if (!t) return false;
  if (STATE_OF_RE.test(t)) return true;
  if (COUNTY_OF_RE.test(t)) return true;
  if (CITY_STATE_RE.test(t)) return true;
  if (STANDALONE_US_STATE_RE.test(t)) return true;
  const words = t.split(/\s+/);
  if (
    words.length === 1 &&
    /^[A-Z][a-z]{2,}$/.test(words[0]!) &&
    !isAuthoritativeLegalEntityName(t) &&
    !isLegalIdentityRoleAlias(t)
  ) {
    return true;
  }
  return false;
}

/** True when a consumer-visible label carries extra tokens beyond the authority entity. */
export function isContaminatedLegalIdentityLabel(raw: string, authorityEntity?: string): boolean {
  const got = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!got) return true;
  const sanitized = sanitizeExtractionCandidateForResolution(got);
  if (!sanitized) return true;
  if (isJurisdictionOrGeographyCandidate(got) || isLegalIdentityRoleAlias(got)) return true;
  if (looksLikeEmail(got) || /@/.test(got)) return true;
  if (/\+|(?:\bclient\b|\bvendor\b|\bcustomer\b|\bcontractor\b|\bparty\s*[ab]\b)/i.test(got) && got !== sanitized) {
    return true;
  }
  if (authorityEntity && partyLegalNamesMatch(authorityEntity, sanitized) && got !== sanitized) {
    return true;
  }
  return false;
}

/** True when token is a role/reference label — may enrich an entity but never creates one. */
export function isLegalIdentityRoleAlias(token: string): boolean {
  const t = normToken(token);
  if (!t) return false;
  if (ROLE_ALIAS_STANDALONE_RE.test(t)) return true;
  if (THE_ROLE_ALIAS_RE.test(t)) return true;
  if (PARTY_AB_ALIAS_RE.test(t)) return true;
  if (ROLE_WITH_ENTITY_PAREN_RE.test(t)) return true;
  if (ROLE_WITH_ENTITY_PAREN_ALT_RE.test(t)) return true;
  if (isInternalPartyAliasToken(t)) return true;
  if (ROLE_LABEL_ALIAS_RE.test(t) && !isAuthoritativeLegalEntityName(t)) return true;
  return false;
}

/** Extract legal entity embedded in "Client (Entity LLC)" style references. */
export function extractLegalEntityFromAliasParenthetical(token: string): string | null {
  const t = normToken(token);
  const match = t.match(ROLE_WITH_ENTITY_PAREN_ALT_RE) ?? t.match(ROLE_WITH_ENTITY_PAREN_RE);
  if (!match?.[1]) return null;
  const entity = normalizeAgreementPartyName(isolateLegalEntityFromContaminatedName(match[1]));
  if (entity.length < 3 || isDisallowedPartyPhrase(entity)) return null;
  return entity;
}

/** Classify a single extraction candidate — never promotes to authority by itself. */
export function classifyIdentityToken(token: string): IdentityTokenClass {
  const t = normToken(token);
  if (!t) return "unknown";
  if (looksLikeEmail(t) || METADATA_TOKEN_RE.test(t) || /@/.test(t)) return "metadata";
  if (isJurisdictionOrGeographyCandidate(t)) return "unknown";
  const fromParen = extractLegalEntityFromAliasParenthetical(t);
  if (fromParen && isAuthoritativeLegalEntityName(fromParen)) return "legal_entity";
  if (isLegalIdentityRoleAlias(t)) return "role_alias";
  const isolated = normalizeAgreementPartyName(isolateLegalEntityFromContaminatedName(t));
  if (isolated && isAuthoritativeLegalEntityName(isolated) && !isJurisdictionOrGeographyCandidate(isolated)) {
    return "legal_entity";
  }
  return "unknown";
}

function pushUnique(out: string[], seen: Set<string>, name: string): void {
  const normalized = normalizeAgreementPartyName(name);
  if (!normalized || !isAuthoritativeLegalEntityName(normalized)) return;
  if (isJurisdictionOrGeographyCandidate(normalized)) return;
  for (const prev of seen) {
    if (partyLegalNamesMatch(prev, normalized)) return;
  }
  seen.add(normalized);
  out.push(normalized);
}

/**
 * Resolve extraction candidates to legal entities only.
 * Role aliases and metadata never increase identity count.
 */
export function resolveExtractedCandidatesToLegalEntities(
  candidates: readonly string[],
  opts?: { intakeText?: string | null },
): ResolvedLegalIdentity[] {
  const intake = String(opts?.intakeText ?? "").trim();
  const intakeAuthority = resolveAuthoritativeIntakePartyNames(intake)
    .map(sanitizeExtractionCandidateForResolution)
    .filter((n) => n.length >= 2 && isAuthoritativeLegalEntityName(n) && !isLegalIdentityRoleAlias(n));

  const resolved: ResolvedLegalIdentity[] = [];
  const seen = new Set<string>();
  const legalNames: string[] = [];

  const pushFromIntakeAuthority = () => {
    for (const legalEntityName of intakeAuthority) {
      const before = legalNames.length;
      pushUnique(legalNames, seen, legalEntityName);
      if (legalNames.length > before) {
        resolved.push({ legalEntityName, resolvedFrom: "intake_authority" });
      }
    }
  };

  if (intakeAuthority.length >= 3) {
    pushFromIntakeAuthority();
    return resolved;
  }

  if (intakeAuthority.length === 2) {
    return intakeAuthority.map((legalEntityName) => ({
      legalEntityName,
      resolvedFrom: "intake_authority" as const,
    }));
  }

  for (const raw of candidates) {
    if (isJurisdictionOrGeographyCandidate(raw)) continue;
    const fromParen = extractLegalEntityFromAliasParenthetical(raw);
    if (fromParen) {
      const before = legalNames.length;
      pushUnique(legalNames, seen, fromParen);
      if (legalNames.length > before) {
        resolved.push({ legalEntityName: fromParen, resolvedFrom: "alias_parenthetical" });
      }
      continue;
    }
    if (isLegalIdentityRoleAlias(raw)) continue;
    if (classifyIdentityToken(raw) === "metadata") continue;

    const isolated = sanitizeExtractionCandidateForResolution(raw);
    if (!isolated || isLegalIdentityRoleAlias(isolated) || isJurisdictionOrGeographyCandidate(isolated)) continue;
    const before = legalNames.length;
    pushUnique(legalNames, seen, isolated);
    if (legalNames.length > before) {
      resolved.push({ legalEntityName: isolated, resolvedFrom: "extraction" });
    }
  }

  if (legalNames.length < 2 && intakeAuthority.length >= 2) {
    pushFromIntakeAuthority();
  }

  const collapsed = collapsePartySlotCandidates(
    legalNames.length > 0 ? legalNames : intakeAuthority,
  );
  return collapsed.map((legalEntityName) => {
    const prior = resolved.find((r) => partyLegalNamesMatch(r.legalEntityName, legalEntityName));
    return prior ?? { legalEntityName, resolvedFrom: "extraction" as const };
  });
}

/** Full resolution pass: extraction pool + explicit candidates → legal entities only. */
export function resolveLegalIdentitiesFromExtraction(args: {
  candidates?: readonly string[];
  intakeText?: string | null;
}): ResolvedLegalIdentity[] {
  const intake = String(args.intakeText ?? "").trim();
  const pool = [
    ...(args.candidates ?? []),
    ...extractAgreementEntityCandidates(intake),
  ];
  return resolveExtractedCandidatesToLegalEntities(pool, { intakeText: intake });
}

/** True when a lower authority attempted to introduce a new legal identity. */
export function isUnauthorizedLegalIdentityCandidate(token: string): boolean {
  const raw = String(token ?? "").trim();
  if (textContainsUnresolvedIdentityPlaceholders(raw) || /\{\{[^}]+\}\}/.test(raw)) return true;
  const cls = classifyIdentityToken(token);
  if (cls === "metadata") return true;
  if (isJurisdictionOrGeographyCandidate(token)) return true;
  if (cls === "role_alias" && !extractLegalEntityFromAliasParenthetical(token)) return true;
  if (looksLikeEmail(token)) return true;
  if (isLegalIdentityRoleAlias(token) && !extractLegalEntityFromAliasParenthetical(token)) return true;
  return false;
}

/**
 * Filter consumer-provided party rows to authorized legal identities only.
 * Returns authority-aligned names; never adds slots from metadata or aliases.
 */
export function filterConsumerNamesToResolvedIdentities(
  consumerNames: readonly string[],
  authority: readonly ResolvedLegalIdentity[],
): string[] {
  const authorityNames = authority.map((a) => a.legalEntityName);
  if (authorityNames.length >= 2) return authorityNames;
  const resolved = resolveExtractedCandidatesToLegalEntities(consumerNames);
  return resolved.map((r) => r.legalEntityName);
}
