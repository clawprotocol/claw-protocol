/**
 * Canonical party role authority — maps extraction aliases to agreement role labels
 * before any user-visible render (Starter, Pro, review, readonly, completion).
 */

import type { AgreementFamily } from "./agreementFamilyRouter";
import { starterCommercialRoleForIndex } from "./starterRoleLabelGuard";

export type CanonicalPartyRoleSlot = {
  index: number;
  roleLabel: string;
  partyCount: number;
};

const GENERIC_ROLES = new Set(["", "party", "parties", "signer", "signatory"]);

/** Extraction noise — always normalize to the party slot's canonical label. */
const ROLE_CONTAMINATION_ALIASES = new Set(["hiring party", "company receiving services"]);

/** Party A / client-side aliases from intake extraction — never final prose labels. */
const PARTY_A_EXTRACTION_ALIASES = new Set([
  "client",
  "customer",
  "buyer",
  "purchaser",
  "recipient",
  "hiring party",
  "company receiving services",
  "company",
  "employer",
]);

/** Party B / provider-side aliases from intake extraction. */
const PARTY_B_EXTRACTION_ALIASES = new Set([
  "service provider",
  "provider",
  "consultant",
  "contractor",
  "vendor",
  "agency",
  "supplier",
  "developer",
  "freelancer",
]);

const SERVICES_FAMILIES = new Set<AgreementFamily | string>([
  "services_agreement",
  "consulting_agreement",
  "independent_contractor_agreement",
]);

function normRole(role: string): string {
  return role.replace(/\s+/g, " ").trim().toLowerCase();
}

function titleCaseRole(role: string): string {
  return role
    .split(/\s+/)
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

export function isGenericCanonicalRole(role: string | null | undefined): boolean {
  return GENERIC_ROLES.has(normRole(role || ""));
}

export function isRoleContaminationAlias(role: string | null | undefined): boolean {
  return ROLE_CONTAMINATION_ALIASES.has(normRole(role || ""));
}

export function isExtractionRoleAlias(role: string | null | undefined): boolean {
  const r = normRole(role || "");
  if (!r || GENERIC_ROLES.has(r)) return false;
  return PARTY_A_EXTRACTION_ALIASES.has(r) || PARTY_B_EXTRACTION_ALIASES.has(r);
}

/** User-declared commercial roles (Buyer, Vendor, Agency, etc.) — preserve when set on a party slot. */
export function isPreservableIntakeRole(role: string | null | undefined): boolean {
  const r = normRole(role || "");
  if (!r || GENERIC_ROLES.has(r) || isRoleContaminationAlias(r)) return false;
  return PARTY_A_EXTRACTION_ALIASES.has(r) || PARTY_B_EXTRACTION_ALIASES.has(r);
}

const DECLARED_ROLE_TOKEN_RE =
  /\b(client|customer|buyer|purchaser|vendor|supplier|service\s+provider|consultant|contractor|agency|provider|seller|landlord|tenant|lender|borrower)\b/i;

function normalizeDeclaredEntityKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Parse `Entity LLC is the Buyer` lines from intake into lowercase role hints keyed by entity. */
export function extractIntakeDeclaredPartyRoleHints(intake: string): Record<string, string> {
  const hints: Record<string, string> = {};
  const lines = String(intake || "").replace(/\r\n/g, "\n").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const m = line.match(/^(.+?)\s+is\s+the\s+([A-Za-z][A-Za-z\s-]+?)\.?\s*$/i);
    if (!m) continue;
    const entity = m[1].trim();
    const role = m[2].trim();
    if (!DECLARED_ROLE_TOKEN_RE.test(role)) continue;
    if (/^(?:the|throughout|each|either|this|a|an)\b/i.test(entity)) continue;
    if (entity.length < 3 || entity.length > 140) continue;
    hints[normalizeDeclaredEntityKey(entity)] = role.replace(/\s+/g, " ").toLowerCase();
  }
  return hints;
}

/** Merge declared `is the <Role>` hints onto structured party names. */
export function mergeIntakeDeclaredRolesIntoPartyHints(
  parties: readonly string[],
  existingHints: Record<string, string>,
  intake: string,
): Record<string, string> {
  const declared = extractIntakeDeclaredPartyRoleHints(intake);
  if (!Object.keys(declared).length) return existingHints;
  const merged = { ...existingHints };
  for (const party of parties) {
    const key = normalizeDeclaredEntityKey(party);
    if (merged[key]) continue;
    const direct = declared[key];
    if (direct) {
      merged[key] = direct;
      continue;
    }
    for (const [declaredEntity, role] of Object.entries(declared)) {
      if (key.includes(declaredEntity) || declaredEntity.includes(key)) {
        merged[key] = role;
        break;
      }
    }
  }
  return merged;
}

export function isServicesAgreementFamily(family: AgreementFamily | string | null | undefined): boolean {
  const f = String(family || "").toLowerCase();
  if (SERVICES_FAMILIES.has(f)) return true;
  return false;
}

/** Resolve canonical display role for a party slot (2-party services default: Client / Service Provider). */
export function resolveCanonicalPartyRoleLabel(input: {
  partyIndex: number;
  partyCount: number;
  explicitRole?: string | null;
  agreementFamily?: AgreementFamily | string | null;
  /** When true, honor user-declared intake roles (Buyer, Vendor, Agency, etc.). */
  preserveIntakeRole?: boolean;
}): string {
  const explicit = String(input.explicitRole ?? "").trim();
  if (explicit.length >= 2 && !isGenericCanonicalRole(explicit)) {
    if (input.preserveIntakeRole && isPreservableIntakeRole(explicit)) {
      return titleCaseRole(explicit);
    }
    if (!isExtractionRoleAlias(explicit) && !/^hiring\b/i.test(explicit)) {
      return titleCaseRole(explicit);
    }
  }
  if (input.partyCount === 2 && isServicesAgreementFamily(input.agreementFamily)) {
    return starterCommercialRoleForIndex(input.partyIndex, input.partyCount);
  }
  if (input.partyCount === 2) {
    return starterCommercialRoleForIndex(input.partyIndex, input.partyCount);
  }
  return `Party ${input.partyIndex + 1}`;
}

export function resolveCanonicalRoleLabelsForPartyCount(
  partyCount: number,
  agreementFamily?: AgreementFamily | string | null,
): string[] {
  return Array.from({ length: Math.max(partyCount, 0) }, (_, index) =>
    resolveCanonicalPartyRoleLabel({ partyIndex: index, partyCount, agreementFamily }),
  );
}

const PROSE_ALIAS_REPLACEMENTS: readonly { pattern: RegExp; roleIndex: number }[] = [
  { pattern: /\bhiring\s+party(?:'s)?\b/gi, roleIndex: 0 },
  { pattern: /\bthe\s+hiring\s+party\b/gi, roleIndex: 0 },
  { pattern: /\b(?:grants?|pays?|provides?)\s+hiring\b/gi, roleIndex: 0 },
];

/**
 * Replace extraction aliases in operative prose with canonical role labels.
 * Legal entity names are preserved by repairCanonicalPartyIdentityInCorpus.
 */
export function replaceExtractionRoleAliasesInProse(
  text: string,
  roleLabels: readonly string[],
): { text: string; repairs: string[] } {
  if (!text.trim() || roleLabels.length < 2) return { text, repairs: [] };
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const bodyEnd = witnessIdx >= 0 ? witnessIdx : text.length;
  let body = text.slice(0, bodyEnd);
  const tail = text.slice(bodyEnd);
  const repairs: string[] = [];

  for (const { pattern, roleIndex } of PROSE_ALIAS_REPLACEMENTS) {
    const canonical = roleLabels[roleIndex] ?? roleLabels[0] ?? "Client";
    pattern.lastIndex = 0;
    const next = body.replace(pattern, (match) => {
      if (match.toLowerCase().includes("hiring") && /grants?\s+hiring|pays?\s+hiring|provides?\s+hiring/i.test(match)) {
        return match.replace(/\bhiring\b/i, canonical);
      }
      return canonical;
    });
    if (next !== body) {
      repairs.push(`role_alias:${pattern.source.slice(0, 24)}`);
      body = next;
    }
    pattern.lastIndex = 0;
  }

  const hiringPartyRe = /\bhiring\s+party\b/gi;
  if (hiringPartyRe.test(body)) {
    hiringPartyRe.lastIndex = 0;
    body = body.replace(hiringPartyRe, roleLabels[0] ?? "Client");
    repairs.push("role_alias:hiring_party");
  }

  return { text: body + tail, repairs };
}
