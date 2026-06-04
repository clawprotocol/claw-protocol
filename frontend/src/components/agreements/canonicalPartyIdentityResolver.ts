/**
 * Canonical party identity — full legal names are immutable once extracted from intake.
 * Short aliases are for defined-term parentheticals only; body text prefers role labels.
 */

import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { extractAgreementEntityCandidates } from "../../agreement/partyPlaceholderDisplay";
import { logPaidProEntityMap } from "./paidProPlaceholderAttributionLog";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { repairOpeningRecitalRoleLabelsFromManifest } from "./paidProOpeningRoleLabelConsistency";
import {
  isAuthoritativeLegalEntityName,
  preserveFullLegalPartyNames,
  preserveFullLegalPartyNamesInOpeningAndSignatures,
  shortFormsFromLegalName,
} from "./paidProPartyNamePreserve";
import { definedShortNameFromLegalEntity } from "./paidProAgreementPolish";
import type { CanonicalPartyIdentity as SignerCanonicalPartyIdentity } from "./guidedDealCompletion/signerPartyIdentity";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";

export const PARTY_ENTITY_SUFFIX_RE =
  /\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|Co\.?|Company|Foundation|Trust)\.?$/i;

const INVALID_CANONICAL_PARTY_PHRASE_RE =
  /\b(?:effective\s+date|services?\s+term|governing\s+law|this\s+agreement|agreement|payment\s+terms?|electronic\s+signatures?|confidentiality|miscellaneous|termination|scope|purpose|ownership|notices?|dispute|venue|jurisdiction|signature|execution)\b/i;

const SECTION_HEADING_PARTY_PREFIX_RE =
  /^(?:INDEPENDENT CONTRACTOR AND ACCESS|SCOPE OF SERVICES|WARRANTIES AND COMPLIANCE|LIMITATION OF LIABILITY|INTELLECTUAL PROPERTY|CONFIDENTIALITY|GOVERNING LAW|NOTICES|TERMINATION|ELECTRONIC SIGNATURES|ENTIRE AGREEMENT|MISCELLANEOUS|FEES AND PAYMENT|TERM\b|CLIENT\.)/i;

const ADDRESS_PLACEHOLDER_LINE_RE =
  /(?:,\s*)?(?:a\s+\[[^\]]+\]\s+)?(?:with\s+(?:its\s+)?(?:principal\s+place\s+of\s+business|principal\s+office|mailing\s+address|notice\s+address)|(?:principal\s+place\s+of\s+business|principal\s+office|mailing\s+address|notice\s+address)\s*(?:at|:)?|located\s+at)\s+\[?(?:client\s+address|service\s+provider\s+address|address|principal\s+place\s+of\s+business|principal\s+office|mailing\s+address|notice\s+address)[^\]\n.,;]*\]?/gi;

export type CanonicalPartyIdentityRecord = {
  /** Immutable legal entity name from intake or signer party field. */
  fullLegalName: string;
  roleLabel: string;
  /** Trade short for defined-term parentheticals only — never a substitute for fullLegalName. */
  displayAlias: string;
  signerName: string | null;
  signerTitle: string | null;
  partyAddress?: string | null;
};

export type CanonicalPartyIdentity = {
  canonicalLegalName: string;
  shortDisplayName?: string;
  signerName?: string;
  signerTitle?: string;
  email?: string;
  partyAddress?: string;
};

const WITNESS_RE = /\b(?:IN WITNESS WHEREOF|SIGNATURES?|EXECUTION)\b/i;

const DEFAULT_ROLE_LABELS = ["Client", "Service Provider"] as const;

export function logCanonicalPartyIdentityPreserved(args: {
  canonicalLegalName: string;
  shortDisplayName?: string | null;
  source: string;
  surface: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta !== "undefined" && !import.meta.env?.DEV) return;
  const key = JSON.stringify({
    canonicalLegalName: args.canonicalLegalName,
    shortDisplayName: args.shortDisplayName || null,
    source: args.source,
    surface: args.surface,
  });
  if (loggedCanonicalPartyIdentityPreserved.has(key)) return;
  loggedCanonicalPartyIdentityPreserved.add(key);
  // eslint-disable-next-line no-console
  console.info("[canonical-party-identity-preserved]", {
    canonicalLegalName: args.canonicalLegalName,
    shortDisplayName: args.shortDisplayName || null,
    source: args.source,
    surface: args.surface,
  });
}

const loggedCanonicalPartyIdentityPreserved = new Set<string>();

export function logCanonicalPartySourceCandidates(args: {
  rawIntakeNames: readonly string[];
  generatedBodyNames: readonly string[];
  starterNames: readonly string[];
  selected: readonly string[];
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta !== "undefined" && !import.meta.env?.DEV) return;
  const key = JSON.stringify({
    rawIntakeNames: args.rawIntakeNames,
    generatedBodyNames: args.generatedBodyNames,
    starterNames: args.starterNames,
    selected: args.selected,
  });
  if (loggedCanonicalPartySourceCandidates.has(key)) return;
  loggedCanonicalPartySourceCandidates.add(key);
  // eslint-disable-next-line no-console
  console.info("[canonical-party-source-candidates]", {
    rawIntakeNames: args.rawIntakeNames,
    generatedBodyNames: args.generatedBodyNames,
    starterNames: args.starterNames,
    selected: args.selected,
  });
}

const loggedCanonicalPartySourceCandidates = new Set<string>();

export function logCanonicalPartyIdentityUpgraded(args: {
  from: string;
  to: string;
  reason: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[canonical-party-identity-upgraded]", args);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function roleLabelForIndex(index: number, explicit?: string): string {
  const t = (explicit || "").trim();
  if (t.length >= 2) return t;
  return DEFAULT_ROLE_LABELS[index] ?? `Party ${index + 1}`;
}

function normalizedName(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\(\s*(?:Client|Service\s+Provider)\s*\)\.?$/i, "");
}

/** Party fragment from between-clause may include inline role + trailing intake prose. */
function partyNameFromIntakeFragment(raw: string): string {
  let n = normalizedName(raw);
  n = n.replace(/\s*\(\s*["'“”]?[^)"'“”]{1,64}["'“”]?\s*\).*$/i, "").trim();
  if (!PARTY_ENTITY_SUFFIX_RE.test(n)) {
    n = n.replace(/[.,;]+$/g, "");
  }
  return cleanManifestLegalName(n);
}

/** Drop stray period after suffixes not normally written with one (e.g. `LLC.` before `(`). Keeps `Inc.` / `Corp.` etc. */
function cleanManifestLegalName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b((?:LLC|L\.L\.C\.|LLP|L\.P\.|LP|PLLC))\.\s*$/i, "$1");
}

function dedupeKnownPartyTokens(tokens: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of tokens) {
    const token = norm(raw).replace(/[.,;:]+$/g, "");
    if (token.length < 8) continue;
    if (out.some((existing) => partyLegalNamesMatch(existing, token))) continue;
    out.push(token);
  }
  return out;
}

function containsMultipleKnownPartyNames(name: string, knownPartyTokens?: readonly string[]): boolean {
  const uniqueTokens = dedupeKnownPartyTokens(knownPartyTokens || []);
  if (uniqueTokens.length < 2) return false;
  const n = norm(name).replace(/[.,;:]+$/g, "");
  if (!n) return false;
  let matched = 0;
  for (const token of uniqueTokens) {
    if (partyLegalNamesMatch(n, token)) {
      matched += 1;
      continue;
    }
    if (n.length > token.length + 2 && n.includes(token)) matched += 1;
  }
  return matched >= 2;
}

function isInvalidCanonicalPartyName(name: string, knownPartyTokens?: readonly string[]): boolean {
  const t = normalizedName(name);
  if (!t || t.length < 3) return true;
  if (/^(?:party|parties|client|service provider|provider|contractor|company)$/i.test(t)) return true;
  if (INVALID_CANONICAL_PARTY_PHRASE_RE.test(t)) return true;
  if (SECTION_HEADING_PARTY_PREFIX_RE.test(t)) return true;
  if (/^(?:this\s+(?:mutual\s+[\w\s]+?\s+)?agreement|agreement|entered\s+into|between)\b/i.test(t)) {
    return true;
  }
  if (/^this agreement is between\b/i.test(t)) return true;
  if (/^client\.\s+/i.test(t)) return true;
  if (containsMultipleKnownPartyNames(t, knownPartyTokens)) return true;
  return false;
}

function hasLegalEntitySuffix(name: string): boolean {
  return PARTY_ENTITY_SUFFIX_RE.test(normalizedName(name));
}

function canonicalEntityNamesFromText(
  text: string | null | undefined,
  opts?: { allowBetweenWithoutSuffix?: boolean; requireSuffix?: boolean; knownPartyTokens?: readonly string[] },
): string[] {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const knownTokens = (opts?.knownPartyTokens || []).map(norm).filter(Boolean);
  const matchesKnownToken = (name: string) => {
    const n = norm(name);
    return knownTokens.some((token) => n === token || n.startsWith(`${token} `) || token.startsWith(`${n} `));
  };
  const accept = (name: string, fromBetween: boolean) => {
    const cleaned = normalizedName(name);
    if (isInvalidCanonicalPartyName(cleaned, knownTokens)) return false;
    if (hasLegalEntitySuffix(cleaned)) return true;
    if (opts?.requireSuffix && !matchesKnownToken(cleaned)) return false;
    if (fromBetween && opts?.allowBetweenWithoutSuffix) return true;
    return matchesKnownToken(cleaned);
  };
  const between = extractBetweenPartyNameList(raw).filter((name) => accept(name, true)).map(normalizedName);
  if (between.length >= 2) return between;
  return extractAgreementEntityCandidates(raw)
    .map(normalizedName)
    .filter((name) => accept(name, false));
}

function authoritativeNamesFromPartyNames(partyNames: readonly string[] | null | undefined): string[] {
  return (partyNames || [])
    .map((n) => normalizedName(String(n || "")))
    .filter((name) => !isInvalidCanonicalPartyName(name) && hasLegalEntitySuffix(name));
}

function rawStarterNames(partyNames: readonly string[] | null | undefined): string[] {
  return (partyNames || [])
    .map((n) => normalizedName(String(n || "")))
    .filter((n) => n.length >= 3 && !isInvalidCanonicalPartyName(n));
}

function startsWithSameLeadingTokens(shortName: string, fullName: string): boolean {
  const short = norm(shortName);
  const full = norm(fullName);
  if (!short || !full || short === full) return false;
  if (full.startsWith(`${short} `)) return true;
  const shortWords = short.split(/\s+/).filter(Boolean);
  const fullWords = full.split(/\s+/).filter(Boolean);
  if (shortWords.length < 1 || shortWords.length >= fullWords.length) return false;
  return shortWords.every((word, index) => fullWords[index] === word);
}

function upgradeShortNamesToFullLegal(
  names: readonly string[],
  fullCandidates: readonly string[],
): string[] {
  return names.map((name) => {
    const upgraded = fullCandidates.find((candidate) => startsWithSameLeadingTokens(name, candidate));
    if (upgraded && upgraded !== name) {
      logCanonicalPartyIdentityUpgraded({
        from: name,
        to: upgraded,
        reason: "shared_leading_tokens_with_full_legal_entity",
      });
      return upgraded;
    }
    return name;
  });
}

/** True when intake lists at least two authoritative legal entities (between-clause or explicit). */
export function intakeHasFullLegalEntityParties(
  intakeRaw: string | null | undefined,
  partyNames?: readonly string[] | null,
): boolean {
  const full = resolveCanonicalPartyIdentitiesFromSources({
    rawIntake: intakeRaw,
    starterNames: partyNames,
  }).map((record) => record.fullLegalName);
  const entityCount = full.filter(isAuthoritativeLegalEntityName).length;
  return entityCount >= 2;
}

export function resolveCanonicalPartyIdentitiesFromSources(args: {
  rawIntake?: string | null;
  generatedBody?: string | null;
  starterNames?: readonly string[] | null;
  roleLabels?: readonly string[] | null;
  source?: string;
  surface?: string;
}): CanonicalPartyIdentityRecord[] {
  const starterAuthoritative = authoritativeNamesFromPartyNames(args.starterNames);
  const starterNames = rawStarterNames(args.starterNames);
  const rawIntakeNames = canonicalEntityNamesFromText(args.rawIntake, {
    allowBetweenWithoutSuffix: true,
    knownPartyTokens: starterNames,
  });
  const paidProSotActive = hasPaidProSourceOfTruth();
  const roleLabelsIn = args.roleLabels ?? [];
  const fullCandidatesEarly = [...rawIntakeNames, ...starterAuthoritative];
  const trustedPartyTokensEarly = [...fullCandidatesEarly, ...starterNames];
  if ((args.starterNames?.length ?? 0) >= 2 && roleLabelsIn.length >= 2) {
    const manifestNames = (args.starterNames ?? [])
      .map((n) => {
        const norm = normalizedName(String(n));
        const fromIntakeCandidates = rawIntakeNames
          .filter((r) => partyLegalNamesMatch(norm, r))
          .map((r) => partyNameFromIntakeFragment(r))
          .filter((r) => r.length >= 3);
        if (fromIntakeCandidates.length > 0) {
          fromIntakeCandidates.sort((a, b) => b.length - a.length);
          return cleanManifestLegalName(fromIntakeCandidates[0]!);
        }
        const fromAuth = starterAuthoritative.find((r) => partyLegalNamesMatch(norm, r));
        if (fromAuth) return cleanManifestLegalName(normalizedName(fromAuth));
        const upgraded = upgradeShortNamesToFullLegal([norm], fullCandidatesEarly)[0];
        return cleanManifestLegalName(normalizedName(upgraded || norm));
      })
      .filter(
        (n) =>
          n.length >= 3 &&
          !/^(?:party|parties)$/i.test(n) &&
          !isInvalidCanonicalPartyName(n, trustedPartyTokensEarly),
      );
    if (manifestNames.length >= 2) {
      return manifestNames.slice(0, 12).map((fullLegalName, index) => {
        const full = cleanManifestLegalName(fullLegalName);
        const displayAlias = definedShortNameFromLegalEntity(full);
        return {
          fullLegalName: full,
          roleLabel: roleLabelForIndex(index, roleLabelsIn[index]),
          displayAlias: displayAlias === full ? full.split(/\s+/).slice(0, 2).join(" ") : displayAlias,
          signerName: null,
          signerTitle: null,
          partyAddress: null,
        };
      });
    }
  }
  const generatedBodyNames =
    paidProSotActive
      ? []
      : canonicalEntityNamesFromText(args.generatedBody, {
          requireSuffix: true,
          knownPartyTokens: [...rawIntakeNames, ...starterAuthoritative],
        });
  const fullCandidates = [...rawIntakeNames, ...generatedBodyNames, ...starterAuthoritative];
  const explicitManifestOrder =
    starterAuthoritative.length >= 2 && roleLabelsIn.length >= 2;
  let selected = explicitManifestOrder
    ? starterAuthoritative
    : rawIntakeNames.length >= 2
      ? rawIntakeNames
      : generatedBodyNames.length >= 2
        ? generatedBodyNames
        : starterAuthoritative.length >= 2
          ? starterAuthoritative
          : upgradeShortNamesToFullLegal(starterNames, fullCandidates).filter(hasLegalEntitySuffix);
  const trustedPartyTokens = [...rawIntakeNames, ...starterAuthoritative];
  selected = selected.filter(
    (n) =>
      n.length >= 3 &&
      !/^(?:party|parties)$/i.test(n) &&
      !isInvalidCanonicalPartyName(n, trustedPartyTokens),
  );
  logCanonicalPartySourceCandidates({
    rawIntakeNames,
    generatedBodyNames,
    starterNames,
    selected,
  });
  const fullNames = selected;
  if (fullNames.length < 2) return [];

  logPaidProEntityMap({
    sourceModule: "canonicalPartyIdentityResolver",
    organizations: fullNames.slice(0, 2),
    signers: [],
    noticeRecipients: [],
    affiliates: fullNames.slice(2),
  });

  return fullNames.slice(0, 12).map((fullLegalName, index) => {
    const full = fullLegalName.replace(/\s+/g, " ").trim();
    const displayAlias = definedShortNameFromLegalEntity(full);
    logCanonicalPartyIdentityPreserved({
      canonicalLegalName: full,
      shortDisplayName: displayAlias === full ? null : displayAlias,
      source: args.source || "intake",
      surface: args.surface || "canonicalPartyIdentityResolver",
    });
    return {
      fullLegalName: full,
      roleLabel: roleLabelForIndex(index, args.roleLabels?.[index]),
      displayAlias: displayAlias === full ? full.split(/\s+/).slice(0, 2).join(" ") : displayAlias,
      signerName: null,
      signerTitle: null,
      partyAddress: null,
    };
  });
}

export function resolveCanonicalPartyIdentitiesFromIntake(
  intakeRaw: string | null | undefined,
  partyNames?: readonly string[] | null,
  roleLabels?: readonly string[] | null,
): CanonicalPartyIdentityRecord[] {
  return resolveCanonicalPartyIdentitiesFromSources({
    rawIntake: intakeRaw,
    starterNames: partyNames,
    roleLabels,
  });
}

export function canonicalPartyRecordsFromSignerIdentities(
  identities: readonly SignerCanonicalPartyIdentity[],
): CanonicalPartyIdentityRecord[] {
  return identities
    .map((id, index): CanonicalPartyIdentityRecord | null => {
      const fullLegalName = (id.partyDisplayName || "").replace(/\s+/g, " ").trim();
      if (fullLegalName.length < 3) return null;
      logCanonicalPartyIdentityPreserved({
        canonicalLegalName: fullLegalName,
        shortDisplayName: definedShortNameFromLegalEntity(fullLegalName),
        source: "signer_setup",
        surface: "canonicalPartyIdentityResolver",
      });
      return {
        fullLegalName,
        roleLabel: id.blockHeading?.trim() || roleLabelForIndex(index),
        displayAlias: definedShortNameFromLegalEntity(fullLegalName),
        signerName: id.representativeName?.trim() || null,
        signerTitle: id.title?.trim() || null,
        partyAddress: id.partyAddress?.trim() || null,
      };
    })
    .filter((r): r is CanonicalPartyIdentityRecord => r != null);
}

export function canonicalPartyIdentitiesFromRecords(
  records: readonly CanonicalPartyIdentityRecord[],
): CanonicalPartyIdentity[] {
  return records
    .map((record): CanonicalPartyIdentity | null => {
      const canonicalLegalName = record.fullLegalName.replace(/\s+/g, " ").trim();
      if (!canonicalLegalName) return null;
      const identity: CanonicalPartyIdentity = {
        canonicalLegalName,
      };
      if (record.displayAlias && record.displayAlias !== canonicalLegalName) identity.shortDisplayName = record.displayAlias;
      if (record.signerName) identity.signerName = record.signerName;
      if (record.signerTitle) identity.signerTitle = record.signerTitle;
      if (record.partyAddress) identity.partyAddress = record.partyAddress;
      return identity;
    })
    .filter((record): record is CanonicalPartyIdentity => record != null);
}

export function definedOpeningLine(
  client: CanonicalPartyIdentityRecord,
  provider: CanonicalPartyIdentityRecord,
): string {
  const clientAddress = optionalPartyAddressPhrase(client.partyAddress);
  const providerAddress = optionalPartyAddressPhrase(provider.partyAddress);
  return `This Agreement is between ${client.fullLegalName} ("${client.roleLabel}")${clientAddress} and ${provider.fullLegalName} ("${provider.roleLabel}")${providerAddress}.`;
}

/** Services-style defined opening with explicit "entered into" phrasing. */
export function definedServicesAgreementOpeningLine(
  client: CanonicalPartyIdentityRecord,
  provider: CanonicalPartyIdentityRecord,
): string {
  const clientAddress = optionalPartyAddressPhrase(client.partyAddress);
  const providerAddress = optionalPartyAddressPhrase(provider.partyAddress);
  return `This Services Agreement (the "Agreement") is entered into by and between ${client.fullLegalName} ("${client.roleLabel}")${clientAddress} and ${provider.fullLegalName} ("${provider.roleLabel}")${providerAddress}.`;
}

/** Mutual consulting opening with Effective Date defined at full execution. */
export function definedMutualConsultingAgreementOpeningLine(
  client: CanonicalPartyIdentityRecord,
  provider: CanonicalPartyIdentityRecord,
): string {
  return `This Mutual Consulting and Implementation Agreement ("Agreement") is entered into as of the Effective Date by and between ${client.fullLegalName} ("Client") and ${provider.fullLegalName} ("Service Provider"). The "Effective Date" is the date on which the Agreement has been fully executed by both parties.`;
}

/** Consulting and implementation opening (non-mutual title variant). */
export function definedConsultingAgreementOpeningLine(
  client: CanonicalPartyIdentityRecord,
  provider: CanonicalPartyIdentityRecord,
): string {
  return `This Consulting and Implementation Agreement (the "Agreement") is entered into as of the Effective Date by and between ${client.fullLegalName} ("Client") and ${provider.fullLegalName} ("Service Provider"). The "Effective Date" is the date on which the Agreement has been fully executed by both parties.`;
}

const EFFECTIVE_DATE_DUPLICATE_OPENING_RE =
  /(?:entered\s+into\s+as\s+of\s+the\s+)?Effective\s+Date\s+This\s+Agreement\s+is\s+(?:entered\s+into\s+)?(?:by\s+and\s+)?between/gi;

/** Fused recital after party repair: keep "entered into as of the Effective Date", drop redundant "This Agreement is". */
const FUSED_EFFECTIVE_DATE_REDUNDANT_THIS_AGREEMENT_RE =
  /\bEffective\s+Date\s+This\s+Agreement\s+is\s+between\b/gi;

const IS_IS_BETWEEN_RE = /\bis\s+is\s+between/gi;

/** Repair fused "Effective Date This Agreement is between" and duplicate "is is between". */
export function repairMalformedAgreementOpeningPhrases(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = text;
  if (FUSED_EFFECTIVE_DATE_REDUNDANT_THIS_AGREEMENT_RE.test(out)) {
    FUSED_EFFECTIVE_DATE_REDUNDANT_THIS_AGREEMENT_RE.lastIndex = 0;
    out = out.replace(FUSED_EFFECTIVE_DATE_REDUNDANT_THIS_AGREEMENT_RE, "Effective Date by and between");
    repairs.push("opening:repair_fused_effective_date_this_agreement");
  }
  if (EFFECTIVE_DATE_DUPLICATE_OPENING_RE.test(out)) {
    EFFECTIVE_DATE_DUPLICATE_OPENING_RE.lastIndex = 0;
    out = out.replace(
      EFFECTIVE_DATE_DUPLICATE_OPENING_RE,
      "is entered into as of the Effective Date by and between",
    );
    repairs.push("opening:repair_effective_date_duplicate_phrase");
  }
  if (IS_IS_BETWEEN_RE.test(out)) {
    IS_IS_BETWEEN_RE.lastIndex = 0;
    out = out.replace(IS_IS_BETWEEN_RE, "is between");
    repairs.push("opening:repair_duplicate_is_between");
  }
  return { text: out, repairs };
}

const FUSED_EXECUTION_RECITAL_RE =
  /\)\.execution\s+by\s+both\s+parties\.?/gi;

/** Repair fused ").execution by both parties" after the party clause in malformed openers. */
export function repairFusedExecutionRecitalClause(text: string): { text: string; repairs: string[] } {
  if (!FUSED_EXECUTION_RECITAL_RE.test(text)) {
    return { text, repairs: [] };
  }
  FUSED_EXECUTION_RECITAL_RE.lastIndex = 0;
  return {
    text: text.replace(
      FUSED_EXECUTION_RECITAL_RE,
      '). The "Effective Date" is the date on which the Agreement has been fully executed by both parties.',
    ),
    repairs: ["recital:repair_fused_execution_clause"],
  };
}

function optionalPartyAddressPhrase(address: string | null | undefined): string {
  const clean = String(address ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (/^\[.*\]$/.test(clean)) return "";
  if (/^(?:address|client address|service provider address|principal place of business|principal office|notice address|mailing address|n\/a|none|tbd|not supplied)$/i.test(clean)) {
    return "";
  }
  if (!/[A-Za-z0-9]/.test(clean)) return "";
  return `, with its principal place of business at ${clean}`;
}

export function stripDanglingPartyMetadataFragments(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let next = text;
  const replace = (pattern: RegExp, replacement: string, repair: string) => {
    if (pattern.test(next)) {
      pattern.lastIndex = 0;
      next = next.replace(pattern, replacement);
      repairs.push(repair);
    }
  };
  replace(/,\s*with\s+its\s*(?=(?:and\b|\.|,|\n|$))/gi, "", "party_address:strip_dangling_with_its");
  replace(/\s+with\s+its\s*(?=(?:and\b|\.|,|\n|$))/gi, " ", "party_address:strip_dangling_with_its");
  replace(/,\s*with\s+(?:its\s+)?principal\s+place\s+of\s+business\s+at\s*(?=(?:and\b|\.|,|\n|$))/gi, "", "party_address:strip_empty_principal_place");
  replace(/\s+with\s+(?:its\s+)?principal\s+place\s+of\s+business\s+at\s*(?=(?:and\b|\.|,|\n|$))/gi, " ", "party_address:strip_empty_principal_place");
  next = next
    .replace(/\s+,/g, ",")
    .replace(/,\s+and\b/gi, " and")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ \./g, ".")
    .trim();
  return { text: next, repairs: [...new Set(repairs)] };
}

function stripUnsuppliedAddressPlaceholders(text: string): { text: string; repairs: string[] } {
  const stripped = text
    .replace(ADDRESS_PLACEHOLDER_LINE_RE, "")
    .replace(/,\s*with\s*(?=,|\.)/gi, "")
    .replace(/,\s*with\s+its\s*(?=and\b|\.|,)/gi, "")
    .replace(/\s+with\s+(?=and\b)/gi, " ")
    .replace(/\s*,\s*,/g, ",")
    .replace(/,\s+and\b/gi, " and")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const dangling = stripDanglingPartyMetadataFragments(stripped);
  const next = dangling.text;
  return next === text ? { text, repairs: [] } : { text: next, repairs: ["party_address:strip_unsupplied_placeholder"] };
}

const DUPLICATE_OPENING_DETECT =
  /This\s+[\w\s]+Agreement\s*\(\s*(?:the\s+)?['"]Agreement['"]\s*\)\s+is\s+This\s+Agreement\s+is\s+(?:entered\s+into\s+)?(?:by\s+and\s+)?between/i;
const DUPLICATE_OPENING_REPLACE =
  /This\s+[\w\s]+Agreement\s*\(\s*(?:the\s+)?['"]Agreement['"]\s*\)\s+is\s+This\s+Agreement\s+is\s+(?:entered\s+into\s+)?(?:by\s+and\s+)?between/gi;
const GENERIC_DUPLICATE_OPENING_DETECT =
  /This\s+Agreement\b[\s\S]{0,220}?\bis\s+This\s+Agreement\s+is\s+(?:entered\s+into\s+)?(?:by\s+and\s+)?between/i;
const GENERIC_DUPLICATE_OPENING_REPLACE =
  /This\s+Agreement\b[\s\S]{0,220}?\bis\s+This\s+Agreement\s+is\s+(?:entered\s+into\s+)?(?:by\s+and\s+)?between/gi;

/** Repair "This SERVICES AGREEMENT ... is This Agreement is between..." duplicate opener. */
export function repairDuplicateAgreementOpening(
  text: string,
  records?: readonly CanonicalPartyIdentityRecord[],
): { text: string; repairs: string[] } {
  const hasDup =
    DUPLICATE_OPENING_DETECT.test(text) || GENERIC_DUPLICATE_OPENING_DETECT.test(text);
  if (!hasDup) {
    return { text, repairs: [] };
  }
  DUPLICATE_OPENING_DETECT.lastIndex = 0;
  GENERIC_DUPLICATE_OPENING_DETECT.lastIndex = 0;
  const repairs: string[] = [];
  const replaceAll = (input: string): string => {
    if (records && records.length >= 2) {
      const head = input.slice(0, 2_000);
      const useMutualConsulting = /Mutual\s+Consulting/i.test(head);
      const useConsulting = /Consulting\s+and\s+Implementation/i.test(head);
      const replacement = useMutualConsulting
        ? definedMutualConsultingAgreementOpeningLine(records[0]!, records[1]!)
        : useConsulting
          ? definedConsultingAgreementOpeningLine(records[0]!, records[1]!)
          : definedServicesAgreementOpeningLine(records[0]!, records[1]!);
      let next = input.replace(DUPLICATE_OPENING_REPLACE, () => {
        repairs.push("opening:duplicate_services_agreement_phrase");
        return replacement;
      });
      next = next.replace(GENERIC_DUPLICATE_OPENING_REPLACE, () => {
        repairs.push("opening:duplicate_generic_agreement_phrase");
        return replacement;
      });
      return next;
    }
    let next = input.replace(
      DUPLICATE_OPENING_REPLACE,
      'This $1 Agreement (the "Agreement") is entered into by and between',
    );
    next = next.replace(
      GENERIC_DUPLICATE_OPENING_REPLACE,
      'This Agreement (the "Agreement") is entered into by and between',
    );
    if (next !== input) repairs.push("opening:duplicate_agreement_phrase_generic");
    return next;
  };
  return { text: replaceAll(text), repairs };
}

function suffixContinuationWords(fullLegalName: string): string[] {
  const base = fullLegalName.replace(PARTY_ENTITY_SUFFIX_RE, "").trim();
  const words = base.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [];
  return words.slice(1);
}

/** Replace truncated trade names in operative body with role labels (Client / Service Provider). */
export function replaceTruncatedPartyRefsWithRoleLabels(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
): { text: string; repairs: string[] } {
  if (records.length < 2) return { text, repairs: [] };
  const witnessIdx = text.search(WITNESS_RE);
  const bodyEnd = witnessIdx >= 0 ? witnessIdx : text.length;
  let body = text.slice(0, bodyEnd);
  const tail = text.slice(bodyEnd);
  const repairs: string[] = [];

  const pairs: { short: string; role: string; full: string }[] = [];
  for (const rec of records) {
    const full = rec.fullLegalName.trim();
    const role = rec.roleLabel.trim();
    if (!full || !role) continue;
    const candidates = new Set<string>([
      rec.displayAlias,
      ...shortFormsFromLegalName(full),
    ]);
    for (const short of candidates) {
      if (!short || short.length < 3 || norm(short) === norm(full) || norm(short) === norm(role)) continue;
      pairs.push({ short, role, full });
    }
  }
  pairs.sort((a, b) => b.short.length - a.short.length);

  for (const { short, role, full } of pairs) {
    const suffixWords = suffixContinuationWords(full);
    const suffixAlt =
      suffixWords.length > 0
        ? `(?!\\s+(?:${suffixWords.map(escapeRe).join("|")})\\b)`
        : "";
    const entitySuffixAlt =
      "(?!\\s+(?:LLC|L\\.L\\.C\\.|Inc\\.?|Incorporated|Corp\\.?|Corporation|Ltd\\.?|Limited|LLP|LP|PLLC|Co\\.?|Company)\\b)";
    const re = new RegExp(
      `(?<![@.\\w/])${escapeRe(short)}${suffixAlt}${entitySuffixAlt}(?![\\w@])`,
      "gi",
    );
    const next = body.replace(re, (match, offset) => {
      if (typeof offset !== "number") return role;
      const window = body.slice(Math.max(0, offset - 12), offset + match.length + full.length);
      if (full.toLowerCase().startsWith(match.toLowerCase()) && window.toLowerCase().includes(full.toLowerCase())) {
        return match;
      }
      return role;
    });
    if (next !== body) {
      repairs.push(`party_role_label:${short}->${role}`);
      body = next;
    }
  }

  return { text: body + tail, repairs };
}

/** Paid Pro mutual consulting recitals must never be replaced with generic definedOpeningLine(). */
function shouldPreservePaidProMutualConsultingOpening(
  head: string,
  records: readonly CanonicalPartyIdentityRecord[],
): boolean {
  if (records.length < 2) return false;
  if (/MUTUAL\s+CONSULTING\s+AND\s+IMPLEMENTATION\s+AGREEMENT/i.test(head)) return true;
  if (
    /This\s+Mutual\s+Consulting[\s\S]{0,160}Agreement/i.test(head) &&
    /entered\s+into\s+as\s+of/i.test(head)
  ) {
    return true;
  }
  const client = records[0]!.fullLegalName.trim();
  const provider = records[1]!.fullLegalName.trim();
  if (
    /entered\s+into\s+as\s+of/i.test(head) &&
    /by\s+and\s+between/i.test(head) &&
    head.includes(client) &&
    head.includes(provider)
  ) {
    return true;
  }
  return false;
}

export function repairCanonicalPartyIdentityInCorpus(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
  opts?: { intakeRaw?: string | null; partyNames?: readonly string[] | null },
): { text: string; repairs: string[] } {
  if (records.length < 2) return { text, repairs: [] };
  const repairs: string[] = [];
  const partyNames = records.map((r) => r.fullLegalName);
  const intakeRaw = opts?.intakeRaw ?? null;

  let out = text;
  const address = stripUnsuppliedAddressPlaceholders(out);
  out = address.text;
  repairs.push(...address.repairs);

  const openingRoles = repairOpeningRecitalRoleLabelsFromManifest(out, records);
  out = openingRoles.text;
  repairs.push(...openingRoles.repairs);

  const roleSwap = replaceTruncatedPartyRefsWithRoleLabels(out, records);
  out = roleSwap.text;
  repairs.push(...roleSwap.repairs);

  const expanded = preserveFullLegalPartyNames(out, partyNames, intakeRaw);
  if (expanded !== out) {
    repairs.push("party_identity:expand_short_to_full");
    out = expanded;
  }

  const opening = preserveFullLegalPartyNamesInOpeningAndSignatures(out, partyNames, intakeRaw);
  if (opening !== out) {
    repairs.push("party_identity:opening_signatures_full_legal");
    out = opening;
  }

  const client = records[0]!;
  const provider = records[1]!;
  const witnessIdx = out.search(WITNESS_RE);
  const headLen = witnessIdx >= 0 ? witnessIdx : Math.min(out.length, 4_500);
  let head = out.slice(0, headLen);
  const rest = out.slice(headLen);
  const openingLine = definedOpeningLine(client, provider);
  const openingRe =
    /(?:this\s+agreement\s+is\s+)?(?:entered\s+into\s+)?(?:by\s+and\s+)?between\b[\s\S]{0,400}?(?=\n\n|\n\s*\d+\.|\n[A-Z][A-Z\s]{6,}|$)/i;
  const preservePaidProOpening = shouldPreservePaidProMutualConsultingOpening(head, records);
  if (!preservePaidProOpening && openingRe.test(head)) {
    head = head.replace(openingRe, () => {
      repairs.push("party_identity:defined_opening");
      return openingLine;
    });
  } else if (
    !preservePaidProOpening &&
    (!head.includes(client.fullLegalName) || !head.includes(provider.fullLegalName))
  ) {
    const titleMatch = head.match(/^[\s\S]{0,800}?(?:AGREEMENT|CONTRACT)\s*$/im);
    if (titleMatch?.index != null) {
      const insertAt = titleMatch.index + titleMatch[0].length;
      head = `${head.slice(0, insertAt)}\n\n${openingLine}${head.slice(insertAt)}`;
      repairs.push("party_identity:insert_defined_opening");
    } else {
      head = `${openingLine}\n\n${head}`;
      repairs.push("party_identity:prepend_defined_opening");
    }
  }
  out = head + rest;

  return { text: out, repairs: [...new Set(repairs)] };
}

export function repairFullAgreementPartyIdentity(args: {
  text: string;
  intakeRaw?: string | null;
  partyNames?: readonly string[] | null;
  roleLabels?: readonly string[] | null;
  signerIdentities?: readonly SignerCanonicalPartyIdentity[];
}): { text: string; repairs: string[] } {
  const fromSigner =
    args.signerIdentities && args.signerIdentities.length >= 2
      ? canonicalPartyRecordsFromSignerIdentities(args.signerIdentities)
      : [];
  const records =
    fromSigner.length >= 2
      ? fromSigner
      : resolveCanonicalPartyIdentitiesFromSources({
          rawIntake: args.intakeRaw,
          generatedBody: null,
          starterNames: args.partyNames,
          roleLabels: args.roleLabels,
        });
  return repairCanonicalPartyIdentityInCorpus(args.text, records, {
    intakeRaw: args.intakeRaw,
    partyNames: args.partyNames,
  });
}

/** Guided Q&A: do not ask for legal names when intake already supplies them. */
export function shouldSuppressPartyLegalNamesGuidedQuestion(
  intakeRaw: string | null | undefined,
  body?: string | null,
): boolean {
  if (!intakeHasFullLegalEntityParties(intakeRaw)) return false;
  const opening = (body || "").slice(0, 1500);
  if (/\b(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|LLP|LP)\b/i.test(opening)) {
    return true;
  }
  const between = extractBetweenPartyNameList(String(intakeRaw || ""));
  return between.filter(isAuthoritativeLegalEntityName).length >= 2;
}

/** Simple fixed-fee services intake — no milestone / Schedule A injection. */
export function intakeSpecifiesSimpleFixedFee(
  intakeRaw: string | null | undefined,
  _body?: string | null,
): boolean {
  const intakeBlob = String(intakeRaw || "");
  if (!/\$\s*[\d,]{3,}/.test(intakeBlob)) return false;
  if (
    /\b(?:milestone|schedule\s+a|phase\s+(?:\d|one|two|three|acceptance)|installment|40\s*%|30\s*%)\b/i.test(
      intakeBlob,
    )
  ) {
    return false;
  }
  return true;
}

const TOP_LEVEL_HEADING_RE = /^(\d+)\.\s+(?!\d)(.+?)\.?\s*$/;

const SCHEDULE_A_FIXED_FEE_LINE_RE =
  /\b(?:payments?\s+are\s+due\s+according\s+to\s+the\s+milestone|milestone\s+and\s+phase\s+acceptance\s+triggers?\s+stated\s+in\s+schedule\s+a|according\s+to\s+the\s+milestone\s+and\s+phase)/i;

const SERVICE_PROVIDER_BOILERPLATE_BULLET_RE =
  /^\s*[-•*]?\s*service\s+provider\s+will\s+provide\s+the\s+services\s+and\s+deliverables\s+described\s+in\s+this\s+agreement\.?\s*$/i;

const MONTHLY_ARREARS_RE =
  /\b(?:monthly\s+in\s+arrears|in\s+monthly\s+arrears|billed\s+monthly\s+in\s+arrears|fees?\s+(?:are|is)\s+payable\s+monthly\s+in\s+arrears)\b/i;

const SCHEDULE_A_BLOCK_RE = /^\s*schedule\s+a\b/i;

const MILESTONE_PHASE_RE =
  /\b(?:milestone\s+acceptance|phase\s+(?:\d|one|two|three)\s+acceptance|installment\s+schedule|acceptance\s+trigger)\b/i;

const VAGUE_FEE_LATER_RE =
  /\b(?:fees?\s+(?:and\s+)?rates?\s+(?:are|is)\s+to\s+be\s+documented|to\s+be\s+documented\s+later|as\s+mutually\s+agreed\s+in\s+a\s+separate\s+schedule)\b/i;

/** Strip irrelevant milestone/Schedule A / monthly-arrears lines for simple fixed-fee intakes. */
export function stripIrrelevantFixedFeeBoilerplate(
  text: string,
  intakeRaw: string | null | undefined,
): { text: string; repairs: string[] } {
  if (!intakeSpecifiesSimpleFixedFee(intakeRaw, text)) return { text, repairs: [] };
  const repairs: string[] = [];
  const lines = text.split("\n");
  let skippingScheduleBlock = false;
  const kept = lines.filter((line) => {
    const t = line.trim();
    if (SCHEDULE_A_BLOCK_RE.test(t)) {
      skippingScheduleBlock = true;
      repairs.push("fixed_fee:strip_schedule_a_heading");
      return false;
    }
    if (skippingScheduleBlock) {
      if (!t || TOP_LEVEL_HEADING_RE.test(t) || /^\d+\.\d+/.test(t)) {
        skippingScheduleBlock = false;
      } else {
        repairs.push("fixed_fee:strip_schedule_a_body");
        return false;
      }
    }
    if (SCHEDULE_A_FIXED_FEE_LINE_RE.test(t)) {
      repairs.push("fixed_fee:strip_schedule_a_milestone_line");
      return false;
    }
    if (MONTHLY_ARREARS_RE.test(t)) {
      repairs.push("fixed_fee:strip_monthly_arrears");
      return false;
    }
    if (MILESTONE_PHASE_RE.test(t)) {
      repairs.push("fixed_fee:strip_milestone_phase");
      return false;
    }
    if (VAGUE_FEE_LATER_RE.test(t)) {
      repairs.push("fixed_fee:strip_vague_fee_later");
      return false;
    }
    if (SERVICE_PROVIDER_BOILERPLATE_BULLET_RE.test(t)) {
      repairs.push("fixed_fee:strip_sp_boilerplate_bullet");
      return false;
    }
    return true;
  });
  return { text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), repairs };
}
