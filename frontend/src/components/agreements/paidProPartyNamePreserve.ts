/**
 * Restore full legal entity names in paid-Pro opening paragraphs when the model
 * shortened them (e.g. "Ironclad" → "Ironclad Systems Group LLC").
 */

import { extractAgreementEntityCandidates } from "../../agreement/partyPlaceholderDisplay";

const ENTITY_SUFFIX =
  /\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP)\.?$/i;

const PREAMBLE_MAX_LEN = 4_500;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

function resolveFullPartyNames(
  partyNames: readonly string[] | null | undefined,
  intakeRaw: string | null | undefined,
): string[] {
  const fromArgs = (partyNames || []).map((n) => String(n || "").replace(/\s+/g, " ").trim()).filter((n) => n.length >= 3);
  if (fromArgs.length >= 2) return fromArgs;
  return extractAgreementEntityCandidates(String(intakeRaw || ""));
}

/**
 * In the opening portion of a paid agreement, expand known short party labels to full legal names.
 */
export function preserveFullLegalPartyNamesInOpening(
  text: string,
  partyNames: readonly string[] | null | undefined,
  intakeRaw?: string | null,
): string {
  const fullNames = resolveFullPartyNames(partyNames, intakeRaw);
  if (fullNames.length < 2) return text;
  const headLen = Math.min(text.length, PREAMBLE_MAX_LEN);
  let head = text.slice(0, headLen);
  const tail = text.slice(headLen);

  for (const full of fullNames) {
    if (!ENTITY_SUFFIX.test(full) && full.split(/\s+/).length < 2) continue;
    if (head.includes(full)) continue;
    for (const short of shortFormsFromLegalName(full)) {
      if (short.length < 3 || short === full) continue;
      const re = new RegExp(`(?<!\\w)${escapeRe(short)}(?!\\s*(?:LLC|L\\.L\\.C\\.|Inc\\.?|Corp\\.?|Ltd\\.?|LP))`, "gi");
      if (!re.test(head)) continue;
      head = head.replace(re, full);
    }
  }

  return head + tail;
}
