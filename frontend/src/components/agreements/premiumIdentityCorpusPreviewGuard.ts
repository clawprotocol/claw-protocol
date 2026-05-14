/**
 * Hard guard for user-visible premium full-document text: reject residual identity placeholders,
 * Party A–Z slot fallbacks, Frankenstein party-intro merges, and duplicate entity punctuation.
 */

import {
  hydratePartyIntroductionParagraphs,
  hydratePartyListAndSignatureOrdinals,
} from "../../agreement/partyListOrdinalHydrate";
import {
  substitutePartyPlaceholdersInUserFacingText,
  textContainsUnresolvedIdentityPlaceholders,
} from "../../agreement/partyPlaceholderDisplay";

/** Party A / Party F style slot labels — must not appear in accepted premium preview. */
export const PARTY_LETTER_FALLBACK_RE = /\bParty\s+[A-Z]\b/;

export const BRACKET_ORG_PERSON_SLOT_RE = /\[(?:ORG|PERSON)_\d+\]/i;

export const AND_PARTY_LETTER_FALLBACK_RE = /\band\s+Party\s+[A-Z]\b/i;

const FRANKENSTEIN_BEACON_COASTAL_RE = /beacon\s+operations\s+and\s+coastal\s+reserve/i;

const ENTITY_DOUBLE_SUFFIX_RE = /(?:Inc|LLC|Corp|Ltd|LP|L\.L\.C)(\.){2,}/i;

function collapseDuplicateEntitySuffixPunct(text: string): string {
  return text.replace(/(Inc|LLC|Corp|Ltd|LP|L\.L\.C)(\.){2,}/gi, "$1.");
}

/**
 * True when premium preview / paid corpus text still shows known identity defects after hydration.
 */
export function textContainsPremiumIdentityDefects(text: string | null | undefined): boolean {
  const t = text || "";
  if (!t.trim()) return false;
  if (PARTY_LETTER_FALLBACK_RE.test(t)) return true;
  if (BRACKET_ORG_PERSON_SLOT_RE.test(t)) return true;
  if (AND_PARTY_LETTER_FALLBACK_RE.test(t)) return true;
  if (FRANKENSTEIN_BEACON_COASTAL_RE.test(t)) return true;
  if (ENTITY_DOUBLE_SUFFIX_RE.test(t)) return true;
  if (textContainsUnresolvedIdentityPlaceholders(t)) return true;
  return false;
}

/**
 * Last pass before returning premium preview plain text: collapse stray `Inc..`, re-run token +
 * party-intro + ordinal repair once if defects remain, then warn if still dirty.
 */
export function finalizePremiumIdentityCorpusInPreview(
  text: string,
  authoritativeParties: readonly string[],
  context: string,
): string {
  let out = collapseDuplicateEntitySuffixPunct(text);
  if (!textContainsPremiumIdentityDefects(out)) return out;
  const auth = authoritativeParties;
  const ctx = context;
  out = substitutePartyPlaceholdersInUserFacingText(out, ctx, auth.length ? auth : null);
  out = hydratePartyIntroductionParagraphs(out, auth);
  out = hydratePartyListAndSignatureOrdinals(out, auth);
  out = collapseDuplicateEntitySuffixPunct(out);
  if (textContainsPremiumIdentityDefects(out)) {
    // eslint-disable-next-line no-console
    console.warn("[premium-identity-corpus] defects remain after final repair pass", {
      previewLen: out.length,
      partyLetterFallback: PARTY_LETTER_FALLBACK_RE.test(out),
      bracketSlot: BRACKET_ORG_PERSON_SLOT_RE.test(out),
      andPartyLetter: AND_PARTY_LETTER_FALLBACK_RE.test(out),
      frankensteinBeaconCoastal: FRANKENSTEIN_BEACON_COASTAL_RE.test(out),
      doubleSuffix: ENTITY_DOUBLE_SUFFIX_RE.test(out),
      unresolvedTokens: textContainsUnresolvedIdentityPlaceholders(out),
    });
  }
  return out;
}
