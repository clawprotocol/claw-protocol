/**
 * Party-slot identity normalization — prevents legal suffixes and internal aliases
 * (party_a, party_b) from becoming standalone signer slots or user-facing entity names.
 */

import { labeledPartyLegalEntities, quotedRolePartyLegalEntities } from "./labeledPartyBlockParse";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { dedupeEntityCandidatesToLegalParties, extractAgreementEntityCandidates } from "../../agreement/partyPlaceholderDisplay";
import { PARTY_ENTITY_SUFFIX_RE } from "./canonicalPartyIdentityResolver";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { PAID_PRO_AUTHORITY_MAX_PARTIES } from "./paidProAuthorityLimits";
import {
  isAuthoritativeLegalEntityName,
  isDisallowedPartyPhrase,
} from "./paidProPartyNamePreserve";

const STANDALONE_SUFFIX_RE =
  /^(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.|Co\.?|Company)\.?$/i;

const INTERNAL_PARTY_ALIAS_RE =
  /^(?:party[_\s-]?[ab]\d*|party[_\s-]?\d+|client|consultant|service\s+provider|provider|contractor|company|vendor|customer)$/i;

const NATURAL_COMPANY_ALIAS_RE =
  /^(?:my|our|the|your|their|each|both|either)\s+company$/i;

const ENTITY_SUFFIX_CONTINUATION_RE =
  /^(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.|Co\.?|Company)\b/i;

export function isStandaloneLegalEntitySuffix(name: string): boolean {
  return STANDALONE_SUFFIX_RE.test((name || "").replace(/\s+/g, " ").trim());
}

export function isInternalPartyAliasToken(name: string): boolean {
  const t = (name || "").replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (NATURAL_COMPANY_ALIAS_RE.test(t)) return true;
  if (INTERNAL_PARTY_ALIAS_RE.test(t)) return true;
  if (/^\(?\s*["'“”]?party[_\s-]?[ab]\d*["'“”]?\s*\)?$/i.test(t)) return true;
  if (/\bparty[_\s-]?[ab]\b/i.test(t) && t.length < 28) return true;
  return false;
}

export function isInternalPartyAliasRole(role: string | null | undefined): boolean {
  const t = (role || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  return isInternalPartyAliasToken(t);
}

export function stripInternalPartyAliasParentheticals(raw: string): string {
  return String(raw || "")
    .replace(
      /\s*\(\s*["'“”]?(?:party[_\s-]?[ab]\d*|the\s+(?:client|service\s+provider|consultant|company))["'“”]?\s*\)/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** "Red Mesa Logistics, LLC" → "Red Mesa Logistics LLC" when safe. */
export function normalizeCommaSeparatedEntitySuffix(raw: string): string {
  let s = stripInternalPartyAliasParentheticals(raw);
  s = s.replace(
    /,\s*((?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.|Co\.?|Company)\.?)\s*$/i,
    " $1",
  );
  return s.replace(/\s+/g, " ").trim();
}

export function normalizeAgreementPartyName(raw: string): string {
  return normalizeCommaSeparatedEntitySuffix(raw);
}

export function isInvalidPartySlotLegalEntity(name: string): boolean {
  const t = normalizeAgreementPartyName(name);
  if (!t || t.length < 3) return true;
  if (isStandaloneLegalEntitySuffix(t)) return true;
  if (isInternalPartyAliasToken(t)) return true;
  if (isDisallowedPartyPhrase(t)) return true;
  return false;
}

export function resolveAuthoritativeIntakePartyNames(intakeContext?: string | null): string[] {
  const intake = String(intakeContext || "").trim();
  if (!intake) return [];
  const labeled = labeledPartyLegalEntities(intake)
    .map(normalizeAgreementPartyName)
    .filter((n) => n.length >= 2 && !isInvalidPartySlotLegalEntity(n));
  if (labeled.length >= 2) return labeled;
  const quoted = quotedRolePartyLegalEntities(intake)
    .map(normalizeAgreementPartyName)
    .filter((n) => n.length >= 2 && !isInvalidPartySlotLegalEntity(n));
  if (quoted.length >= 2) return quoted;
  return collapsePartySlotCandidates(extractBetweenPartyNameList(intake)).filter(
    (n) => n.length >= 2 && !isInvalidPartySlotLegalEntity(n) && isAuthoritativeLegalEntityName(n),
  );
}

/** When intake/free-starter manifest has exactly two legal entities, cap signer setup at two. */
/** When draft/API parties are service phrases but intake has two legal entities, restore intake authority. */
export function repairDraftPartiesFromIntakeAuthority<T extends DraftPartyRowLike>(
  parties: readonly T[],
  intakeContext?: string | null,
): T[] {
  if (!parties.length) return [];
  const intake = String(intakeContext || "").trim();
  if (!intake) return [...parties];

  const intakeNames = resolveAuthoritativeIntakePartyNames(intake).filter(isAuthoritativeLegalEntityName);
  if (intakeNames.length < 2) return [...parties];

  const currentInvalid = parties.some((row) => {
    const name = normalizeAgreementPartyName(row.name);
    return (
      !name ||
      isInvalidPartySlotLegalEntity(name) ||
      isDisallowedPartyPhrase(name) ||
      !isAuthoritativeLegalEntityName(name)
    );
  });
  if (!currentInvalid && parties.length === intakeNames.length) return [...parties];

  return intakeNames.map((name, index) => {
    const prev = parties[index] ?? parties.find((p) => partyLegalNamesMatch(p.name, name)) ?? parties[0];
    const prevRole = String(prev?.role ?? "").trim();
    const role = isInternalPartyAliasRole(prevRole)
      ? index === 0
        ? "Client"
        : index === 1
          ? "Service Provider"
          : "party"
      : prevRole || (index === 0 ? "Client" : index === 1 ? "Service Provider" : "party");
    return {
      ...prev,
      name,
      role,
    } as T;
  });
}

export function resolveAuthoritativePartySlotCount(args: {
  intakeText?: string | null;
  draftPartyNames?: readonly string[];
  rawPartyCount?: number;
  /** When user explicitly adds 3+ parties in signer setup, do not collapse back to two. */
  userExpandedPartyCount?: number;
}): number {
  const userExpanded = Math.max(0, args.userExpandedPartyCount ?? 0);

  const intake = String(args.intakeText ?? "").trim();
  const labeled = labeledPartyLegalEntities(intake).filter(isAuthoritativeLegalEntityName);
  const quoted = quotedRolePartyLegalEntities(intake).filter(isAuthoritativeLegalEntityName);
  if (quoted.length >= 3) return quoted.length;
  if (labeled.length >= 3) return labeled.length;

  const betweenAuthoritative = dedupeEntityCandidatesToLegalParties(
    extractBetweenPartyNameList(intake).filter(isAuthoritativeLegalEntityName),
  );
  const entityPool = dedupeEntityCandidatesToLegalParties(
    extractAgreementEntityCandidates(intake).filter(isAuthoritativeLegalEntityName),
  );
  const collapsedDraftAuthoritative = collapsePartySlotCandidates(args.draftPartyNames ?? []).filter(
    isAuthoritativeLegalEntityName,
  );
  const explicitMultiParty =
    labeled.length >= 3 ||
    quoted.length >= 3 ||
    betweenAuthoritative.length >= 3 ||
    entityPool.length >= 3 ||
    collapsedDraftAuthoritative.length >= 3;
  if (betweenAuthoritative.length === 2 && !explicitMultiParty) return 2;

  if (quoted.length >= 2) return quoted.length;
  if (labeled.length >= 2) return labeled.length;

  const intakeNames = resolveAuthoritativeIntakePartyNames(intake);
  const intakeAuthoritative = intakeNames.filter(isAuthoritativeLegalEntityName);
  if (labeled.length === 2) return 2;
  if (intakeAuthoritative.length === 2) return 2;

  const rowNames = args.draftPartyNames ?? [];
  const hasDrift = partySlotListHasDriftFragments(rowNames, args.intakeText);
  const collapsed = selectAuthoritativeTwoPartySlots(rowNames);
  if (hasDrift && collapsed.length === 2) return 2;
  if (hasDrift && intakeNames.length === 2) return 2;

  const validCollapsed = collapsePartySlotCandidates(rowNames);
  if (rowNames.length > 2 && validCollapsed.length === 2 && !explicitMultiParty) return 2;

  if (quoted.length >= 3) return quoted.length;
  if (entityPool.length >= 3) return entityPool.length;

  let legalCount = Math.max(args.rawPartyCount ?? rowNames.length, quoted.length || labeled.length || 2);
  legalCount = Math.max(2, Math.min(legalCount, PAID_PRO_AUTHORITY_MAX_PARTIES));

  if (userExpanded > 2) {
    if (betweenAuthoritative.length === 2 && !explicitMultiParty) {
      return 2;
    }
    if (!explicitMultiParty && legalCount >= 2 && userExpanded > legalCount) {
      return legalCount;
    }
    return Math.min(Math.max(legalCount, userExpanded), PAID_PRO_AUTHORITY_MAX_PARTIES);
  }

  return legalCount;
}

function tokenContinuesEntitySuffix(token: string): boolean {
  const t = (token || "").trim();
  if (!t) return false;
  if (ENTITY_SUFFIX_CONTINUATION_RE.test(t)) return true;
  if (isStandaloneLegalEntitySuffix(t.split(/\s+/)[0] || "")) return true;
  return false;
}

/** Split comma lists without breaking "Entity Name, LLC". */
export function splitCommaSeparatedPartyNames(csv: string): string[] {
  const tokens = csv.split(/,\s*/).map((x) => x.trim()).filter(Boolean);
  if (tokens.length <= 1) {
    const one = normalizeAgreementPartyName(csv);
    return one.length >= 2 ? [one] : [];
  }

  const parts: string[] = [];
  let current = tokens[0]!;
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tokenContinuesEntitySuffix(tok)) {
      current = `${current}, ${tok}`;
    } else {
      const normalized = normalizeAgreementPartyName(current);
      if (normalized.length >= 2) parts.push(normalized);
      current = tok;
    }
  }
  const tail = normalizeAgreementPartyName(current);
  if (tail.length >= 2) parts.push(tail);
  return parts;
}

export function mergeSplitEntitySuffixFragments(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of names) {
    const n = normalizeAgreementPartyName(raw);
    if (!n || isInternalPartyAliasToken(n)) continue;
    if (isStandaloneLegalEntitySuffix(n) && out.length > 0) {
      const prev = out[out.length - 1]!;
      if (!PARTY_ENTITY_SUFFIX_RE.test(prev)) {
        out[out.length - 1] = `${prev} ${n}`.replace(/\s+/g, " ").trim();
        continue;
      }
    }
    if (isInvalidPartySlotLegalEntity(n)) continue;
    if (out.length === 0 || !partyLegalNamesMatch(out[out.length - 1]!, n)) {
      out.push(n);
    }
  }
  return out;
}

export function collapsePartySlotCandidates(names: readonly string[]): string[] {
  return mergeSplitEntitySuffixFragments(
    names.flatMap((n) => {
      const t = normalizeAgreementPartyName(n);
      return t ? [t] : [];
    }),
  ).filter((n) => !isInvalidPartySlotLegalEntity(n));
}

export function selectAuthoritativeTwoPartySlots(names: readonly string[]): string[] {
  const collapsed = collapsePartySlotCandidates(names);
  if (collapsed.length <= 2) return collapsed;
  const withSuffix = collapsed.filter((n) => PARTY_ENTITY_SUFFIX_RE.test(n));
  if (withSuffix.length >= 2) return withSuffix.slice(0, 2);
  return collapsed.slice(0, 2);
}

export type DraftPartyRowLike = { name: string; role?: string; email?: string; id?: string };

export function partySlotListHasDriftFragments(
  names: readonly string[],
  intakeContext?: string | null,
): boolean {
  const intake = String(intakeContext || "").trim();
  const labeled = labeledPartyLegalEntities(intake).filter(isAuthoritativeLegalEntityName);
  if (labeled.length >= 2) {
    const current = collapsePartySlotCandidates(names);
    if (current.length === labeled.length) {
      const matches = labeled.filter((auth, i) => partyLegalNamesMatch(auth, current[i] ?? ""));
      if (matches.length >= labeled.length) return false;
    }
    if (current.length < labeled.length) return true;
  }

  if (names.some((raw) => isInvalidPartySlotLegalEntity(normalizeAgreementPartyName(raw)))) {
    return true;
  }
  if (names.length > 2) {
    const collapsed = collapsePartySlotCandidates(names);
    if (collapsed.length === 2) {
      const withSuffix = collapsed.filter((n) => PARTY_ENTITY_SUFFIX_RE.test(n));
      if (withSuffix.length >= 2) return true;
    }
  }
  return false;
}

export function collapseDraftPartyRows(
  parties: readonly DraftPartyRowLike[],
  intakeContext?: string | null,
): DraftPartyRowLike[] {
  if (!parties.length) return [];

  const rowNames = parties.map((p) => normalizeAgreementPartyName(p.name));
  const intake = String(intakeContext || "").trim();
  const labeled = labeledPartyLegalEntities(intake).filter(isAuthoritativeLegalEntityName);
  const quoted = quotedRolePartyLegalEntities(intake).filter(isAuthoritativeLegalEntityName);
  const authoritativeIntake =
    quoted.length >= labeled.length ? quoted : labeled.length >= 3 ? labeled : quoted.length >= 3 ? quoted : labeled;
  if (authoritativeIntake.length >= 3 && parties.length !== authoritativeIntake.length) {
    return authoritativeIntake.map((name, index) => {
      const prev =
        parties.find((p) => partyLegalNamesMatch(p.name, name)) ??
        parties[index] ??
        parties[parties.length - 1];
      const role = isInternalPartyAliasRole(prev?.role) ? undefined : prev?.role;
      return {
        name,
        role: role || (index === 0 ? "Client" : index === 1 ? "Service Provider" : "party"),
        email: prev?.email,
        id: prev?.id,
      };
    });
  }

  const fromIntake = intake ? extractBetweenPartyNameList(intake) : [];
  const intakeCollapsed =
    fromIntake.length >= 2 ? collapsePartySlotCandidates(fromIntake) : [];
  const intakeAuthoritative = intakeCollapsed.filter(isAuthoritativeLegalEntityName);
  const hasDrift = partySlotListHasDriftFragments(rowNames, intake);
  const collapseToKnownTwoPartyAuthority =
    intakeAuthoritative.length === 2 && parties.length > 2;

  if (!hasDrift && !collapseToKnownTwoPartyAuthority) {
    return parties.map((p) => ({ ...p, name: normalizeAgreementPartyName(p.name) }));
  }

  const collapsedNames =
    intakeAuthoritative.length >= 2
      ? intakeAuthoritative
      : intakeCollapsed.length >= 2
        ? intakeCollapsed
        : selectAuthoritativeTwoPartySlots(parties.map((p) => p.name));

  if (collapsedNames.length < 2) {
    return parties
      .map((p) => ({ ...p, name: normalizeAgreementPartyName(p.name) }))
      .filter((p) => !isInvalidPartySlotLegalEntity(p.name));
  }

  if (collapsedNames.length >= 2 && parties.length > collapsedNames.length) {
    return collapsedNames.map((name, index) => {
      const prev =
        parties.find((p) => partyLegalNamesMatch(p.name, name)) ??
        parties[index] ??
        parties[parties.length - 1];
      const role = isInternalPartyAliasRole(prev?.role) ? undefined : prev?.role;
      return {
        name,
        role: role || (index === 0 ? "Client" : index === 1 ? "Service Provider" : "party"),
        email: prev?.email,
        id: prev?.id,
      };
    });
  }

  return parties
    .map((p) => ({ ...p, name: normalizeAgreementPartyName(p.name) }))
    .filter((p) => !isInvalidPartySlotLegalEntity(p.name));
}
