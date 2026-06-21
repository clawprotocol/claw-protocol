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

import { extractAgreementEntityCandidates } from "../../agreement/partyPlaceholderDisplay";
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
import { isolateLegalEntityFromContaminatedName } from "./starterPartyIdentityIsolation";

export type IdentityTokenClass = "legal_entity" | "role_alias" | "metadata" | "unknown";

export type ResolvedLegalIdentity = {
  legalEntityName: string;
  resolvedFrom: "extraction" | "intake_authority" | "alias_parenthetical";
};

const ROLE_ALIAS_STANDALONE_RE =
  /^(?:my company|our company|the company|your company|their company|each party|both parties|either party)$/i;

const ROLE_LABEL_ALIAS_RE =
  /^(?:client|customer|buyer|vendor|contractor|consultant|service provider|provider|company|party|signer|recipient)$/i;

const PARTY_AB_ALIAS_RE = /^(?:party\s*[ab]|first\s+party|second\s+party|third\s+party|fourth\s+party)$/i;

/** Role label with parenthetical legal entity — alias enriches entity, does not create a second slot. */
const ROLE_WITH_ENTITY_PAREN_RE =
  /^(?:client|customer|buyer|vendor|contractor|consultant|service\s+provider|provider|party\s*[ab]|first\s+party|second\s+party)\s*\(\s*(.+?)\s*\)\s*$/i;

const METADATA_TOKEN_RE =
  /^(?:reviewer|notice|delivery|archive|billing|affiliate|coordinator|organization|org)(?:\s+contact|\s+email)?$/i;

function normToken(raw: string): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

/** True when token is a role/reference label — may enrich an entity but never creates one. */
export function isLegalIdentityRoleAlias(token: string): boolean {
  const t = normToken(token);
  if (!t) return false;
  if (ROLE_ALIAS_STANDALONE_RE.test(t)) return true;
  if (PARTY_AB_ALIAS_RE.test(t)) return true;
  if (ROLE_WITH_ENTITY_PAREN_RE.test(t)) return true;
  if (isInternalPartyAliasToken(t)) return true;
  if (ROLE_LABEL_ALIAS_RE.test(t) && !isAuthoritativeLegalEntityName(t)) return true;
  return false;
}

/** Extract legal entity embedded in "Client (Entity LLC)" style references. */
export function extractLegalEntityFromAliasParenthetical(token: string): string | null {
  const t = normToken(token);
  const match = t.match(ROLE_WITH_ENTITY_PAREN_RE);
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
  const fromParen = extractLegalEntityFromAliasParenthetical(t);
  if (fromParen && isAuthoritativeLegalEntityName(fromParen)) return "legal_entity";
  if (isLegalIdentityRoleAlias(t)) return "role_alias";
  const isolated = normalizeAgreementPartyName(isolateLegalEntityFromContaminatedName(t));
  if (isolated && isAuthoritativeLegalEntityName(isolated)) return "legal_entity";
  return "unknown";
}

function pushUnique(out: string[], seen: Set<string>, name: string): void {
  const normalized = normalizeAgreementPartyName(name);
  if (!normalized || !isAuthoritativeLegalEntityName(normalized)) return;
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
    .map(normalizeAgreementPartyName)
    .filter((n) => n.length >= 2 && isAuthoritativeLegalEntityName(n));

  if (intakeAuthority.length >= 2) {
    return intakeAuthority.map((legalEntityName, _i) => ({
      legalEntityName,
      resolvedFrom: "intake_authority" as const,
    }));
  }

  const resolved: ResolvedLegalIdentity[] = [];
  const seen = new Set<string>();
  const legalNames: string[] = [];

  for (const raw of candidates) {
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

    const isolated = normalizeAgreementPartyName(isolateLegalEntityFromContaminatedName(normToken(raw)));
    if (!isolated || isLegalIdentityRoleAlias(isolated)) continue;
    const before = legalNames.length;
    pushUnique(legalNames, seen, isolated);
    if (legalNames.length > before) {
      resolved.push({ legalEntityName: isolated, resolvedFrom: "extraction" });
    }
  }

  const collapsed = collapsePartySlotCandidates(legalNames);
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
  const cls = classifyIdentityToken(token);
  if (cls === "metadata") return true;
  if (cls === "role_alias" && !extractLegalEntityFromAliasParenthetical(token)) return true;
  if (looksLikeEmail(token)) return true;
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
