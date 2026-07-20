import type { AgreementParty } from "./agreementTypes";
import { orderedAuthoritativePartyDisplayNames } from "./handoffPartyDisplay";
import { extractBetweenPartyNameList } from "../components/agreements/partyBetweenParse";
import { extractAgreementEntityCandidates } from "./partyPlaceholderDisplay";
import { isHighConfidencePartyNameForAutoPopulation } from "../components/agreements/partyNameConfidence";
import { isPlaceholderPartyName } from "../components/agreements/starterPartyLimits";
import { sanitizeStarterPartyNameForDisplay } from "../components/agreements/starterPreviewProseSanitize";
import { resolveSignerCardPartyNames } from "../components/agreements/signerFullLegalName";

const ENTITY_SUFFIX =
  /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|PC|P\.C\.|LP|L\.P\.)\b/i;

const GENERIC_PARTY_SLOT_RE = /^party\s*[a-z]$/i;

export const DEFAULT_SIGNATURE_PARTY_FALLBACK: readonly [string, string] = ["Party A", "Party B"];

export type ExtractAgreementPartiesInput = {
  parties?: readonly AgreementParty[] | null;
  intakeText?: string | null;
  renderedText?: string | null;
  partiesLine?: string | null;
};

function normalizePartyName(raw: string): string {
  return sanitizeStarterPartyNameForDisplay((raw || "").replace(/\s+/g, " ").trim());
}

function isRenderableAgreementPartyName(name: string): boolean {
  const n = normalizePartyName(name);
  if (n.length < 2) return false;
  if (isPlaceholderPartyName(n)) return false;
  if (GENERIC_PARTY_SLOT_RE.test(n)) return false;
  if (isHighConfidencePartyNameForAutoPopulation(n)) return true;
  if (ENTITY_SUFFIX.test(n)) return true;
  return false;
}

function dedupePreserveOrder(names: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const n = normalizePartyName(raw);
    if (!n || !isRenderableAgreementPartyName(n)) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

function buildContextText(input: ExtractAgreementPartiesInput): string {
  return [input.intakeText, input.renderedText, input.partiesLine]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join("\n");
}

/** Oxford-style party list after "between … and …" in intake / rendered prose. */
function extractPartiesFromBetweenClause(text: string): string[] {
  return dedupePreserveOrder(extractBetweenPartyNameList(text).map(normalizePartyName));
}

function extractPartiesFromEntityCandidates(context: string): string[] {
  return dedupePreserveOrder(
    extractAgreementEntityCandidates(context).filter(
      (name) => isRenderableAgreementPartyName(name) && ENTITY_SUFFIX.test(name),
    ),
  );
}

/**
 * Ordered agreement-party labels for signature placeholders and preview chrome.
 * Prefers structured `parties[]`, then entity-like names from intake/rendered text.
 * Falls back to Party A / Party B only when nothing usable is detected.
 */
export function extractAgreementParties(input: ExtractAgreementPartiesInput): string[] {
  const intakeText = (input.intakeText || "").trim();
  const fromDraft = dedupePreserveOrder(
    orderedAuthoritativePartyDisplayNames(
      input.parties ? [...input.parties] : null,
      intakeText || null,
    ),
  );
  if (fromDraft.length > 0) return fromDraft;

  const context = buildContextText(input);
  const fromBetween = extractPartiesFromBetweenClause(context);
  if (fromBetween.length > 0) return fromBetween;

  const resolved = resolveSignerCardPartyNames(input);
  if (resolved.length > 0 && !(resolved.length === 2 && resolved[0] === "Party A")) {
    return dedupePreserveOrder(resolved);
  }

  const fromText = extractPartiesFromEntityCandidates(context);
  if (fromText.length > 0) return fromText;

  return [...DEFAULT_SIGNATURE_PARTY_FALLBACK];
}
