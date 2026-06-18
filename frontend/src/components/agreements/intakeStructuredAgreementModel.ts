/**
 * Single structured view of free-text intake: each concept maps to at most one field.
 * Heuristic only — server parse on submit remains authoritative when available.
 */

import { extractBetweenPartyPair } from "./partyBetweenParse";
import {
  extractIntakePayment,
  formatPaymentCadencePhrase,
  formatPaymentTermsLine,
  type IntakePaymentField,
} from "./intakeCurrencyParse";
import { formatPartiesJoinedLine, formatPartySegmentForPreview } from "./partyFormat";
import { normalizePartyNameFragment, splitTwoPartiesFromJoinedLine, type StructuredTwoParties } from "./partyIntakeNormalize";
import {
  sanitizePartyLegalNameFromIntakeFragment,
  stripSignerInstructionClausesFromIntake,
} from "./intakeSignerInstructionParse";
import { preCleanBetweenTailForMultiPartySplit, stripPartyRoleAnnotations, truncatePartyClauseTailAtLabeledFields } from "./partyRoleAnnotations";

export type IntakeStructuredAgreement = {
  parties: string[];
  /**
   * Display-only role hints aligned by lowercase party name (P2 hardening). Canonical names
   * in `parties` stay clean — this side channel lets preview rendering surface a parenthetical
   * "(Guarantor)" / "(Escrow Agent)" / "(Trustee)" etc. without polluting the name.
   */
  partyRoleHints: Record<string, string>;
  scope: string;
  payment: string;
  term: string;
  governing_law: string;
  /** 0–1 confidence for governing_law extraction. >=0.8 = authoritative (cannot be overwritten by defaults). */
  governingLawConfidence: number;
  confidentiality: string;
  termination: string;
  /** When true, omit party lines and rely on placeholders / suggestions. */
  partiesUncertain: boolean;
  /** 0–1 heuristic confidence for scope extraction. */
  scopeConfidence: number;
  termConfidence: number;
  /** Low-confidence scope with usable signal — UI may show ⚠️ inferred, not “missing”. */
  scopeInferred: boolean;
  termInferred: boolean;
  /** True when fuzzy or structured cues indicate the user described scope (even if chunk is imperfect). */
  scopeSignalPresent: boolean;
  termSignalPresent: boolean;
};

const MAX_PARTY_CHARS = 72;
const MAX_PARTY_WORDS = 9;
const MAX_FIELD_CHARS = 320;
const PARTY_CONFIDENCE_SHOW = 0.72;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** One sentence, trimmed; drops obvious repetition. */
export function normalizeIntakeFieldText(raw: string, maxLen = MAX_FIELD_CHARS): string {
  let s = raw.replace(/\s+/g, " ").trim();
  if (!s) return "";
  const firstStop = s.search(/[.!?]\s/);
  if (firstStop > 40 && firstStop < maxLen) {
    s = s.slice(0, firstStop + 1).trim();
  }
  s = dedupeLooseSentences(s);
  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1).trim()}…`;
  return s;
}

function dedupeLooseSentences(s: string): string {
  const parts = s.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return s;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.join(" ");
}

/**
 * Tokens that indicate a structural agreement field, NOT a party name.
 * Lines or fragments starting with these must be rejected from party extraction
 * (regression spec §5: prevents "Term: starts May 15, 2026" from leaking into parties[]).
 */
const STRUCTURAL_FIELD_PREFIXES =
  /^(?:term|duration|effective(?:\s+date)?|start(?:\s+date)?|end(?:\s+date)?|payment|compensation|fee|price|governing\s+law|jurisdiction|venue|scope|purpose|deliverables?|services?|confidentialit(?:y|ies)|nda|non[-\s]?disclosure|termination|notice|signatures?|e[-\s]?signatures?)\s*[:\-]/i;

function looksLikeNameFragment(s: string): boolean {
  const t = s.trim();
  if (t.length < 2) return false;
  if (wordCount(t) > MAX_PARTY_WORDS) return false;
  if (t.length > MAX_PARTY_CHARS) return false;
  // Reject prose-flavored starters. Note: "the" / "this" are allowed when followed by a
  // Capitalized noun phrase (e.g. "the Chen Family Trust", "the Olson Family Trust"),
  // because legitimate party names regularly include the article.
  if (/^(?:if|when|payment|fee|i\s+will|we\s+will|whereas|agreement|contract)\b/i.test(t)) return false;
  if (/^(?:the|this)\s+(?![A-Z])/i.test(t)) return false;
  // Reject structural field prefixes ("Term:", "Effective Date:", "Payment:" etc.)
  if (STRUCTURAL_FIELD_PREFIXES.test(t)) return false;
  // Reject fragments containing structural labels inline (e.g. "Operating agreement for X. Members:"
  // or "Sunset Holdings LLC. Term:"). A party name is a single noun-phrase, never a multi-clause sentence.
  if (
    /\b(?:members?|ownership|operating\s+agreement|payment|term|scope|purpose|effective\s+date|deliverables?|services?|property|premises|address|purchase\s+price|rent|deposit|closing\s+date|governing\s+law)\s*[:\-]/i.test(
      t,
    )
  ) {
    return false;
  }
  if (/\b(?:agreement|contract)\b/i.test(t) && /\bfor\b|\bbetween\b/i.test(t)) return false;
  // Reject fragments containing a date inside, since dates are never party names.
  if (DATE_LIKE.test(t) || DATE_NUMERIC.test(t)) return false;
  // Reject percentage tokens (ownership rows like "Alice 40%" should never become parties via this path).
  if (/\d+\s*%/.test(t)) return false;
  return wordCount(t) >= 2 || /(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?|LLP|PLLC)\b/i.test(t);
}

function confidenceBetweenPair(left: string, right: string): number {
  const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const hasEntityMark = (s: string) =>
    /(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|PC|P\.C\.)/i.test(s);
  let c = 0.88;
  if (wc(left) >= 2 || wc(right) >= 2) c = 0.94;
  if (hasEntityMark(left) || hasEntityMark(right)) c = 0.98;
  if (wc(left) === 1 && wc(right) === 1 && Math.min(left.length, right.length) <= 2) c = 0.45;
  return Math.min(1, c);
}

/**
 * Strip "for <Entity> LLC/Inc/Corp" trailing phrase that names the COMPANY rather than
 * a party (regression spec P2 — third party should not absorb "for Apollo Data LLC").
 */
function stripCompanyForSuffix(raw: string): string {
  return raw
    .replace(/\s+for\s+[A-Z][A-Za-z0-9&'\-\s]{1,80}?\s+(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|LLP|PLLC)\b\.?$/i, "")
    .trim();
}

/**
 * Strip a trailing purpose phrase ("Acme LLC for SaaS implementation" → "Acme LLC").
 *
 * Universal rule: when a party segment ends with " for <noun phrase>" and the noun phrase
 * is NOT itself an entity-suffixed company (already handled by `stripCompanyForSuffix`),
 * the "for …" tail is the deal's purpose, not part of the party's name. Only fires when
 * the segment is too long to be a name (>3 words) so simple two-word names are safe.
 */
function stripTrailingForPurpose(raw: string): string {
  const s = raw.trim();
  if (wordCount(s) <= 3) return s;
  const m = s.match(/^(.+?)\s+for\s+([A-Za-z][A-Za-z0-9&'\-\s]{1,80})$/i);
  if (!m) return s;
  const prefix = m[1].trim().replace(/[,;:]+$/, "").trim();
  const tail = m[2].trim();
  if (wordCount(prefix) < 2) return s;
  // Don't strip when the tail is itself an entity (already covered by stripCompanyForSuffix).
  if (/(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|LLP|PLLC)\b/i.test(tail)) return s;
  return prefix;
}

function clampPartySegment(raw: string): string {
  const { name } = clampPartySegmentWithRole(raw);
  return name;
}

/**
 * Like {@link clampPartySegment} but also returns the role hint stripped from the input.
 * Used by P2 display-layer role preservation: canonical name stays clean, role surfaces
 * separately via {@link IntakeStructuredAgreement.partyRoleHints}.
 */
function clampPartySegmentWithRole(raw: string): { name: string; role: string | null } {
  const noEntityFor = stripCompanyForSuffix(sanitizePartyLegalNameFromIntakeFragment(raw));
  const noPurposeFor = stripTrailingForPurpose(noEntityFor);
  const { name: noRole, role } = stripPartyRoleAnnotations(noPurposeFor);
  const formatted = formatPartySegmentForPreview(normalizePartyNameFragment(noRole));
  if (formatted.length > MAX_PARTY_CHARS) return { name: "", role: null };
  if (wordCount(formatted) > MAX_PARTY_WORDS) return { name: "", role: null };
  return { name: formatted, role: role || null };
}

const SIGNER_LINE_EXTRACT_RE =
  /(?:sender\s*[/&]?\s*)?(?:signer|party|signatory|recipient|reviewer)\s*(?:#?\d+)?[:\s\u2014\u2013-]+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)+)/gi;

function extractExplicitSignerNames(raw: string): string[] | null {
  const lines = raw.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  const results: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    SIGNER_LINE_EXTRACT_RE.lastIndex = 0;
    const m = SIGNER_LINE_EXTRACT_RE.exec(line);
    if (!m || !m[1]) continue;
    const name = m[1].trim();
    if (name.length < 3) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(name);
  }
  return results.length >= 2 ? results : null;
}

type PartiesExtract = {
  parties: string[];
  /** Display-role hints, keyed by lowercase canonical name. */
  roleHints: Record<string, string>;
  uncertain: boolean;
  structured: StructuredTwoParties | null;
};

function applyClampedSegments(
  raws: string[],
): { parties: string[]; roleHints: Record<string, string> } {
  const parties: string[] = [];
  const roleHints: Record<string, string> = {};
  for (const r of raws) {
    const { name, role } = clampPartySegmentWithRole(r);
    if (name.length <= 1) continue;
    parties.push(name);
    if (role) roleHints[name.toLowerCase()] = role;
  }
  return { parties, roleHints };
}

/**
 * Pair-wise role hint capture: takes CLEAN names from `cleanSegments` (already split off the
 * pre-cleaned tail, so prefixes like "with " / inline ", as <role>" no longer attach to the
 * name) and looks each name up in `rawSegments` (the un-cleaned tail) to recover the role
 * suffix that was stripped during pre-clean. This avoids leaking ", with " → " and " noise
 * (e.g. "With Jamie Chen") into the canonical party name while still capturing the role.
 */
function captureRoleHintsForCleanNames(
  cleanSegments: string[],
  rawSegments: string[] | null,
): { parties: string[]; roleHints: Record<string, string> } {
  const cleaned = applyClampedSegments(cleanSegments);
  if (!rawSegments) return cleaned;
  const roleByLower = { ...cleaned.roleHints };
  for (const name of cleaned.parties) {
    const lower = name.toLowerCase();
    if (roleByLower[lower]) continue;
    // Find a raw segment that contains the cleaned name (case-insensitive). The matching
    // raw segment likely carries the trailing " as <role>" / "individually and as <role>"
    // tail that pre-clean removed.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matcher = new RegExp(`\\b${escaped}\\b`, "i");
    const raw = rawSegments.find((s) => matcher.test(s));
    if (!raw) continue;
    const { role } = clampPartySegmentWithRole(raw);
    if (role) roleByLower[lower] = role;
  }
  return { parties: cleaned.parties, roleHints: roleByLower };
}

/**
 * Split "A, B, and C" / "A, B, C" into ≥3 candidate party segments.
 * Returns null if only 2 segments or any segment doesn't look like a name fragment.
 */
function splitMultiPartyCommaList(line: string): string[] | null {
  return splitMultiPartyCommaListInternal(line, /* strict */ true);
}

/**
 * Lenient variant: splits the same way but tolerates role-hint suffixes ("Name as escrow agent",
 * "Name individually and as guarantor") that exceed the strict 6-word / 60-char party-fragment
 * limit. Used to capture {@link IntakeStructuredAgreement.partyRoleHints} on the original (pre-
 * cleaned) tail before pre-clean strips role suffixes for splitting.
 */
function splitMultiPartyCommaListWithRoles(line: string): string[] | null {
  return splitMultiPartyCommaListInternal(line, /* strict */ false);
}

function splitMultiPartyCommaListInternal(line: string, strict: boolean): string[] | null {
  const trimmed = line.trim().replace(/[.!?]+$/g, "");
  if (!trimmed) return null;
  const INDIV_MASK = /\{\{indiv_as:([a-z0-9_]+)\}\}/gi;
  const masked = trimmed.replace(/\bindividually\s+and\s+as\s+([a-z][a-z\s\-]{2,40})\b/gi, (_, role: string) => {
    const key = role.replace(/\s+/g, "_").toLowerCase();
    return `{{indiv_as:${key}}}`;
  });
  // Two-stage split:
  //   1. Comma + optional "and" — the structural Oxford boundary. Stays case-insensitive
  //      because the comma is the real separator and tolerates "And" / "AND" after it.
  //   2. Standalone " and " — LOWERCASE ONLY (no `i` flag). A capitalized mid-name
  //      "And" inside a multi-word entity (e.g. "Beacon Cross-Continental Operations
  //      And Logistics Group LLC") is treated as part of the name, not a list separator.
  //      Real list separators in user prose are virtually always lowercase " and ".
  const COMMA_OXFORD_SPLIT = /\s*,\s*(?:and\s+)?/i;
  const STANDALONE_LOWERCASE_AND_SPLIT = /\s+and\s+/;
  const segments = masked
    .split(COMMA_OXFORD_SPLIT)
    .flatMap((s) => s.split(STANDALONE_LOWERCASE_AND_SPLIT))
    .map((s) => s.trim())
    .map((s) => s.replace(INDIV_MASK, (_, key: string) => `individually and as ${key.replace(/_/g, " ")}`))
    .filter(Boolean);
  if (segments.length < 3) return null;
  if (strict) {
    if (!segments.every((s) => looksLikeNameFragment(s) && s.length <= 60 && wordCount(s) <= 6)) {
      return null;
    }
    return segments;
  }
  // Lenient: accept role-hint tails ("Name as <role>") even when the segment exceeds the
  // strict word count, since the role suffix is stripped before display anyway.
  const allowable = segments.every((s) => {
    if (s.length > 100) return false;
    if (/\bas\s+/i.test(s) && wordCount(s) <= 12) return true;
    if (/\bindividually\s+and\s+as\s+/i.test(s) && wordCount(s) <= 14) return true;
    return looksLikeNameFragment(s) && s.length <= 60 && wordCount(s) <= 6;
  });
  return allowable ? segments : null;
}

function tryCommaPairFirstLine(text: string): PartiesExtract | null {
  const firstLineRaw = (text.split(/\n/)[0] || "").trim();
  if (firstLineRaw.length < 8) return null;
  if (/^\s*parties?\s*:/i.test(firstLineRaw)) return null;
  if (/\bbetween\b/i.test(firstLineRaw)) return null;

  // Universal: strip parenthetical role hints "(landlord)" and "as <role>" clauses
  // before splitting so role labels don't break the comma+and splitter. Capture roles
  // from the original (pre-clean) tokens so display rendering can surface them.
  const firstLine = preCleanBetweenTailForMultiPartySplit(firstLineRaw);
  // Raw splitter recovers role hints; cleaned splitter provides canonical names.
  const rawMulti = splitMultiPartyCommaListWithRoles(firstLineRaw);
  const multi = splitMultiPartyCommaList(firstLine);
  if (multi) {
    const { parties: clamped, roleHints } = captureRoleHintsForCleanNames(multi, rawMulti);
    if (clamped.length >= 3) {
      return {
        parties: clamped,
        roleHints,
        uncertain: false,
        structured: { party_1: clamped[0], party_2: clamped[1] },
      };
    }
  }

  const idx = firstLine.indexOf(",");
  if (idx < 2 || idx >= firstLine.length - 3) return null;
  let leftRaw = firstLine.slice(0, idx).trim();
  let rightRaw = firstLine.slice(idx + 1).trim();
  const rCut = rightRaw.search(/\b(?:for|whereas|effective|hereafter)\b|[.!?](?:\s|$)/i);
  if (rCut > 0) rightRaw = rightRaw.slice(0, rCut).trim();
  if (!looksLikeNameFragment(leftRaw) || !looksLikeNameFragment(rightRaw)) return null;
  const { name: a, role: roleA } = clampPartySegmentWithRole(leftRaw);
  const { name: b, role: roleB } = clampPartySegmentWithRole(rightRaw);
  if (a.length < 2 || b.length < 2) return null;
  const conf = confidenceBetweenPair(a, b);
  const structured: StructuredTwoParties = { party_1: a, party_2: b };
  const roleHints: Record<string, string> = {};
  if (roleA) roleHints[a.toLowerCase()] = roleA;
  if (roleB) roleHints[b.toLowerCase()] = roleB;
  if (conf >= PARTY_CONFIDENCE_SHOW) {
    return { parties: [a, b], roleHints, uncertain: false, structured };
  }
  return { parties: [], roleHints: {}, uncertain: true, structured: null };
}

/**
 * Clip the "between …" tail to the first clause without treating entity abbreviations
 * ("Co.", "Inc.", "Corp.", "Ltd.", "L.L.C.") as sentence boundaries — a naive `[.!?]\s`
 * split would truncate "… Beacon Property Co. (manager), and …" at the dot in "Co.".
 */
function sliceFirstPartyListSentenceFromBetweenTail(tail: string): string {
  const line = (tail.split(/\n/)[0] || "").trim();
  const m = line.match(/\.\s+(?=[A-Z][a-z])/);
  if (!m || m.index === undefined) return line;
  return line.slice(0, m.index).trim();
}

function extractStructuredParties(text: string, lower: string): PartiesExtract {
  const partyParseText = stripSignerInstructionClausesFromIntake(text);
  const betweenPair = extractBetweenPartyPair(partyParseText);
  if (betweenPair) {
    const betweenIdx = partyParseText.toLowerCase().indexOf("between ");
    if (betweenIdx >= 0) {
      const firstLine = (partyParseText.slice(betweenIdx + "between ".length).split(/\n/)[0] || "").trim();
      const tailRaw = sliceFirstPartyListSentenceFromBetweenTail(truncatePartyClauseTailAtLabeledFields(firstLine));
      const tail = preCleanBetweenTailForMultiPartySplit(tailRaw);
      // Source list parallel to `multi` — used to recover role hints destroyed by pre-clean.
      // Use the LENIENT splitter so role suffixes ("as escrow agent") survive on the raw list.
      const rawMulti = splitMultiPartyCommaListWithRoles(tailRaw);
      const multi = splitMultiPartyCommaList(tail);
      if (multi) {
        // Names always come from the cleaned splitter (so "with Jamie Chen" never leaks);
        // role hints are recovered from the raw splitter when they line up.
        const { parties: clamped, roleHints } = captureRoleHintsForCleanNames(multi, rawMulti);
        if (clamped.length >= 3) {
          return {
            parties: clamped,
            roleHints,
            uncertain: false,
            structured: { party_1: clamped[0], party_2: clamped[1] },
          };
        }
      }
    }

    // Apply pre-clean to the bilateral pair so trailing role/capacity tails ("Trustee of …")
    // and parenthetical role hints don't leak into canonical names. The pre-clean is the same
    // function used for multi-party splitting; the role suffix is captured separately.
    const cleanedLeftRaw = preCleanBetweenTailForMultiPartySplit(betweenPair.left);
    const cleanedRightRaw = preCleanBetweenTailForMultiPartySplit(betweenPair.right);
    const { name: a } = clampPartySegmentWithRole(cleanedLeftRaw);
    const { name: b } = clampPartySegmentWithRole(cleanedRightRaw);
    // Recover roles from the original (un-cleaned) sides.
    const { role: roleA } = clampPartySegmentWithRole(betweenPair.left);
    const { role: roleB } = clampPartySegmentWithRole(betweenPair.right);
    if (a.length > 1 && b.length > 1) {
      const conf = confidenceBetweenPair(a, b);
      const structured: StructuredTwoParties = { party_1: a, party_2: b };
      const roleHints: Record<string, string> = {};
      if (roleA) roleHints[a.toLowerCase()] = roleA;
      if (roleB) roleHints[b.toLowerCase()] = roleB;
      if (conf >= PARTY_CONFIDENCE_SHOW) {
        return { parties: [a, b], roleHints, uncertain: false, structured };
      }
      return { parties: [], roleHints: {}, uncertain: true, structured: null };
    }
  }

  const partiesEq = text.match(/\bparties?\s*:\s*([^\n]+)/i);
  if (partiesEq) {
    const rawBody = partiesEq[1].trim();
    if (rawBody.length > 200 || wordCount(rawBody) > 24) {
      const strictCommaParts = rawBody
        .split(/\s*,\s*/)
        .map((x) => x.trim())
        .filter(Boolean);
      const looksLikeListOfNames =
        strictCommaParts.length >= 2 &&
        strictCommaParts.every((p) => p.length <= 60 && wordCount(p) <= 6 && looksLikeNameFragment(p));
      if (looksLikeListOfNames && rawBody.length <= 320) {
        const { parties: allClamped, roleHints } = applyClampedSegments(strictCommaParts);
        if (allClamped.length >= 2) {
          return {
            parties: allClamped,
            roleHints,
            uncertain: false,
            structured: { party_1: allClamped[0], party_2: allClamped[1] },
          };
        }
      }
      return { parties: [], roleHints: {}, uncertain: true, structured: null };
    }
    const commaParts = rawBody.split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
    if (commaParts.length >= 2) {
      const { parties: allClamped, roleHints } = applyClampedSegments(commaParts);
      if (allClamped.length >= 2) {
        return {
          parties: allClamped,
          roleHints,
          uncertain: false,
          structured: { party_1: allClamped[0], party_2: allClamped[1] },
        };
      }
    }
    const andSplit = rawBody
      .split(/\s*,\s*|\s+and\s+/i)
      .map((x) => x.trim())
      .filter(Boolean);
    if (andSplit.length >= 2) {
      const { parties: allClamped, roleHints } = applyClampedSegments(andSplit);
      if (allClamped.length >= 2) {
        return {
          parties: allClamped,
          roleHints,
          uncertain: false,
          structured: { party_1: allClamped[0], party_2: allClamped[1] },
        };
      }
    }
    const joined = formatPartiesJoinedLine(rawBody);
    const structured = splitTwoPartiesFromJoinedLine(joined);
    if (structured) {
      const aRes = clampPartySegmentWithRole(structured.party_1);
      const bRes = clampPartySegmentWithRole(structured.party_2);
      if (aRes.name.length > 1 && bRes.name.length > 1) {
        const roleHints: Record<string, string> = {};
        if (aRes.role) roleHints[aRes.name.toLowerCase()] = aRes.role;
        if (bRes.role) roleHints[bRes.name.toLowerCase()] = bRes.role;
        return {
          parties: [aRes.name, bRes.name],
          roleHints,
          uncertain: false,
          structured: { party_1: aRes.name, party_2: bRes.name },
        };
      }
    }
    return { parties: [], roleHints: {}, uncertain: true, structured: null };
  }

  const commaPair = tryCommaPairFirstLine(text);
  if (commaPair) return commaPair;

  const signerRows = extractExplicitSignerNames(text);
  if (signerRows && signerRows.length >= 2) {
    const { parties: allClamped, roleHints } = applyClampedSegments(signerRows);
    if (allClamped.length >= 2) {
      return {
        parties: allClamped,
        roleHints,
        uncertain: false,
        structured: { party_1: allClamped[0], party_2: allClamped[1] },
      };
    }
  }

  if (/\bI\s+will\b/i.test(text) && /\byou\b/i.test(lower)) {
    return { parties: [], roleHints: {}, uncertain: true, structured: null };
  }

  return { parties: [], roleHints: {}, uncertain: false, structured: null };
}

const FUZZY_SCOPE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bscope\s+of\s+work\b/i, label: "scope of work" },
  { re: /\bwill\s+be\s+performing\b/i, label: "will be performing" },
  { re: /\bwill\s+provide\b/i, label: "will provide" },
  { re: /\bresponsible\s+for\b/i, label: "responsible for" },
  { re: /\bjob\s+is\s+to\b/i, label: "job is to" },
  { re: /\bwork\s+includes\b/i, label: "work includes" },
  { re: /\bservices\s+include\b/i, label: "services include" },
];

function chunkAfterRegex(text: string, re: RegExp, maxLen = 200): string {
  const m = text.match(re);
  if (!m || m.index === undefined) return "";
  const start = m.index + m[0].length;
  let chunk = text.slice(start, start + maxLen + 80).replace(/^\s*[.,:;-]\s*/, "");
  const stop = chunk.search(/(?<=[.!?])\s|\n/);
  if (stop >= 20) chunk = chunk.slice(0, stop + 1);
  else {
    const soft = chunk.search(/\s+(?:payment|term|duration|governing|parties|for\s+the|whereas)\b/i);
    if (soft > 24) chunk = chunk.slice(0, soft).trim();
  }
  return normalizeIntakeFieldText(chunk, maxLen);
}

type FieldMeta = { text: string; confidence: number; signal: boolean; inferred: boolean };

/**
 * Boundary regex for labeled-field scope extraction. Scope/Purpose extraction must terminate at
 * the next labeled field (Term, Payment, Governing law, Confidentiality, IP, Termination, etc.),
 * a sentence boundary (period followed by space + capital), or the next double-newline.
 */
const NEXT_LABELED_FIELD_BOUNDARY =
  /\b(?:term|duration|effective[\s-]date|payment|fee|compensation|rate|governing[\s-]law|jurisdiction|venue|confidentialit(?:y|ies)|ip|intellectual[\s-]property|work[-\s]?for[-\s]?hire|termination|notice|e[-\s]?signatures?|signatures?|deliverables?)\s*[:\-]/i;

function trimScopeAtFieldBoundary(captured: string): string {
  let s = captured.replace(/\s+/g, " ").trim();
  if (!s) return s;
  const boundaryMatch = NEXT_LABELED_FIELD_BOUNDARY.exec(s);
  if (boundaryMatch && boundaryMatch.index !== undefined && boundaryMatch.index >= 4) {
    s = s.slice(0, boundaryMatch.index).replace(/[\s,;:]+$/g, "").trim();
  }
  return s;
}

function extractScopeAndMeta(lower: string, text: string): FieldMeta {
  let best: FieldMeta = { text: "", confidence: 0, signal: false, inferred: false };

  const labeled = text.match(/\b(?:scope|purpose|services?|work|tasks?)\s*[:\-]\s*([^\n]+)/i);
  if (labeled) {
    const trimmed = trimScopeAtFieldBoundary(labeled[1]);
    const t = normalizeIntakeFieldText(trimmed, 220);
    if (t)
      return { text: t, confidence: 0.92, signal: true, inferred: t.length < 28 && !/[.!?]/.test(t) };
  }

  if (/\bmow\b/i.test(lower) || /\blawn\b/i.test(lower)) {
    return { text: "Weekly lawn care / property maintenance", confidence: 0.78, signal: true, inferred: false };
  }
  if (/\bclean\b/i.test(lower)) {
    return { text: "Cleaning services", confidence: 0.78, signal: true, inferred: false };
  }
  if (/\bconsult/i.test(lower)) {
    return { text: "Consulting / advisory services", confidence: 0.78, signal: true, inferred: false };
  }
  if (/\bdevelop|software|code\b/i.test(lower)) {
    return { text: "Software development / technical services", confidence: 0.78, signal: true, inferred: false };
  }

  const willDo = text.match(/\bwill\s+([^.!\n]{8,160})/i);
  if (willDo) {
    const t = normalizeIntakeFieldText(willDo[1], 200);
    if (t) best = { text: t, confidence: 0.74, signal: true, inferred: t.length < 36 };
  }

  const shall = text.match(/\b(?:shall|must)\s+([^.!\n]{8,120})/i);
  if (shall) {
    const t = normalizeIntakeFieldText(shall[0], 200);
    const conf = 0.7;
    if (t && conf >= best.confidence) best = { text: t, confidence: conf, signal: true, inferred: true };
  }

  for (const { re } of FUZZY_SCOPE_PATTERNS) {
    if (!re.test(text)) continue;
    const chunk = chunkAfterRegex(text, re, 220);
    if (chunk.length >= 8) {
      const conf = 0.62;
      if (conf >= best.confidence || !best.text) {
        best = { text: chunk, confidence: conf, signal: true, inferred: true };
      }
    } else if (!best.text) {
      best = {
        text: "Scope of work described in this Agreement.",
        confidence: 0.55,
        signal: true,
        inferred: true,
      };
    }
  }

  const INFER_THRESHOLD = 0.72;
  if (best.text && best.confidence < INFER_THRESHOLD && best.signal) best.inferred = true;
  return best;
}

/**
 * Tokens that must NEVER populate the Payment Terms field — semantic suppression
 * for confidentiality / IP / NDA / proprietary content that may otherwise leak
 * via the loose `(?:payment|compensation|fee|price)` rate fallback (regression spec §4).
 */
const NON_PAYMENT_SEMANTIC_TOKENS =
  /\b(?:confidential(?:ity)?|nda|non[-\s]?disclosure|proprietary|trade\s+secret|mutual\s+confidentiality|disclosing\s+party|receiving\s+party)\b/i;

function looksLikePaymentText(s: string): boolean {
  const t = s.trim().replace(/^[:\-\s]+/, "").trim();
  if (!t) return false;
  if (t.length < 4) return false;
  if (NON_PAYMENT_SEMANTIC_TOKENS.test(t)) return false;
  return true;
}

/**
 * Extract a "Compensation: 0.5% equity ..." labeled payment line: equity / percent compensation
 * is genuine payment data and should populate Payment Terms even when no $ amount is present.
 * Returns empty when no clean equity/percent signal exists.
 */
function extractEquityCompensationLine(text: string): string {
  const labeled = text.match(
    /\b(?:compensation|fee|equity|grant)\s*[:\-]\s*([^\n]{3,200}?)(?:\.\s|\n|$)/i,
  );
  if (!labeled) return "";
  const body = labeled[1].trim();
  if (!looksLikePaymentText(body)) return "";
  // Only accept when the body actually contains $-amount, percent, or equity wording.
  if (!/\b(?:\$\s*\d|\d+\s*%|equity|shares?|options?|warrants?|RSUs?|vesting)\b/i.test(body)) return "";
  return normalizeIntakeFieldText(body, 200);
}

function trimLabeledFieldBody(body: string): string {
  const boundary =
    /\.\s+(?=(?:revenue\s+sharing|term|duration|payment|governing\s+law|jurisdiction|confidentialit|termination|effective\s+date|ip|intellectual\s+property|deliverables?)\s*[:\-])/i;
  const m = boundary.exec(body);
  if (m && m.index >= 4) {
    return body.slice(0, m.index).replace(/[;,:\s]+$/g, "").trim();
  }
  const conf = body.match(/\.\s+Confidentiality\b/i);
  if (conf && conf.index != null && conf.index > 8) {
    return body.slice(0, conf.index).trim();
  }
  return body.replace(/\.\s*$/, "").trim();
}

function captureLabeledFieldBody(text: string, labelPattern: string): string {
  const re = new RegExp(
    `\\b(?:${labelPattern})\\s*[:\\-]\\s*([\\s\\S]+?)(?:\\.\\s+(?=(?:revenue\\s+sharing|term|duration|payment|governing\\s+law|jurisdiction|confidentialit|termination|effective\\s+date|ip|intellectual\\s+property|deliverables?)\\s*[:\\-])|$)`,
    "i",
  );
  const m = text.match(re);
  if (!m) return "";
  return trimLabeledFieldBody(m[1]);
}

/** Labeled "Payment:" clause — preserves multi-amount intakes (startup + monthly maintenance, etc.). */
function extractLabeledPaymentClause(text: string): string {
  const body = captureLabeledFieldBody(text, "payment");
  if (!body) return "";
  if (!looksLikePaymentText(body)) return "";
  if (!/\$\s*\d|\d+\s*%|\d+\s*k\b/i.test(body)) return "";
  return normalizeIntakeFieldText(body, 220);
}

/** Labeled "Revenue sharing:" clause — percent splits among named parties. */
function extractRevenueSharingClause(text: string): string {
  const body = captureLabeledFieldBody(text, "revenue\\s+sharing");
  if (!body || !/\d+\s*%/.test(body)) return "";
  return normalizeIntakeFieldText(`Revenue sharing: ${body}`, 220);
}

function normalizeIntakePaymentField(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.length > 320) return `${s.slice(0, 319).trim()}…`;
  return s;
}

function combineStructuredPaymentLines(...parts: string[]): string {
  const cleaned = parts.map((p) => p.replace(/\.\s*$/, "").trim()).filter(Boolean);
  if (!cleaned.length) return "";
  const joined = cleaned.join("; ");
  if (joined.length <= 320) return joined;
  return `${joined.slice(0, 319).trim()}…`;
}

function extractPaymentLine(text: string, payment: IntakePaymentField): string {
  const labeledPayment = combineStructuredPaymentLines(
    extractLabeledPaymentClause(text),
    extractRevenueSharingClause(text),
  );
  if (labeledPayment) return labeledPayment;

  if (payment.amount != null) {
    if (payment.installmentAmountUnspecified) {
      return formatPaymentTermsLine(payment);
    }
    const formatted = payment.amount.toLocaleString("en-US");
    if (!payment.cadence) return `$${formatted}`;
    return `$${formatted}, ${formatPaymentCadencePhrase(payment.cadence)}`;
  }
  const money =
    text.match(/\$\s*[\d,]+(?:\.\d{2})?\s*(?:\/\s*(?:month|week|visit|service|hr|hour))?/gi) ||
    text.match(/\$?\d[\d,]*(?:\.\d+)?k(?:\/(?:month|week|year|mo))?\b/gi) ||
    text.match(/\b\d{2,}\s*(?:usd|dollars?)\b/gi);
  if (money?.length) {
    const parts = money.slice(0, 3).map((m) => m.replace(/\s+/g, " ").trim());
    return normalizeIntakeFieldText(parts.join("; "), 180);
  }
  // Equity / percent compensation is also genuine payment data.
  const equity = extractEquityCompensationLine(text);
  if (equity) return equity;
  const rate = text.match(/\b(?:payment|compensation|fee|price)\s*[:\-]?\s*(?:of|is)?\s*([^\n,.]{3,100})/i);
  if (rate && looksLikePaymentText(rate[1])) {
    // Strip leading colon/dash punctuation that the loose regex may have captured
    // before normalizing for display (e.g. "Management fee: 8% of monthly rent").
    const cleaned = rate[1].replace(/^[:\-\s]+/, "").trim();
    if (cleaned.length >= 2) return normalizeIntakeFieldText(cleaned, 160);
  }
  return "";
}

const DATE_LIKE =
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?\b/i;
const DATE_NUMERIC = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;

/** Contract timing cues — excludes pay cadence words (monthly, weekly, …) unless duration context exists. */
const TERM_DURATION_SOFT =
  /\b(?:starting|start\s+date|duration|as\s+long\s+as|until(?!\s+terminated)|ongoing)\b/i;

/**
 * Pay-frequency wording; do not map to agreement "term" unless {@link explicitAgreementDurationContext} is true.
 */
const PAYMENT_CADENCE_IN_TERM =
  /\b(?:monthly|weekly|bi-?weekly|semi-?monthly|annually|each\s+month|per\s+month)\b/i;

/** Cadence words may describe contract length only when clearly tied to duration / term (not pay schedule). */
function explicitAgreementDurationContext(lower: string, text: string): boolean {
  if (/\bmonth-to-month\b/i.test(lower)) return true;
  if (/\b(?:annual|weekly|monthly)\s+term\b/i.test(lower)) return true;
  if (/\b(?:for|through)\s+\d+\s*(?:year|years|month|months|week|weeks|day|days)\b/i.test(lower)) return true;
  if (/\b(?:one|1)[-\s]year\s+agreement\b/i.test(lower)) return true;
  if (/\bagreement\s+lasts?\b/i.test(lower)) return true;
  if (/\bterm\s+is\b/i.test(lower)) return true;
  if (/\bterm\s+\d+/i.test(text)) return true;
  if (/\bduration\s+of\b/i.test(lower)) return true;
  return false;
}

/** Human-readable agreement length token (e.g. "12 months" not "12 month"). */
function formatTermLengthToken(nStr: string, unitRaw: string): string {
  const u = unitRaw.toLowerCase();
  const n = parseInt(nStr, 10);
  if (!Number.isFinite(n)) return `${nStr} ${u}`;
  if (u === "year" || u === "years" || u === "yr" || u === "yrs") return n === 1 ? "1 year" : `${n} years`;
  if (u === "month" || u === "months" || u === "mo") return n === 1 ? "1 month" : `${n} months`;
  if (u === "week" || u === "weeks") return n === 1 ? "1 week" : `${n} weeks`;
  if (u === "day" || u === "days") return n === 1 ? "1 day" : `${n} days`;
  return `${nStr} ${u}`;
}

function durationMatchIsTerminationNoticeContext(text: string, m: RegExpMatchArray): boolean {
  const idx = m.index ?? 0;
  const unit = (m[2] || "").toLowerCase();
  if (unit !== "day" && unit !== "days") return false;
  const tail = text.slice(idx + m[0].length, idx + m[0].length + 28).toLowerCase();
  if (/\b(?:notice|notices|written|prior|calendar)\b/.test(tail)) return true;
  const winStart = Math.max(0, idx - 95);
  const win = text.slice(winStart, idx + m[0].length + 48).toLowerCase();
  return (
    /terminat|either\s+party|party\s+may\s+terminate|with\s+notice|written\s+notice|prior\s+notice|notice\s+by|by\s+email|cancel\s+with|end\s+with|terminated\s+with/.test(win) ||
    /(?:termination|terminate).{0,120}\d+\s*days?\b/i.test(text) ||
    /\b\d+\s*days?\b.{0,80}(?:notice|terminat|either)/i.test(text)
  );
}

/**
 * Detects "starts X (and ends Y)" / "effective X" / "from X to Y" patterns and emits clean
 * "Start Date: X · End Date: Y" / "Start Date: X" labels (regression spec §5).
 * Returns null if no clean start/end signal is present.
 */
function extractStartEndDateLabel(text: string, lower: string): string | null {
  const dateAlt = `(?:${DATE_LIKE.source}|${DATE_NUMERIC.source})`;
  // "starts <date> (and ends <date>)?"
  const startsEnds = text.match(
    new RegExp(`\\b(?:starts?|begins?|effective(?:\\s+date)?)\\s+(?:on\\s+)?(${dateAlt})(?:.{0,40}?(?:and\\s+)?ends?\\s+(?:on\\s+)?(${dateAlt}))?`, "i"),
  );
  if (startsEnds) {
    const start = startsEnds[1]?.trim();
    const end = startsEnds[2]?.trim();
    if (start && end) return `Start Date: ${start} · End Date: ${end}`;
    if (start) return `Start Date: ${start}`;
  }
  // "from X to/through Y"
  const fromTo = text.match(
    new RegExp(`\\bfrom\\s+(${dateAlt})\\s+(?:to|through|thru|until)\\s+(${dateAlt})`, "i"),
  );
  if (fromTo) {
    return `Start Date: ${fromTo[1].trim()} · End Date: ${fromTo[2].trim()}`;
  }
  // Standalone "ends <date>"
  const endsOnly = text.match(new RegExp(`\\bends?\\s+(?:on\\s+)?(${dateAlt})`, "i"));
  if (endsOnly) return `End Date: ${endsOnly[1].trim()}`;
  // Standalone "Effective Date: X" / "effective <date>"
  const effLabeled = text.match(new RegExp(`\\beffective\\s+date\\s*[:\\-]\\s*(${dateAlt})`, "i"));
  if (effLabeled) return `Effective Date: ${effLabeled[1].trim()}`;
  // "Start Date:" / "End Date:" labeled forms (preserve verbatim)
  const startLabeled = text.match(new RegExp(`\\bstart\\s+date\\s*[:\\-]\\s*(${dateAlt})`, "i"));
  const endLabeled = text.match(new RegExp(`\\bend\\s+date\\s*[:\\-]\\s*(${dateAlt})`, "i"));
  if (startLabeled && endLabeled) {
    return `Start Date: ${startLabeled[1].trim()} · End Date: ${endLabeled[1].trim()}`;
  }
  if (startLabeled) return `Start Date: ${startLabeled[1].trim()}`;
  if (endLabeled) return `End Date: ${endLabeled[1].trim()}`;
  void lower;
  return null;
}

function extractTermAndMeta(lower: string, text: string): FieldMeta {
  // Prefer paired Start/End date labels when BOTH are present (regression spec §5):
  // these are unambiguous and the user explicitly stated both ends of the term.
  const startEndLabel = extractStartEndDateLabel(text, lower);
  if (startEndLabel && startEndLabel.includes("·")) {
    return { text: startEndLabel, confidence: 0.92, signal: true, inferred: false };
  }

  const termLabeled = text.match(/\b(?:term|duration)\s*[:\-]\s*([^\n]+)/i);
  if (termLabeled) {
    const trimmed = trimScopeAtFieldBoundary(termLabeled[1]).replace(/\.\s*$/, "").trim();
    const t = normalizeIntakeFieldText(trimmed, 120);
    if (t) return { text: t, confidence: 0.92, signal: true, inferred: false };
  }

  const parenDuration = text.match(
    /\((\d+)\)\s*(year|years|yr|yrs|month|months|mo|week|weeks|day|days)\b/i,
  );
  if (parenDuration) {
    const t = formatTermLengthToken(parenDuration[1], parenDuration[2]);
    return { text: t, confidence: 0.9, signal: true, inferred: false };
  }

  // Then prefer explicit "<N> <units>" duration ("8 months", "2 years") since this
  // is the most concrete term length when an effective-date is also present.
  const m = text.match(/\b(\d+)\s*(year|years|yr|yrs|month|months|mo|week|weeks|day|days)\b/i);
  if (m) {
    const unit = m[2].toLowerCase();
    if ((unit === "day" || unit === "days") && durationMatchIsTerminationNoticeContext(text, m)) {
      // Skip — "30 days notice" belongs under termination, not term/duration.
    } else {
      const t = formatTermLengthToken(m[1], m[2]);
      return { text: t, confidence: 0.88, signal: true, inferred: false };
    }
  }

  // Fall back to a single Start/Effective/End label when no duration count is present.
  if (startEndLabel) {
    return { text: startEndLabel, confidence: 0.86, signal: true, inferred: false };
  }
  if (/\bperpetual|indefinite\b/i.test(lower)) {
    return { text: "Until terminated by either party", confidence: 0.86, signal: true, inferred: false };
  }
  if (/\buntil\s+(?:terminated|cancelled|canceled)\b/i.test(lower)) {
    return { text: "Until terminated as described", confidence: 0.84, signal: true, inferred: false };
  }
  if (/\b(?:one|1)\s*year\b/i.test(text)) {
    return { text: "1 year", confidence: 0.85, signal: true, inferred: false };
  }

  if (DATE_LIKE.test(text) || DATE_NUMERIC.test(text)) {
    const dm = text.match(DATE_LIKE) || text.match(DATE_NUMERIC);
    const snippet = dm ? dm[0].trim() : "Date mentioned";
    // Use clean "Start Date:" label instead of legacy "Start / date:" hybrid.
    let line = normalizeIntakeFieldText(`Start Date: ${snippet}`, 120);
    if (/\bmonth-to-month\b/i.test(lower)) {
      line = normalizeIntakeFieldText(`${line}; Month-to-month (continues until terminated as agreed)`, 200);
    }
    return {
      text: line,
      confidence: /\bmonth-to-month\b/i.test(lower) ? 0.87 : 0.82,
      signal: true,
      inferred: true,
    };
  }

  if (/\bmonth-to-month\b/i.test(lower)) {
    return {
      text: "Month-to-month (continues until terminated as agreed)",
      confidence: 0.86,
      signal: true,
      inferred: false,
    };
  }

  if (TERM_DURATION_SOFT.test(lower)) {
    const soft = text.match(TERM_DURATION_SOFT);
    const frag = soft ? soft[0].replace(/\s+/g, " ").trim() : "timing";
    return {
      text: normalizeIntakeFieldText(`Timing as described (${frag}).`, 140),
      confidence: 0.58,
      signal: true,
      inferred: true,
    };
  }

  if (PAYMENT_CADENCE_IN_TERM.test(lower) && explicitAgreementDurationContext(lower, text)) {
    const soft = text.match(PAYMENT_CADENCE_IN_TERM);
    const frag = soft ? soft[0].replace(/\s+/g, " ").trim() : "cadence";
    return {
      text: normalizeIntakeFieldText(`Timing as described (${frag}).`, 140),
      confidence: 0.56,
      signal: true,
      inferred: true,
    };
  }

  return { text: "", confidence: 0, signal: false, inferred: false };
}

/**
 * 50 US states + DC for bare-state governing-law detection ("Oklahoma law", "Texas law", etc.).
 * Single-source list — used to anchor the heuristic to actual jurisdictions only.
 */
const US_JURISDICTIONS = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming", "District of Columbia",
];
const US_JURIS_ALT = US_JURISDICTIONS
  .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const STATE_LAW_RE = new RegExp(`\\b(${US_JURIS_ALT})\\s+(?:state\\s+)?(?:law|jurisdiction|courts?)\\b`, "i");
const BARE_STATE_RE = new RegExp(`\\b(${US_JURIS_ALT})\\b`, "i");

/** Strip trailing " law"/" jurisdiction"/" courts" so "Oklahoma law" → "Oklahoma". */
function trimGoverningLawSuffix(s: string): string {
  return s
    .replace(/\s+(?:state\s+)?(?:laws?|jurisdiction|courts?)\s*$/i, "")
    .replace(/^(?:the\s+)?(?:state\s+of|commonwealth\s+of)\s+/i, "State of ")
    .trim();
}

/**
 * Returns governing-law text + confidence (0–1). >= 0.8 marks an authoritative extraction
 * that downstream defaults / family shells must never overwrite.
 */
function extractGoverningLawWithConfidence(lower: string, text: string): { value: string; confidence: number } {
  // Labeled forms: "Governing law: X", "governed by X", "laws of X", "jurisdiction: X", "venue in X".
  const gl = text.match(
    /\b(?:govern(?:ed|ing)\s+(?:by|law)|laws?\s+of|jurisdiction|venue\s+in)\s*[:\s]+([^\n.]{2,120})/i,
  );
  if (gl) return { value: normalizeIntakeFieldText(trimGoverningLawSuffix(gl[1]), 140), confidence: 0.95 };

  // "State of X" / "Commonwealth of X" preamble.
  const state = text.match(/\b(?:State\s+of|Commonwealth\s+of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (state) return { value: normalizeIntakeFieldText(`State of ${state[1]}`, 120), confidence: 0.9 };

  // Bare "<US state> law/jurisdiction/courts" — covers "Oklahoma law" etc.
  const stateLaw = text.match(STATE_LAW_RE);
  if (stateLaw) return { value: normalizeIntakeFieldText(stateLaw[1], 120), confidence: 0.9 };

  // Last-resort: a single bare US state mention paired with legal context anywhere in intake.
  const bare = text.match(BARE_STATE_RE);
  if (bare && /\b(?:law|jurisdiction|venue|govern|courts?|legal)\b/i.test(lower)) {
    return { value: normalizeIntakeFieldText(bare[1], 120), confidence: 0.82 };
  }

  if (/\bdelaware\b/i.test(lower) && /\b(?:law|DE|corp)\b/i.test(lower)) return { value: "Delaware", confidence: 0.7 };
  if (/\bnew\s+york\b/i.test(lower) && /\b(?:law|NYS|govern)\b/i.test(lower)) return { value: "New York", confidence: 0.7 };
  return { value: "", confidence: 0 };
}


function extractConfidentiality(lower: string, text: string): string {
  if (/\bnda|non-disclosure|confidential(?:ity)?\b/.test(lower)) {
    return "Mutual confidentiality — standard of care for shared information.";
  }
  const m = text.match(/\bconfidential(?:ity)?\s*[:\-]\s*([^\n]{6,200})/i);
  if (m) return normalizeIntakeFieldText(m[1], 200);
  return "";
}

function extractTermination(lower: string, text: string): string {
  const m = text.match(/\btermination\s*[:\-]\s*([^\n]{6,200})/i);
  if (m) return normalizeIntakeFieldText(m[1], 220);
  if (/\bat-will\b/i.test(lower)) return "At-will termination as permitted by law.";

  const noticePhrase =
    /termination\s+by\s+either\s+party|either\s+party\s+may\s+terminate|either\s+party\s+may\s+end|may\s+terminate\s+with|terminate\s+(?:this\s+)?(?:agreement\s+)?with|terminated\s+with\s+notice|terminate\s+with\s+notice|end\s+with\s+notice|cancel\s+with\s+notice/i.test(
      lower,
    );
  const noticeNumeric =
    /(?:terminat|terminate).{0,140}\b\d+\s*days?\b/i.test(text) ||
    /\b\d+\s*days?\b.{0,90}(?:notice|terminat|either)/i.test(text);

  if (noticePhrase || (noticeNumeric && /notice|terminat|either\s+party/i.test(lower))) {
    const parts: string[] = [];
    if (/either\s+party|by\s+either\s+party|both\s+parties\s+may/i.test(lower)) {
      parts.push("Either party may terminate this agreement.");
    } else {
      parts.push("The agreement may be terminated with notice as described in the intake.");
    }
    const daysM =
      text.match(/\b(\d+)\s*days?\s*(?:'|’)?s?\s*(?:of\s+)?(?:prior\s+)?(?:written\s+)?notice\b/i) ||
      text.match(/\b(\d+)\s*days?\s+notice\b/i);
    if (daysM) {
      const n = daysM[1];
      parts.push(`Prior written notice of at least ${n} calendar day${n === "1" ? "" : "s"} is required.`);
    } else if (/\b(?:thirty|30)\s*days?\b/i.test(text) && /notice/i.test(lower)) {
      parts.push("Prior written notice of at least thirty (30) calendar days is required.");
    }
    if (/by\s+email|email\s+(?:for\s+)?notice|notice\s+(?:by|via)\s+email|with\s+.{0,40}email/i.test(lower)) {
      parts.push("Termination and other notices may be delivered by email where permitted herein.");
    }
    // Use semicolons so normalizeIntakeFieldText does not cut everything after the first ". " (see firstStop rule).
    return normalizeIntakeFieldText(parts.join("; "), 280);
  }

  if (/\b30\s*day|thirty\s*day/i.test(text) && /notice|terminat/i.test(lower)) {
    return normalizeIntakeFieldText("Prior written notice of at least thirty (30) calendar days to terminate.", 220);
  }
  return "";
}

function unclearPaymentSchedule(lower: string): boolean {
  if (/\bpayment\s+schedule\s+(?:is\s+)?(?:not\s+set|tbd|tba|unknown|unclear|undetermined)\b/i.test(lower))
    return true;
  if (/\b(?:not|un)(?:clear|defined)\s+(?:payment\s+)?schedule\b/i.test(lower)) return true;
  if (/\bschedule\s+(?:for\s+)?(?:payments?|pay)\s+(?:is\s+)?(?:tbd|not\s+set)\b/i.test(lower)) return true;
  return false;
}

export function extractScheduleLine(lower: string, text: string): string | null {
  const day =
    text.match(
      /\b(?:every|each|on)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b/i,
    ) || text.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b/i);
  if (day) {
    const d = day[1] || day[0];
    if (/\bevery\b/i.test(text)) return `Paid weekly (every ${d})`;
    return `Paid weekly · ${d}`;
  }
  if (/\bweekly\b/i.test(lower)) return "Paid weekly";
  if (/\bmonthly\b/i.test(lower)) return "Paid monthly";
  const byDate = text.match(/\bby\s+([A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)\b/);
  if (byDate) return `Deadline: ${byDate[1]}`;
  if (unclearPaymentSchedule(lower)) return "Payment schedule not set";
  return null;
}

/**
 * Parse raw intake into disjoint fields. Uncertain party signal → empty `parties` and `partiesUncertain` true
 * (never stuff a paragraph into `parties`).
 */
export function parseIntakeToStructuredAgreement(raw: string): IntakeStructuredAgreement {
  const text = stripSignerInstructionClausesFromIntake(raw.trim());
  if (!text) {
    return {
      parties: [],
      partyRoleHints: {},
      scope: "",
      payment: "",
      term: "",
      governing_law: "",
      governingLawConfidence: 0,
      confidentiality: "",
      termination: "",
      partiesUncertain: false,
      scopeConfidence: 0,
      termConfidence: 0,
      scopeInferred: false,
      termInferred: false,
      scopeSignalPresent: false,
      termSignalPresent: false,
    };
  }
  const lower = text.toLowerCase();
  const paymentField = extractIntakePayment(text);
  const partyEx = extractStructuredParties(text, lower);
  const scopeMeta = extractScopeAndMeta(lower, text);
  const termMeta = extractTermAndMeta(lower, text);
  let scope = scopeMeta.text;
  const payment = extractPaymentLine(text, paymentField);
  let term = termMeta.text;
  const govLaw = extractGoverningLawWithConfidence(lower, text);
  const governing_law = govLaw.value;
  const confidentiality = extractConfidentiality(lower, text);
  const termination = extractTermination(lower, text);
  if (termination.trim() && /^\d+\s*days?$/i.test(term.trim())) {
    term = "";
  }

  // Location / governing tails should not become "scope" if we already captured governing law
  if (governing_law && scope.toLowerCase().includes(governing_law.toLowerCase())) {
    scope = scope.replace(new RegExp(governing_law.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "").trim();
  }

  const scopeNorm = normalizeIntakeFieldText(scope);
  const termNorm = normalizeIntakeFieldText(term, 120);
  const scopeSignalPresent = Boolean(scopeMeta.signal || scopeNorm.length > 6);
  const termSignalPresent = Boolean(termMeta.signal || termNorm.length > 2);

  return {
    parties: partyEx.parties,
    partyRoleHints: partyEx.roleHints,
    scope: scopeNorm,
    payment: normalizeIntakePaymentField(payment),
    term: termNorm,
    governing_law: normalizeIntakeFieldText(governing_law, 120),
    governingLawConfidence: govLaw.confidence,
    confidentiality: normalizeIntakeFieldText(confidentiality, 220),
    termination: normalizeIntakeFieldText(termination, 220),
    partiesUncertain: partyEx.uncertain,
    scopeConfidence: scopeMeta.confidence,
    termConfidence: termMeta.confidence,
    scopeInferred: Boolean(scopeMeta.inferred || (scopeMeta.confidence > 0 && scopeMeta.confidence < 0.72 && scopeSignalPresent)),
    termInferred: Boolean(termMeta.inferred || (termMeta.confidence > 0 && termMeta.confidence < 0.75 && termSignalPresent)),
    scopeSignalPresent,
    termSignalPresent,
  };
}

export function structuredPartiesDisplayLine(structured: IntakeStructuredAgreement): string | null {
  if (structured.partiesUncertain || structured.parties.length < 2) return null;
  const valid = structured.parties.filter((p) => p?.trim());
  if (valid.length < 2) return null;
  if (valid.length === 2) return `${valid[0]} and ${valid[1]}`;
  return valid.slice(0, -1).join(", ") + ", and " + valid[valid.length - 1];
}

export function structuredPartiesStructured(structured: IntakeStructuredAgreement): StructuredTwoParties | null {
  if (structured.partiesUncertain || structured.parties.length < 2) return null;
  const [a, b] = structured.parties;
  if (!a?.trim() || !b?.trim()) return null;
  return { party_1: a, party_2: b };
}

