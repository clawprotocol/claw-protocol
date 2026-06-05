/**
 * Display-only sanitizer for Paid Pro signer-setup legal entity fields.
 * Strips leading connector verbs from extracted party labels — never mutates agreement corpus.
 */

import { PARTY_ENTITY_SUFFIX_RE } from "./canonicalPartyIdentityResolver";

const LEADING_CONNECTOR_CHAIN_RE =
  /^(?:(?:and|between)\s+)*(?:(?:engages?|hires?|retains?|appoints?|contracts?\s+with)\s+)+/i;

const SINGLE_LEADING_VERB_RE = /^(?:engages?|hires?|retains?|appoints?|contracts?\s+with)\s+/i;

const loggedSanitizerEvents = new Set<string>();

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function hasSignerPartyLegalEntityLeadingVerbPollution(name: string): boolean {
  const t = norm(name);
  if (!t) return false;
  return LEADING_CONNECTOR_CHAIN_RE.test(t) || SINGLE_LEADING_VERB_RE.test(t) || /^(?:and|between)\s+/i.test(t);
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
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s
      .replace(LEADING_CONNECTOR_CHAIN_RE, "")
      .replace(SINGLE_LEADING_VERB_RE, "")
      .replace(/^(?:and|between)\s+/i, "")
      .trim();
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
  if (hasSignerPartyLegalEntityLeadingVerbPollution(t)) return false;
  return PARTY_ENTITY_SUFFIX_RE.test(t);
}
