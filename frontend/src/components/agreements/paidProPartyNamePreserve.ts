/**
 * Restore full legal entity names in paid-Pro bodies when the model shortened them.
 * Email-safe: masks addresses before any party-label replacement.
 */

import { dedupeEntityCandidatesToLegalParties, extractAgreementEntityCandidates } from "../../agreement/partyPlaceholderDisplay";
import { labeledPartyLegalEntities, quotedRolePartyLegalEntities } from "./labeledPartyBlockParse";
import {
  extractBetweenPartyNameListForAuthority,
  isBetweenClausePartyCandidate,
} from "./partyBetweenParse";
import { looksLikeAuthorizedSignersBulletLine } from "./intakeSignerMetadataAuthority";
import { isolateLegalEntityFromContaminatedName } from "./starterPartyIdentityIsolation";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { maskEmailAddresses, unmaskEmailAddresses } from "./paidProEmailMask";
import { US_STATE_NAMES_ENGLISH } from "./partyFormat";

const IF_TO_NOTICE_HEADER_RE = /^If to\s+(.+?)\s*:?\s*$/i;

export type PaidProNoticeBlockLogPayload = {
  partyId: string;
  legalEntity: string;
  noticeRecipient: string;
  noticeAddress: string;
  renderedLines: string[];
};

export function logPaidProNoticeBlock(payload: PaidProNoticeBlockLogPayload): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-notice-block]", payload);
}

function isStandaloneNoticeEntityPhrase(line: string, fullNames: readonly string[]): boolean {
  const t = line.trim().replace(/:$/, "").trim();
  if (!t || t.length > 120) return false;
  return fullNames.some((full) => partyLegalNamesMatch(t, full));
}

function isLikelyDuplicatedEntityLine(line: string, fullNames: readonly string[]): boolean {
  const t = line.trim().replace(/:$/, "").trim();
  if (!t || /\b(?:shall|will|must|may|agrees?)\b/i.test(t)) return false;
  return fullNames.some((full) => {
    const doubled = `${full} ${full}`;
    return partyLegalNamesMatch(t, doubled) || t.toLowerCase() === doubled.toLowerCase();
  });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Collapse adjacent duplicate legal-entity phrases (malformed notice headers / entity lines). */
export function collapseDuplicatedLegalEntityPhrase(
  phrase: string,
  fullNames?: readonly string[],
): string {
  let out = (phrase || "").replace(/\s+/g, " ").trim();
  if (!out) return out;
  const names = (fullNames ?? []).filter((n) => n.trim().length >= 2);
  for (const full of names) {
    const escaped = escapeRe(full.trim());
    const re = new RegExp(`(${escaped})\\s+\\1`, "gi");
    if (re.test(out)) {
      re.lastIndex = 0;
      out = out.replace(re, "$1");
    }
    if (partyLegalNamesMatch(out, `${full} ${full}`)) {
      out = full.trim();
    }
  }
  return out.trim();
}

/** Normalize duplicated phrases inside `If to …:` header lines. */
export function collapseDuplicatedIfToHeaderLines(text: string, fullNames: readonly string[]): string {
  if (!text || fullNames.length < 1) return text;
  const lines = text.split("\n");
  let changed = false;
  const out = lines.map((line) => {
    const trimmed = line.trim();
    const match = trimmed.match(/^If to\s+(.+?)\s*:?\s*$/i);
    if (!match?.[1]) return line;
    const entity = collapseDuplicatedLegalEntityPhrase(match[1].trim(), fullNames);
    const normalized = `If to ${entity}:`;
    if (trimmed === normalized) return line;
    changed = true;
    const indent = line.match(/^\s*/)?.[0] ?? "";
    return `${indent}${normalized}`;
  });
  return changed ? out.join("\n") : text;
}

/** Collapse duplicated entity phrases on standalone lines (outside notice block repair). */
export function collapseStandaloneDuplicatedEntityLines(
  text: string,
  fullNames: readonly string[],
): string {
  if (!text || fullNames.length < 1) return text;
  const lines = text.split("\n");
  let changed = false;
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!isLikelyDuplicatedEntityLine(trimmed, fullNames)) return line;
    const collapsed = collapseDuplicatedLegalEntityPhrase(trimmed.replace(/:$/, "").trim(), fullNames);
    const normalized = trimmed.endsWith(":") ? `${collapsed}:` : collapsed;
    if (trimmed === normalized) return line;
    changed = true;
    const indent = line.match(/^\s*/)?.[0] ?? "";
    return `${indent}${normalized}`;
  });
  return changed ? out.join("\n") : text;
}

function isNoticeAddresseeEntityLine(line: string, fullNames: readonly string[], headerEntity: string): boolean {
  const trimmed = line.trim().replace(/:$/, "").trim();
  if (!trimmed || /^Attn:/i.test(trimmed)) return false;
  if (isLikelyDuplicatedEntityLine(trimmed, fullNames)) return true;
  if (headerEntity && partyLegalNamesMatch(trimmed, headerEntity)) return true;
  if (isStandaloneNoticeEntityPhrase(trimmed, fullNames)) return true;
  return fullNames.some((full) => partyLegalNamesMatch(trimmed, full));
}

/**
 * Notice stanzas often repeat the legal entity in the "If to …:" header and body lines.
 * Short-label expansion can introduce a second canonical entity line — drop consecutive dupes at source.
 */
export function collapseDuplicateNoticeEntityLines(text: string, fullNames: readonly string[]): string {
  if (!text || fullNames.length < 1) return text;
  let working = collapseDuplicatedIfToHeaderLines(text, fullNames);
  working = collapseStandaloneDuplicatedEntityLines(working, fullNames);
  const lines = working.split("\n");
  const out: string[] = [];
  let inNoticeBlock = false;
  let sawEntityLineInBlock = false;
  let headerEntity = "";
  let blockRenderedLines: string[] = [];
  let removedDuplicateInBlock = false;

  const flushNoticeLog = () => {
    if (!headerEntity || blockRenderedLines.length === 0) return;
    if (!removedDuplicateInBlock && typeof import.meta !== "undefined" && !import.meta.env?.DEV) return;
    logPaidProNoticeBlock({
      partyId: headerEntity,
      legalEntity: headerEntity,
      noticeRecipient: blockRenderedLines.find((l) => /^Attn:/i.test(l)) ?? "",
      noticeAddress: blockRenderedLines.find((l) => /^Address/i.test(l)) ?? "",
      renderedLines: blockRenderedLines,
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const ifToMatch = trimmed.match(IF_TO_NOTICE_HEADER_RE);

    if (ifToMatch) {
      if (inNoticeBlock) flushNoticeLog();
      inNoticeBlock = true;
      sawEntityLineInBlock = false;
      headerEntity = collapseDuplicatedLegalEntityPhrase((ifToMatch[1] ?? "").trim(), fullNames);
      const normalizedHeader = `If to ${headerEntity}:`;
      blockRenderedLines = [normalizedHeader];
      removedDuplicateInBlock = false;
      if (trimmed === normalizedHeader) {
        out.push(line);
      } else {
        const indent = line.match(/^\s*/)?.[0] ?? "";
        out.push(`${indent}${normalizedHeader}`);
      }
      continue;
    }

    if (inNoticeBlock) {
      if (!trimmed) {
        flushNoticeLog();
        inNoticeBlock = false;
        sawEntityLineInBlock = false;
        headerEntity = "";
        blockRenderedLines = [];
        out.push(line);
        continue;
      }
      if (/^Attn:/i.test(trimmed) || /^Email(?:\s+for\s+Notice)?\s*:/i.test(trimmed)) {
        blockRenderedLines.push(trimmed);
        flushNoticeLog();
        inNoticeBlock = false;
        sawEntityLineInBlock = false;
        headerEntity = "";
        blockRenderedLines = [];
        out.push(line);
        continue;
      }
      if (isNoticeAddresseeEntityLine(trimmed, fullNames, headerEntity)) {
        if (sawEntityLineInBlock) {
          removedDuplicateInBlock = true;
          continue;
        }
        sawEntityLineInBlock = true;
        blockRenderedLines.push(trimmed);
        out.push(line);
        continue;
      }
      if (/^Section\s+\d+/i.test(trimmed) || /^[A-Z][A-Z\s]{6,}$/.test(trimmed)) {
        flushNoticeLog();
        inNoticeBlock = false;
        sawEntityLineInBlock = false;
        headerEntity = "";
        blockRenderedLines = [];
      }
    }

    out.push(line);
  }

  if (inNoticeBlock) flushNoticeLog();
  return out.join("\n");
}

const ENTITY_SUFFIX =
  /\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|Co\.?|Company)\.?$/i;

const US_STATE_ALT = US_STATE_NAMES_ENGLISH.map((n) => n.replace(/\s+/g, "\\s+")).join("|");

/**
 * TEST550 — a legal-form appositive such as "a Texas LLC" or "an Illinois LLC" describes an
 * entity's jurisdiction and organizational form, not its name. When the body/intake writes
 * "Summit AI Consulting LLC, a Texas LLC", a comma-split extractor promotes the bare "Texas LLC"
 * fragment to a phantom party (shifting slot 3/4 and dropping a real party). Reject names whose
 * only distinctive token is a US state followed by a legal-form suffix. A real name that merely
 * contains a state word ("Texas Instruments Inc", "New York Life Insurance Company") carries
 * additional distinctive tokens and is preserved.
 */
const STATE_LEGAL_FORM_ONLY_RE = new RegExp(
  `^(?:(?:a|an|the)\\s+)?(?:${US_STATE_ALT})\\s+(?:limited\\s+liability\\s+company|professional\\s+(?:limited\\s+liability\\s+)?(?:company|corporation)|public\\s+benefit\\s+corporation|general\\s+partnership|limited\\s+partnership|LLC|L\\.L\\.C\\.|Inc\\.?|Incorporated|Corp\\.?|Corporation|Ltd\\.?|Limited|LP|L\\.P\\.|LLP|PLLC|PC|PBC|Co\\.?|Company)\\.?$`,
  "i",
);

/** True when the label is only "[a/an/the] <US state> <legal-form suffix>" — a jurisdiction/form appositive, never a party name. */
export function isStateLegalFormOnlyName(name: string): boolean {
  const t = (name || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  return STATE_LEGAL_FORM_ONLY_RE.test(t);
}

export const PREAMBLE_MAX_LEN = 4_500;

/** Candidate short labels that may appear instead of the full legal name. */
export function shortFormsFromLegalName(full: string): string[] {
  const t = (full || "").replace(/\s+/g, " ").trim();
  if (t.length < 4) return [];
  const forms: string[] = [];
  const withoutSuffix = t.replace(ENTITY_SUFFIX, "").trim();
  if (withoutSuffix && withoutSuffix.length >= 3 && withoutSuffix !== t) {
    forms.push(withoutSuffix);
    const words = withoutSuffix.split(/\s+/);
    if (words.length >= 2) {
      forms.push(`${words[0]} ${words[1]}`);
    }
    const first = words[0];
    if (first && first.length >= 3) forms.push(first);
  }
  return [...new Set(forms)].filter((f) => f.length >= 3 && f.length < t.length).sort((a, b) => b.length - a.length);
}

/** Hard cap for paid-Pro recital/signature party lists (never body-derived phrase lists). */
export const MAX_AUTHORITATIVE_RECITAL_PARTIES = 12;

const DISALLOWED_PARTY_PHRASE_RE: readonly RegExp[] = [
  /^the\s+parties$/i,
  /^collectively$/i,
  /^each\s+a\s+["']?party["']?$/i,
  /^party$/i,
  /^parties$/i,
  /^the$/i,
  /^agreement$/i,
  /^ownership\s+of\b/i,
  /^implementation\b/i,
  /^implementation\s+support$/i,
  /^process\s+documentation$/i,
  /^configuration\s+assistance$/i,
  /^training\s+services\b/i,
  /^staff\s+training\b/i,
  /^automation\s+deployment\s+services\b/i,
  /^ai\s+workflow\s+consulting$/i,
  /\bwill\s+(?:sign|provide)\b/i,
  /\bengagement\s+term\b/i,
  /\(["']party["']\)/i,
  /^milestone\s+approvals?$/i,
  /^technical\s+specifications?$/i,
  /^or\s+other\b/i,
  /^project\s+deliverables?$/i,
  /^deliverables?$/i,
  /^licensing\s+revenue$/i,
  /^information\s+known\s+at\s+intake$/i,
  /^party\s+information\s+known\s+at\s+intake$/i,
  /^confidentiality\s+applies$/i,
  /^revenue\s+sharing$/i,
  /^applicable\s+party$/i,
  /\bthe\s+applicable\s+party\b/i,
  /^for\s+analytics\s+services$/i,
  /^will\s+keep\s+confidential\b/i,
  /^software\s+platform\s+agreement$/i,
  /\bsoftware\s+platform\s+agreement\b/i,
  /^shared\s+warehouse\s+automation$/i,
  /\bshared\s+warehouse\s+automation\b/i,
  /licensing\s+revenue\s+will\s+be\s+shared/i,
  /^signer\s+unknown$/i,
  /^\[org_\d+\]$/i,
  /^\[email_\d+\]$/i,
  /^total\s+contract\s+value:?/i,
  /^contract\s+value:?/i,
  /^total\s+project\s+fee:?/i,
];

function normPartyLabel(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * TEST536 — signer/contact metadata field labels are never party legal entities.
 * `Address: 710 Discovery Parkway…`, `Authorized Signer: Dana Whitfield`, `Email: …` are
 * per-party metadata blocks, not parties. Without this guard the address line's
 * capitalized tokens satisfy the generic "all words capitalized" heuristic below and leak
 * in as a phantom party while the real Party 1 (Client) drops out.
 */
const PARTY_METADATA_FIELD_LABEL_PREFIX_RE =
  /^(?:address|physical\s+address|mailing\s+address|party\s+address|authorized\s+signer|signer\s+name|signer\s+title|signer\s+email|representative(?:\s+name|\s+title)?|represented\s+by|human\s+signer|e-?mail|email(?:\s+for\s+notice)?|attn|attention|phone|tel|telephone|fax|contact|title|name)\s*[:\-]/i;

/** True when the raw line is a per-party metadata field ("Address: …", "Email: …"), not an entity. */
export function isPartyMetadataFieldLabelValue(name: string): boolean {
  return PARTY_METADATA_FIELD_LABEL_PREFIX_RE.test((name || "").replace(/\s+/g, " ").trim());
}

/**
 * TEST537 — a colon-role manifest line ("Address: 710 …", "Signer Title: CEO") carries a
 * per-party metadata field as its role label. Such lines must never seed a legal-party manifest
 * row; only real role labels ("Client", "Lead Provider") may. This checks the bare label
 * (no trailing colon) captured by the colon-role parser.
 */
const PARTY_METADATA_ROLE_LABEL_RE =
  /^(?:address|physical\s+address|mailing\s+address|party\s+address|registered\s+address|principal\s+address|authorized\s+signer|signatory|signer(?:\s+name|\s+title|\s+email)?|representative(?:\s+name|\s+title)?|represented\s+by|human\s+signer|e-?mail|email(?:\s+for\s+notice)?|notice\s+email|contact\s+email|attn|attention|phone|tel|telephone|mobile|fax|contact|title|name|role|by)$/i;

export function isPartyMetadataRoleLabel(roleLabel: string): boolean {
  return PARTY_METADATA_ROLE_LABEL_RE.test((roleLabel || "").replace(/\s+/g, " ").trim().replace(/:$/, ""));
}

/**
 * Bare signer/contact field tokens that must never become party legal names
 * (alone or fused onto a real party: "Alex Rivera Role", "PixelForge Labs Attn").
 */
const PARTY_METADATA_TOKEN_RE =
  /^(?:address|attn|attention|role|e-?mail|email|by|name|title|phone|tel|telephone|mobile|fax|contact|signatory|signer)$/i;

export function isPartyMetadataToken(token: string): boolean {
  return PARTY_METADATA_TOKEN_RE.test((token || "").replace(/\s+/g, " ").trim().replace(/:$/, ""));
}

/** True when a candidate party name is a field label or ends with a fused field-label token. */
export function hasPartyMetadataLabelContamination(name: string): boolean {
  const t = (name || "").replace(/\s+/g, " ").trim().replace(/:$/, "");
  if (!t) return false;
  if (isPartyMetadataFieldLabelValue(t) || isPartyMetadataRoleLabel(t) || isPartyMetadataToken(t)) {
    return true;
  }
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && isPartyMetadataToken(words[words.length - 1]!)) return true;
  return false;
}

/** Strip a trailing fused metadata token ("Alex Rivera Role" → "Alex Rivera"). */
export function stripTrailingPartyMetadataLabel(name: string): string {
  const t = (name || "").replace(/\s+/g, " ").trim().replace(/:$/, "");
  if (!t) return "";
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2) return hasPartyMetadataLabelContamination(t) ? "" : t;
  if (!isPartyMetadataToken(words[words.length - 1]!)) return t;
  return words.slice(0, -1).join(" ").trim();
}

/**
 * Job-title / occupational phrases from intake appositives
 * ("Alex Rivera, freelance product designer") must never become a third party slot.
 */
const OCCUPATIONAL_OR_JOB_TITLE_PARTY_RE =
  /^(?:(?:a|an|the)\s+)?(?:freelance|independent)?\s*(?:product\s+|ui\s+|ux\s+|graphic\s+|web\s+|software\s+|mobile\s+)?(?:designer|developer|engineer|consultant|contractor|freelancer|attorney|lawyer|accountant|ceo|cto|cfo|coo|founder|president|manager|director|officer|analyst|specialist|architect)(?:\s+(?:and|&)\s+[a-z]+)?$/i;

export function isOccupationalOrJobTitlePartyName(name: string): boolean {
  const t = (name || "").replace(/\s+/g, " ").trim();
  if (!t || t.length < 3) return false;
  if (ENTITY_SUFFIX.test(t)) return false;
  if (OCCUPATIONAL_OR_JOB_TITLE_PARTY_RE.test(t)) return true;
  // Bare title tokens that leak as party rows.
  return /^(?:ceo|cto|cfo|coo|founder|president|director|manager|officer)$/i.test(t);
}

/** Reject contract prose fragments mistaken for party names. */
export function isDisallowedPartyPhrase(name: string): boolean {
  const t = normPartyLabel(name);
  if (!t || t.length < 3) return true;
  if (/^party\s*\d+$/i.test(t)) return true;
  return DISALLOWED_PARTY_PHRASE_RE.some((re) => re.test(t));
}

/** True when the label looks like a full legal entity (intake-authoritative), not body prose or titles. */
export function isAuthoritativeLegalEntityName(name: string): boolean {
  const raw = (name || "").replace(/\s+/g, " ").trim();
  if (looksLikeAuthorizedSignersBulletLine(raw)) return false;
  if (hasPartyMetadataLabelContamination(raw)) return false;
  if (isOccupationalOrJobTitlePartyName(raw)) return false;
  if (isPartyMetadataFieldLabelValue(raw)) return false;
  if (isStateLegalFormOnlyName(raw)) return false;
  const t = isolateLegalEntityFromContaminatedName(raw);
  if (t.length < 3 || isDisallowedPartyPhrase(t)) return false;
  if (hasPartyMetadataLabelContamination(t)) return false;
  if (isOccupationalOrJobTitlePartyName(t)) return false;
  if (isStateLegalFormOnlyName(t)) return false;
  if (isPartyMetadataFieldLabelValue(t)) return false;
  if (/^(?:my|our|the|your|their|each|both|either)\s+company$/i.test(t)) return false;
  if (/^(?:client|customer|vendor|contractor|service\s+provider|provider|party\s*[ab])$/i.test(t)) {
    return false;
  }
  if (ENTITY_SUFFIX.test(t)) return true;
  if (/\bagreement\b/i.test(t) && !ENTITY_SUFFIX.test(t)) return false;
  if (
    /\b(?:revenue|licensing|confidential|governed|platform|implementation)\b/i.test(t) &&
    !ENTITY_SUFFIX.test(t)
  ) {
    return false;
  }
  const words = t.split(/\s+/);
  return words.length >= 3 && words.every((w) => /^[A-Z0-9]/.test(w) || /^[&.,'-]+$/.test(w));
}

/** Authoritative ordered full legal parties from intake "between …" list or explicit partyNames. */
export function resolveFullLegalPartiesFromIntake(
  partyNames: readonly string[] | null | undefined,
  intakeRaw: string | null | undefined,
): string[] {
  const intake = String(intakeRaw || "").trim();
  const fromLabeled = labeledPartyLegalEntities(intake).filter(isAuthoritativeLegalEntityName);
  const fromQuoted = quotedRolePartyLegalEntities(intake).filter(isAuthoritativeLegalEntityName);
  if (fromQuoted.length >= 3) return fromQuoted;
  if (fromLabeled.length >= 3) return fromLabeled;
  if (fromQuoted.length === 2) return fromQuoted;
  if (fromLabeled.length === 2) return fromLabeled;
  const fromBetween = extractBetweenPartyNameListForAuthority(intake).filter(
    (n) => isAuthoritativeLegalEntityName(n) || isBetweenClausePartyCandidate(n),
  );
  const betweenDeduped = dedupeEntityCandidatesToLegalParties(fromBetween);
  const entityPool = dedupeEntityCandidatesToLegalParties(
    extractAgreementEntityCandidates(intake).filter(isAuthoritativeLegalEntityName),
  );
  const explicitMultiParty =
    fromLabeled.length >= 3 || fromQuoted.length >= 3 || fromBetween.length >= 3 || entityPool.length >= 3;
  if (betweenDeduped.length === 2 && !explicitMultiParty) return betweenDeduped;
  if (betweenDeduped.length > 2) return betweenDeduped;
  const fromIntakeEntities = extractAgreementEntityCandidates(intake).filter(isAuthoritativeLegalEntityName);
  if (fromIntakeEntities.length >= 2) return fromIntakeEntities;
  const fromArgs = (partyNames || [])
    .map((n) => isolateLegalEntityFromContaminatedName(String(n || "").replace(/\s+/g, " ").trim()))
    .filter((n) => n.length >= 3);
  const authoritativeArgs = fromArgs.filter(isAuthoritativeLegalEntityName);
  if (authoritativeArgs.length >= 2) return authoritativeArgs;
  if (fromArgs.length >= 2) return fromArgs;
  return extractAgreementEntityCandidates(intake);
}

/**
 * Recital/signature polish: intake-authoritative entities only — never draft.parties[] blobs
 * or body-derived phrase lists from generated agreement text.
 */
export function resolveAuthoritativePartiesForRecitalPolish(
  partyNames: readonly string[] | null | undefined,
  intakeRaw: string | null | undefined,
): string[] {
  const intake = String(intakeRaw || "").trim();
  const fromLabeled = labeledPartyLegalEntities(intake).filter(isAuthoritativeLegalEntityName);
  const fromBetween = extractBetweenPartyNameListForAuthority(intake).filter(
    (n) => isAuthoritativeLegalEntityName(n) || isBetweenClausePartyCandidate(n),
  );
  const fromIntakeEntities = extractAgreementEntityCandidates(intake).filter(isAuthoritativeLegalEntityName);

  let authoritative: string[] = [];
  if (fromLabeled.length >= 2) {
    authoritative = fromLabeled;
  } else if (fromBetween.length >= 2) {
    authoritative = fromBetween;
  } else if (fromIntakeEntities.length >= 2) {
    authoritative = fromIntakeEntities;
  }

  const fromArgs = (partyNames || [])
    .map((n) => String(n || "").replace(/\s+/g, " ").trim())
    .filter(isAuthoritativeLegalEntityName);

  const rawArgCount = (partyNames || []).map((n) => String(n || "").trim()).filter((n) => n.length >= 2).length;

  if (authoritative.length >= 2) {
    if (rawArgCount > authoritative.length + 1) {
      return authoritative.slice(0, MAX_AUTHORITATIVE_RECITAL_PARTIES);
    }
    return authoritative.slice(0, MAX_AUTHORITATIVE_RECITAL_PARTIES);
  }

  if (fromArgs.length >= 2 && fromArgs.length <= MAX_AUTHORITATIVE_RECITAL_PARTIES) {
    return fromArgs;
  }

  return [];
}

function expandShortPartyLabelsToFullLegal(text: string, fullNames: readonly string[]): string {
  const pairs: { short: string; full: string }[] = [];
  for (const full of fullNames) {
    if (!full || full.length < 4) continue;
    for (const short of shortFormsFromLegalName(full)) {
      if (short && short !== full) pairs.push({ short, full });
    }
  }
  pairs.sort((a, b) => b.short.length - a.short.length);

  const noticesRegionStart = text.search(
    /(?:^|\n)\s*\d+(?:\.\d+)?\.?\s*(?:Notices|Notice\s+Addresses?|Governing\s+Law,\s*Venue\s+and\s+Notices)\b/i,
  );
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const noticesRegionEnd = witnessIdx >= 0 ? witnessIdx : text.length;

  const isRoleLabelInNoticeRegion = (offset: number, match: string): boolean => {
    if (noticesRegionStart < 0 || offset < noticesRegionStart || offset >= noticesRegionEnd) {
      return false;
    }
    return /^(?:Client|Service\s+Provider|Party\s+\d+)$/i.test(match.trim());
  };

  let out = text;
  for (const { short, full } of pairs) {
    const re = new RegExp(
      `(?<![@.\\w/])${escapeRe(short)}(?![\\w@])(?!\\s*(?:LLC|L\\.L\\.C\\.|Inc\\.?|Incorporated|Corp\\.?|Corporation|Ltd\\.?|Limited|LLP|LP)\\b)`,
      "gi",
    );
    const next = out.replace(re, (match, offset) => {
      if (typeof offset !== "number") return full;
      if (isRoleLabelInNoticeRegion(offset, match)) return match;
      const window = out.slice(Math.max(0, offset - 8), offset + match.length + 16);
      if (/\[\[LDG_(?:EMAIL|URL)_\d+\]\]/i.test(window)) return match;
      const tail = out.slice(offset + match.length);
      const remainder = full.slice(match.length);
      if (remainder && tail.toLowerCase().startsWith(remainder.toLowerCase())) return match;
      if (out.slice(offset).toLowerCase().startsWith(full.toLowerCase())) return match;
      return full;
    });
    if (next !== out) out = next;
  }
  return out;
}

function preserveInSlice(slice: string, fullNames: readonly string[]): string {
  const { text: masked, emails } = maskEmailAddresses(slice);
  const expanded = expandShortPartyLabelsToFullLegal(masked, fullNames);
  const deduped = collapseDuplicateNoticeEntityLines(expanded, fullNames);
  return unmaskEmailAddresses(deduped, emails);
}

/**
 * Expand short party labels to full legal names across the document (email-safe).
 * Used before contact placeholder substitution.
 */
export function preserveFullLegalPartyNames(
  text: string,
  partyNames: readonly string[] | null | undefined,
  intakeRaw?: string | null,
): string {
  const fullNames = resolveFullLegalPartiesFromIntake(partyNames, intakeRaw);
  if (fullNames.length < 2) return text;
  return preserveInSlice(text, fullNames);
}

/**
 * Opening recital + signature/execution tail: full legal entity headings, not contact names.
 */
export function preserveFullLegalPartyNamesInOpeningAndSignatures(
  text: string,
  partyNames: readonly string[] | null | undefined,
  intakeRaw?: string | null,
): string {
  const fullNames = resolveFullLegalPartiesFromIntake(partyNames, intakeRaw);
  if (fullNames.length < 2) return text;

  const sigMarker = text.search(/\b(?:IN WITNESS WHEREOF|SIGNATURES?|EXECUTION)\b/i);
  const preambleCap = Math.min(text.length, PREAMBLE_MAX_LEN);
  const headEnd = sigMarker >= 0 && sigMarker < preambleCap ? sigMarker : preambleCap;

  let result = preserveInSlice(text.slice(0, headEnd), fullNames);

  const midStart = headEnd;
  const midEnd = sigMarker >= 0 ? sigMarker : text.length;

  if (midStart < midEnd) {
    const midSlice = text.slice(midStart, midEnd);
    const noticesMatch = midSlice.search(
      /(?:^|\n)\s*\d+(?:\.\d+)?\.?\s*(?:Notices?|Notice\s+Addresses?)\b/i,
    );
    if (noticesMatch >= 0) {
      const beforeNotices = midSlice.slice(0, noticesMatch);
      const noticesRegion = preserveInSlice(midSlice.slice(noticesMatch), fullNames);
      result += beforeNotices + noticesRegion;
    } else {
      result += midSlice;
    }
  }

  if (sigMarker >= 0) {
    result += preserveInSlice(text.slice(sigMarker), fullNames);
  } else if (midEnd < text.length) {
    result += text.slice(midEnd);
  }

  return result;
}

/** @deprecated Prefer preserveFullLegalPartyNamesInOpeningAndSignatures */
export function preserveFullLegalPartyNamesInOpening(
  text: string,
  partyNames: readonly string[] | null | undefined,
  intakeRaw?: string | null,
): string {
  return preserveFullLegalPartyNamesInOpeningAndSignatures(text, partyNames, intakeRaw);
}
