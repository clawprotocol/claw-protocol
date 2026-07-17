/**
 * Canonical party role authority — maps extraction aliases to agreement role labels
 * before any user-visible render (Starter, Pro, review, readonly, completion).
 */

import type { AgreementFamily } from "./agreementFamilyRouter";
import { extractBetweenPartyRawPair, sliceRawBetweenPartyClauseTailForRoleHints } from "./partyBetweenParse";
import { stripPartyRoleAnnotations } from "./partyRoleAnnotations";
import {
  normalizeAgreementPartyName,
  resolveAuthoritativeIntakePartyNames,
  resolveAuthoritativePartySlotCount,
} from "./partySlotIdentityNormalize";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
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

export type StarterCommercialRoleSide = "client" | "provider";

export type StarterTwoPartyCommercialAuthority = {
  parties: Array<{ name: string; role: string }>;
  clientName: string;
  providerName: string;
  payerName: string | null;
  payeeName: string | null;
  performerName: string | null;
};

function normalizeEntityKey(name: string): string {
  return normalizeAgreementPartyName(name).replace(/\s+/g, " ").trim().toLowerCase();
}

function classifyCommercialRoleHint(hint: string): StarterCommercialRoleSide | null {
  const r = normRole(hint);
  if (!r) return null;
  if (PARTY_A_EXTRACTION_ALIASES.has(r)) return "client";
  if (PARTY_B_EXTRACTION_ALIASES.has(r)) return "provider";
  if (/\bclient\b/.test(r) || /\bcustomer\b/.test(r) || /\bbuyer\b/.test(r)) return "client";
  if (/\bconsultant\b/.test(r) || /\b(?:service\s+)?provider\b/.test(r) || /\bcontractor\b/.test(r)) {
    return "provider";
  }
  return null;
}

function extractCommaRoleHintFromBetweenSide(rawSide: string): { entity: string; roleHint: string | null } {
  const cleaned = rawSide.replace(/[.,;:]+$/g, "").trim();
  const commaIdx = cleaned.indexOf(",");
  if (commaIdx < 2) {
    const { name } = stripPartyRoleAnnotations(cleaned);
    return { entity: normalizeAgreementPartyName(name), roleHint: null };
  }
  const left = cleaned.slice(0, commaIdx).trim();
  const right = cleaned.slice(commaIdx + 1).trim();
  const { name: entity } = stripPartyRoleAnnotations(left);
  const roleHint = right.replace(/^the\s+/i, "").trim();
  return { entity: normalizeAgreementPartyName(entity), roleHint: roleHint || null };
}

/** Role hints keyed by normalized entity from "between A, the client, and B, the provider" tails. */
export function extractBetweenCommaRoleHints(intake: string): Record<string, string> {
  const raw = extractBetweenPartyRawPair(intake);
  if (!raw) return {};
  const hints: Record<string, string> = {};
  for (const side of [raw.leftRaw, raw.rightRaw]) {
    const { entity, roleHint } = extractCommaRoleHintFromBetweenSide(side);
    if (entity && roleHint && isSemanticRoleHint(roleHint)) {
      hints[normalizeEntityKey(entity)] = roleHint.replace(/^the\s+/i, "").trim();
    }
  }
  return hints;
}

function isSemanticRoleHint(hint: string): boolean {
  const r = hint.replace(/^the\s+/i, "").replace(/[.,;:]+$/g, "").trim().toLowerCase();
  if (!r || r.length > 48) return false;
  if (/\b(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|LLP|Holdings|Group|Trust)\b/i.test(r)) {
    return false;
  }
  return (
    /^(?:client|customer|buyer|purchaser|vendor|supplier|service\s+provider|consultant|contractor|agency|provider|seller|landlord|tenant|lender|borrower|guarantor|escrow\s+agent|escrow\s+agent|co-tenant|co-signer)$/i.test(
      r,
    ) || /\b(?:client|provider|consultant|guarantor|escrow|landlord|tenant|buyer|seller)\b/i.test(r)
  );
}

/** Role hints from raw between-clause segments (N-party, "as role", with-clause). */
export function extractBetweenPartySegmentRoleHints(intake: string): Record<string, string> {
  const tail = sliceRawBetweenPartyClauseTailForRoleHints(intake);
  if (!tail) return {};
  const hints: Record<string, string> = {};
  const truncated = tail.replace(/[.,;:]+$/g, "").trim();
  const segments = truncated.split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
  for (const segment of segments) {
    const { entity, roleHint } = extractCommaRoleHintFromBetweenSide(segment);
    if (entity && roleHint && isSemanticRoleHint(roleHint)) {
      hints[normalizeEntityKey(entity)] = roleHint.replace(/^the\s+/i, "").trim();
      continue;
    }
    const { name, role } = stripPartyRoleAnnotations(segment.replace(/[.,;:]+$/g, "").trim());
    if (name && role && isSemanticRoleHint(role)) hints[normalizeEntityKey(name)] = role;
  }
  return hints;
}

function matchEntityInIntakeFragment(fragment: string, entities: readonly string[]): string | null {
  const normFrag = fragment.replace(/\s+/g, " ").trim();
  if (!normFrag) return null;
  for (const entity of entities) {
    if (partyLegalNamesMatch(entity, normFrag)) return entity;
    const key = normalizeEntityKey(entity);
    if (normFrag.toLowerCase().includes(key)) return entity;
  }
  for (const entity of entities) {
    const lead = entity.split(/\s+/)[0];
    if (lead && lead.length >= 4 && new RegExp(`\\b${lead.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normFrag)) {
      return entity;
    }
  }
  return null;
}

function inferPaymentDirectionFromIntake(
  intake: string,
  entities: readonly string[],
): { payer: string | null; payee: string | null } {
  const payRe =
    /\b([A-Za-z][^.!?]{2,120}?)\s+will\s+pay\s+([A-Za-z][^.!?]{2,120}?)(?:\s+(?:\$|\d)|\s+in\s+(?:three|four|five|six|\d+)\s+monthly|\s+monthly|[.!?])/gi;
  let match: RegExpExecArray | null;
  while ((match = payRe.exec(intake)) !== null) {
    const payer = matchEntityInIntakeFragment(match[1], entities);
    const payee = matchEntityInIntakeFragment(match[2], entities);
    if (payer && payee && !partyLegalNamesMatch(payer, payee)) {
      return { payer, payee };
    }
  }
  return { payer: null, payee: null };
}

function inferPerformanceProviderFromIntake(intake: string, entities: readonly string[]): string | null {
  const provideRe = /\b([A-Za-z][^.!?]{2,120}?)\s+will\s+provide\b/gi;
  let match: RegExpExecArray | null;
  while ((match = provideRe.exec(intake)) !== null) {
    const performer = matchEntityInIntakeFragment(match[1], entities);
    if (performer) return performer;
  }
  return null;
}

function resolveProviderDisplayRole(providerName: string, roleHints: Record<string, string>): string {
  const hint = roleHints[normalizeEntityKey(providerName)] || "";
  if (/\bconsultant\b/i.test(hint) && !/\bservice\s+provider\b/i.test(hint)) return "Consultant";
  return "Service Provider";
}

function collectStarterCommercialRoleHints(intake: string, entities: readonly string[]): Record<string, string> {
  const structured = parseIntakeToStructuredAgreement(intake);
  return mergeIntakeDeclaredRolesIntoPartyHints(
    entities,
    { ...extractBetweenCommaRoleHints(intake), ...structured.partyRoleHints },
    intake,
  );
}

/** True when visible starter corpus begins with user instruction/request prose instead of agreement language. */
export function starterCorpusContainsRawIntakeInstruction(text: string): boolean {
  const head = String(text || "").trim().slice(0, 700);
  if (!head) return false;
  return /\bcreate\s+(?:a|an)\s+[\w\s]{0,48}?\s+agreement\s+between\b/i.test(head);
}

export function logFreeStarterPartyAuthority(payload: {
  partyCount: number;
  clientName: string;
  providerName: string;
  payerName: string | null;
  payeeName: string | null;
  performerName: string | null;
  rejectedRawIntakeAsProse: boolean;
  source: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[free-starter-party-authority]", payload);
}

/**
 * Canonical two-party commercial services bundle: semantic roles from intake, client-first ordering.
 * Mention order alone never overrides explicit role annotations, payment direction, or performance semantics.
 */
export function resolveStarterTwoPartyCommercialAuthority(
  intakeText: string | null | undefined,
  entityNames?: readonly string[],
): StarterTwoPartyCommercialAuthority | null {
  const intake = String(intakeText ?? "").trim();
  if (!intake) return null;

  const entities =
    entityNames?.filter(Boolean).length === 2
      ? entityNames.map((n) => normalizeAgreementPartyName(String(n)))
      : resolveAuthoritativeIntakePartyNames(intake).slice(0, 2);
  if (entities.length !== 2) return null;

  const slotCount = resolveAuthoritativePartySlotCount({
    intakeText: intake,
    draftPartyNames: entities,
    rawPartyCount: entities.length,
  });
  if (slotCount !== 2) return null;

  const roleHints = collectStarterCommercialRoleHints(intake, entities);
  const sideByEntity = new Map<string, StarterCommercialRoleSide>();
  for (const entity of entities) {
    const hint = roleHints[normalizeEntityKey(entity)];
    const side = hint ? classifyCommercialRoleHint(hint) : null;
    if (side) sideByEntity.set(normalizeEntityKey(entity), side);
  }

  const payment = inferPaymentDirectionFromIntake(intake, entities);
  const performer = inferPerformanceProviderFromIntake(intake, entities);

  const clientFromHint = entities.find((e) => sideByEntity.get(normalizeEntityKey(e)) === "client") ?? null;
  const providerFromHint = entities.find((e) => sideByEntity.get(normalizeEntityKey(e)) === "provider") ?? null;

  let clientName: string;
  let providerName: string;

  if (clientFromHint && providerFromHint) {
    clientName = clientFromHint;
    providerName = providerFromHint;
  } else if (clientFromHint) {
    clientName = clientFromHint;
    providerName = entities.find((e) => !partyLegalNamesMatch(e, clientName)) ?? entities[1]!;
  } else if (providerFromHint) {
    providerName = providerFromHint;
    clientName = entities.find((e) => !partyLegalNamesMatch(e, providerName)) ?? entities[0]!;
  } else if (payment.payer && payment.payee) {
    clientName = payment.payer;
    providerName = payment.payee;
  } else if (performer) {
    providerName = performer;
    clientName = entities.find((e) => !partyLegalNamesMatch(e, performer)) ?? entities[0]!;
  } else {
    clientName = entities[0]!;
    providerName = entities[1]!;
  }

  const providerRole = resolveProviderDisplayRole(providerName, roleHints);
  const authority: StarterTwoPartyCommercialAuthority = {
    parties: [
      { name: clientName, role: "Client" },
      { name: providerName, role: providerRole },
    ],
    clientName,
    providerName,
    payerName: payment.payer,
    payeeName: payment.payee,
    performerName: performer,
  };

  logFreeStarterPartyAuthority({
    partyCount: 2,
    clientName: authority.clientName,
    providerName: authority.providerName,
    payerName: authority.payerName,
    payeeName: authority.payeeName,
    performerName: authority.performerName,
    rejectedRawIntakeAsProse: starterCorpusContainsRawIntakeInstruction(intake),
    source: "resolveStarterTwoPartyCommercialAuthority",
  });

  return authority;
}
