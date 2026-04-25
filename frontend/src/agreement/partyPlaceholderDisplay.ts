/**
 * Display-layer cleanup for internal party/org tokens (ORG_1, org1, [ORG_1], etc.).
 * Prefer real names inferred from intake-like context when substituting.
 */

import { extractBetweenPartyPair } from "../components/agreements/partyBetweenParse";

const ENTITY_SUFFIX = /(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|PC|P\.C\.)/i;

function pushUnique(out: string[], seen: Set<string>, raw: string) {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 160) return;
  const low = t.toLowerCase();
  if (/^(you|i|we|they|counterparty|party|parties|the|a|an)\b/i.test(t)) return;
  if (seen.has(low)) return;
  seen.add(low);
  out.push(t);
}

function stripParenClauses(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Ordered entity-like phrases from free text (between X and Y, Org suffixes, etc.).
 */
export function extractAgreementEntityCandidates(context: string): string[] {
  const text = (context || "").trim();
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();

  const betweenPair = extractBetweenPartyPair(text);
  if (betweenPair) {
    const left = stripParenClauses(betweenPair.left);
    const right = stripParenClauses(betweenPair.right);
    const leftParts = left.split(/\s*,\s*/).map((x) => stripParenClauses(x)).filter(Boolean);
    if (leftParts.length >= 2) {
      for (const p of leftParts) pushUnique(out, seen, p);
    } else {
      pushUnique(out, seen, left);
    }
    pushUnique(out, seen, right);
  }

  const partiesLine = text.match(/\bparties?\s*:\s*([^\n]+)/i);
  if (partiesLine) {
    for (const part of partiesLine[1].split(/(?:,|;|&|\band\b)/i)) {
      const p = stripParenClauses(part);
      if (p) pushUnique(out, seen, p);
    }
  }

  for (const m of text.matchAll(
    /\b([A-Z][\w.&'’\-]+(?:\s+[A-Z][\w.&'’\-]+)*\s+(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?|LLP|PLLC))\b/g,
  )) {
    pushUnique(out, seen, m[1]);
  }

  if (out.length < 2) {
    for (const m of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})\b/g)) {
      const frag = m[1].trim();
      if (ENTITY_SUFFIX.test(frag) || frag.split(/\s+/).length >= 2) pushUnique(out, seen, frag);
    }
  }

  return out;
}

/** Remove internal ref fragments from a single name field (no substitution). */
export function stripInternalPartyRefFragments(name: string): string {
  return substitutePlaceholderTokensWithFn((name || "").trim(), () => "").replace(/\s+/g, " ").trim();
}

function slotFallback(idx: number): string {
  if (idx === 0) return "Party A";
  if (idx === 1) return "Party B";
  return `Party ${String.fromCharCode(65 + idx)}`;
}

/**
 * Replace ORG_n / PARTY_n / org1 / [ORG_1] style tokens using context-derived names.
 * Slot n (1-based) maps to candidate[n - 1] or a calm Party A/B fallback.
 */
export function substitutePartyPlaceholdersInUserFacingText(text: string, context: string): string {
  const t = (text || "").trim();
  if (!t) return t;
  const candidates = extractAgreementEntityCandidates(context);
  return substitutePlaceholderTokensWithFn(t, (slot) => {
    const idx = Math.max(0, slot - 1);
    return candidates[idx] ?? slotFallback(idx);
  });
}

function substitutePlaceholderTokensWithFn(
  text: string,
  replacer: (slot: number) => string,
): string {
  const re =
    /\[\s*(?:ORG|PARTY|CLIENT|COMPANY|ORGANIZATION)(?:[_\s\-]+)?[1-9]\d*\s*\]|\(\s*(?:ORG|PARTY|CLIENT|COMPANY|ORGANIZATION)(?:[_\s\-]+)?[1-9]\d*\s*\)|\b(?:ORG|PARTY|CLIENT|COMPANY|ORGANIZATION)(?:[_\s\-]+)[1-9]\d*\b|\b(?:ORG|PARTY|CLIENT|COMPANY)[1-9]\d*\b|\borg(?:[_\s\-]+)[1-9]\d*\b|\bparty(?:[_\s\-]+)[1-9]\d*\b|\borg[1-9]\d*\b|\bparty[1-9]\d*\b/gi;
  return text.replace(re, (match) => {
    const num = match.match(/([1-9]\d*)/);
    const slot = num ? parseInt(num[1], 10) : 1;
    return replacer(Number.isFinite(slot) && slot > 0 ? slot : 1);
  });
}

/** Resolve a party row name from API/LLM output using optional intake/context text. */
export function resolvePartyNameForUserFacing(
  rawName: string,
  partyIndex: number,
  context: string,
): string {
  const stripped = stripInternalPartyRefFragments(rawName);
  if (stripped.length >= 2) {
    return substitutePartyPlaceholdersInUserFacingText(stripped, context);
  }
  const candidates = extractAgreementEntityCandidates(context);
  return candidates[partyIndex] ?? slotFallback(partyIndex);
}
