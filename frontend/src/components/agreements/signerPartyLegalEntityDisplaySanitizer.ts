/**
 * Display-only sanitizer for Paid Pro signer-setup legal entity fields.
 * Strips clause headings, recital fragments, and scope verbs from extracted party labels.
 * Never mutates agreement corpus, SoT, recital, or execution blocks.
 */

import { PARTY_ENTITY_SUFFIX_RE } from "./canonicalPartyIdentityResolver";
import {
  looksLikeAuthorizedSignersBulletLine,
  stripAuthorizedSignersBulletLegalEntity,
} from "./intakeSignerMetadataAuthority";
import {
  hasPartyMetadataLabelContamination,
  stripTrailingPartyMetadataLabel,
} from "./paidProPartyNamePreserve";

const LEADING_CONNECTOR_CHAIN_RE =
  /^(?:(?:and|between)\s+)*(?:(?:engages?|hires?|retains?|appoints?|contracts?\s+with)\s+)+/i;

const SINGLE_LEADING_VERB_RE = /^(?:engages?|hires?|retains?|appoints?|contracts?\s+with)\s+/i;

/** Numbered clause headings accidentally captured with entity text, e.g. "1 Parties. Acme LLC". */
const NUMBERED_PARTIES_HEADING_PREFIX_RE =
  /^(?:\d+(?:\.\d+)*\.?\s+)?(?:Parties?|PARTIES?)\.?\s+/i;

/** Role-label prose prefixes, e.g. "Client is Acme LLC". */
const ROLE_IS_PREFIX_RE =
  /^(?:Client|Service\s+Provider|Provider|Contractor|Company|Vendor|Customer)\s+is\s+/i;

const TRAILING_LEGAL_ENTITY_RE =
  /\b([A-Z][\w.&'’\-]+(?:\s+[A-Z][\w.&'’\-]+)*\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|Co\.?|Company)\.?)\s*$/i;

/** Jurisdiction prose accidentally merged into a party label, e.g. "Jane Donaldson, Oklahoma law". */
const TRAILING_JURISDICTION_CLAUSE_RE =
  /,\s*(?:[A-Z][\w.'’\-]+(?:\s+[A-Z][\w.'’\-]+)*\s+)?law(?:\s+governs)?\.?\s*$/i;

const loggedSanitizerEvents = new Set<string>();

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function hasRawDisplayPollutionMarkers(t: string): boolean {
  if (!t) return false;
  return (
    looksLikeAuthorizedSignersBulletLine(t) ||
    LEADING_CONNECTOR_CHAIN_RE.test(t) ||
    SINGLE_LEADING_VERB_RE.test(t) ||
    NUMBERED_PARTIES_HEADING_PREFIX_RE.test(t) ||
    ROLE_IS_PREFIX_RE.test(t) ||
    /^(?:and|between)\s+/i.test(t) ||
    /^\d+(?:\.\d+)*\.?\s+/i.test(t)
  );
}

/** True when a party label ends with governing-law / jurisdiction prose instead of an entity name. */
export function hasTrailingJurisdictionClausePollution(name: string): boolean {
  const t = norm(name);
  if (!t) return false;
  return TRAILING_JURISDICTION_CLAUSE_RE.test(t);
}

export function stripTrailingJurisdictionClause(name: string): string {
  return norm(name).replace(TRAILING_JURISDICTION_CLAUSE_RE, "").trim();
}

/** True when raw text still carries heading/prose pollution before or after sanitization heuristics. */
export function hasSignerPartyLegalEntityDisplayPollution(name: string): boolean {
  const t = norm(name);
  if (!t) return false;
  return (
    hasRawDisplayPollutionMarkers(t) ||
    hasTrailingJurisdictionClausePollution(t) ||
    hasPartyMetadataLabelContamination(t)
  );
}

/** @deprecated Prefer {@link hasSignerPartyLegalEntityDisplayPollution}. */
export function hasSignerPartyLegalEntityLeadingVerbPollution(name: string): boolean {
  return hasSignerPartyLegalEntityDisplayPollution(name);
}

function stripHeadingAndProsePrefixes(s: string): string {
  let out = s;
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out
      .replace(LEADING_CONNECTOR_CHAIN_RE, "")
      .replace(SINGLE_LEADING_VERB_RE, "")
      .replace(NUMBERED_PARTIES_HEADING_PREFIX_RE, "")
      .replace(ROLE_IS_PREFIX_RE, "")
      .replace(/^(?:and|between)\s+/i, "")
      .trim();
  }
  return out;
}

function extractTrailingLegalEntity(s: string): string {
  const m = s.match(TRAILING_LEGAL_ENTITY_RE);
  return m ? norm(m[1]) : s;
}

export function sanitizeSignerPartyLegalEntityDisplay(
  raw: string,
  opts?: {
    partyIndex?: number;
    source?: string;
    log?: boolean;
  },
): string {
  let s = norm(raw);
  if (!s) return s;
  const before = s;
  if (looksLikeAuthorizedSignersBulletLine(s)) {
    s = stripAuthorizedSignersBulletLegalEntity(s);
  }
  s = stripHeadingAndProsePrefixes(s);
  if (hasTrailingJurisdictionClausePollution(s)) {
    s = stripTrailingJurisdictionClause(s);
  }
  if (hasPartyMetadataLabelContamination(s)) {
    s = stripTrailingPartyMetadataLabel(s);
  }
  if (s && hasRawDisplayPollutionMarkers(s)) {
    s = extractTrailingLegalEntity(s);
  }
  if (hasPartyMetadataLabelContamination(s)) {
    s = "";
  }
  if (s !== before && opts?.log !== false) {
    logPaidProSignerEntityDisplaySanitized({
      before,
      after: s,
      partyIndex: opts?.partyIndex,
      source: opts?.source ?? "unknown",
    });
  }
  return s;
}

export function logPaidProSignerEntityDisplaySanitized(payload: {
  before: string;
  after: string;
  partyIndex?: number;
  source: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (loggedSanitizerEvents.has(key)) return;
  loggedSanitizerEvents.add(key);
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signer-entity-display-sanitized]", payload);
}

export function isCleanSignerPartyLegalEntityDisplay(name: string): boolean {
  const t = sanitizeSignerPartyLegalEntityDisplay(name, { log: false });
  if (!t || t.length < 3) return false;
  if (hasSignerPartyLegalEntityDisplayPollution(t)) return false;
  return PARTY_ENTITY_SUFFIX_RE.test(t);
}
