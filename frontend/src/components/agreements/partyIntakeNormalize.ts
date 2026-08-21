/**
 * Strip location / residency noise from free-text party fragments before formatting.
 * Client-side heuristics only — keeps names user-readable.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { dedupeEntitySuffixes, US_STATE_NAMES_ENGLISH } from "./partyFormat";
import {
  collapsePartySlotCandidates,
  normalizeAgreementPartyName,
  splitCommaSeparatedPartyNames,
} from "./partySlotIdentityNormalize";

const MAX_PARTY_INLINE_LEN = 280;

/**
 * Strips template placeholder tokens from a free-text parties line so user input overwrites
 * (never accumulates "…Party A (edit in review)…" alongside real names).
 */
export function sanitizePartiesInput(input: string): string {
  let s = (input || "")
    .replace(/Party A \(edit in review\)/gi, "")
    .replace(/Party B \(edit in review\)/gi, "")
    .replace(/\(edit in review\)/gi, "")
    .replace(/\bParty A\b/gi, "")
    .replace(/\bParty B\b/gi, "")
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
  s = s.replace(/^,+|,+$/g, "").trim();
  return s;
}

/** Joined line (comma or "and") parses to non-empty party rows — after sanitization. Preserves all parties. */
export function parsePartiesFromUserInput(s: string): { name: string; role: string }[] | null {
  const t = sanitizePartiesInput(s.trim());
  if (!t) return null;
  const between = extractBetweenPartyNameList(t);
  if (between.length >= 2) {
    return collapsePartySlotCandidates(between).map((name) => ({
      name: name.slice(0, MAX_PARTY_INLINE_LEN),
      role: "party",
    }));
  }
  const comma = splitCommaSeparatedPartyNames(t)
    .map((x) => normalizeAgreementPartyName(x))
    .filter(Boolean);
  if (comma.length >= 2) {
    return collapsePartySlotCandidates(comma).map((name) => ({
      name: name.slice(0, MAX_PARTY_INLINE_LEN),
      role: "party",
    }));
  }
  const and = t.split(/\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
  if (and.length >= 2) {
    return collapsePartySlotCandidates(and).map((name) => ({
      name: name.slice(0, MAX_PARTY_INLINE_LEN),
      role: "party",
    }));
  }
  return null;
}

/** Single source for “what party line are we judging?” — prefers inline, then structured, then draft rows. */
export function getEffectivePartiesJoinedString(opts: {
  inline?: string | null;
  structured?: string | null;
  draft?: { parties?: { name?: string | null }[] } | null;
}): string {
  const inline = (opts.inline ?? "").trim();
  const structured = (opts.structured ?? "").trim();
  const fromDraft = opts.draft?.parties?.map((p) => (p.name || "").trim()).filter(Boolean).join(", ") ?? "";
  return sanitizePartiesInput(inline || structured || fromDraft);
}

const STATE_ALT = US_STATE_NAMES_ENGLISH.map((n) =>
  n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"),
).join("|");

/** Trailing “in [State]” / “in the state of …” (full state names). */
const IN_FULL_STATE_TAIL = new RegExp(`\\s+in\\s+(?:the\\s+)?(?:state\\s+of\\s+)?(${STATE_ALT})\\s*$`, "i");

/** Trailing “ in ST ” two-letter state (avoid matching words). */
const IN_ST_ABBR_TAIL = /\s+in\s+([A-Z]{2})\s*$/;

/** “Peaceful Journey LLC in Oklahoma LLC” → base entity before duplicate suffix. */
const LLC_IN_STATE_LLC = /^(.+?\b(?:LLC|L\.L\.C\.))\s+in\s+([A-Za-z][A-Za-z\s]+)\s+(LLC|L\.L\.C\.)\s*$/i;

const RESIDING = /\s+residing\s+in\s+[^,;:]+$/i;
const RESIDENT_TAIL = /\s+(?:a\s+)?resident(?:ing)?(?:\s+in\s+[^,;:]+)?$/i;

/**
 * Removes geographic / filler tails so entity names stay clean before title-case formatting.
 */
export function normalizePartyNameFragment(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  if (!s) return s;

  const llcDup = s.match(LLC_IN_STATE_LLC);
  if (llcDup?.[1]) {
    s = llcDup[1].trim();
  }

  s = s.replace(RESIDING, "");
  s = s.replace(RESIDENT_TAIL, "");

  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(IN_FULL_STATE_TAIL, "").trim();
    s = s.replace(IN_ST_ABBR_TAIL, "").trim();
  }

  s = s.replace(/\s+resident\s*$/i, "");
  s = dedupeEntitySuffixes(s);
  return s.replace(/\s+/g, " ").trim();
}

export type StructuredTwoParties = { party_1: string; party_2: string };

/**
 * Split a joined preview line (“A and B”) into two display names.
 * Uses the last “ and ” so names like “Smith and Wesson LLC” stay on the left.
 */
export function splitTwoPartiesFromJoinedLine(line: string): StructuredTwoParties | null {
  const t = line
    .replace(/\s*\(\?\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  const segs = t.split(/\s+and\s+/i).filter((x) => x.trim().length > 0);
  if (segs.length < 2) return null;
  const right = segs[segs.length - 1].trim();
  const left = segs.slice(0, -1).join(" and ").trim();
  if (left.length < 1 || right.length < 1) return null;
  return { party_1: left, party_2: right };
}

/** Split one parties line for recipient prefill (comma, &, newline, “and”). */
export function splitPartyLineForHandoffFirstTwo(line: string): StructuredTwoParties | null {
  const s = sanitizePartiesInput((line || "").trim());
  if (!s) return null;
  const byComma = splitCommaSeparatedPartyNames(s);
  if (byComma.length >= 2) return { party_1: byComma[0], party_2: byComma[1] };
  const byAmp = s.split(/\s*&\s*/).map((x) => x.trim()).filter(Boolean);
  if (byAmp.length >= 2) {
    const p1 = byAmp[0];
    const p2 = byAmp[1];
    const hasEntitySuffixRe = /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|GmbH|PLC|Co\.?|Company)\b/i;
    const p1HasSuffix = hasEntitySuffixRe.test(p1);
    const p2HasSuffix = hasEntitySuffixRe.test(p2);
    if (p1HasSuffix && p2HasSuffix) {
      return { party_1: p1, party_2: p2 };
    }
    if (!p1HasSuffix && !p2HasSuffix) {
      return { party_1: p1, party_2: p2 };
    }
  }
  const byNl = s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (byNl.length >= 2) return { party_1: byNl[0], party_2: byNl[1] };
  const tw = splitTwoPartiesFromJoinedLine(s);
  if (tw) return tw;
  const byAnd = s.split(/\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
  if (byAnd.length >= 2) return { party_1: byAnd[0], party_2: byAnd.slice(1).join(" and ") };
  return null;
}

/** Names for recipient row 1/2 from structured draft parties (incl. single-cell “A, B” lines). */
export function getRecipientHandoffNamesFromDraft(d: ParsedDraftShape | null | undefined): { n1: string; n2: string } {
  if (!d?.parties?.length) return { n1: "", n2: "" };
  const ps = d.parties;
  const nm = (i: number) => (ps[i]?.name || "").trim();
  if (ps.length >= 2 && nm(0) && nm(1)) {
    return { n1: normalizePartyNameFragment(nm(0)), n2: normalizePartyNameFragment(nm(1)) };
  }
  const joined = ps.map((p) => (p.name || "").trim()).filter(Boolean).join(", ");
  const fromJoined = splitPartyLineForHandoffFirstTwo(joined);
  if (fromJoined) {
    return {
      n1: normalizePartyNameFragment(fromJoined.party_1),
      n2: normalizePartyNameFragment(fromJoined.party_2),
    };
  }
  const head = nm(0);
  const fromHead = splitPartyLineForHandoffFirstTwo(head);
  if (fromHead) {
    return {
      n1: normalizePartyNameFragment(fromHead.party_1),
      n2: normalizePartyNameFragment(fromHead.party_2),
    };
  }
  return { n1: normalizePartyNameFragment(head), n2: "" };
}
