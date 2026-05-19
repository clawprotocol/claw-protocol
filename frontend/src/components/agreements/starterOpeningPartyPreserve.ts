/**
 * Starter-preview-only party identity guard: preserve full legal entity names in opening
 * when intake lists them, without paid-Pro defined-short-name polish.
 */

import { extractAgreementEntityCandidates } from "../../agreement/partyPlaceholderDisplay";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { shortFormsFromLegalName } from "./paidProPartyNamePreserve";

function resolveFullLegalPartiesForStarterPreview(
  partyNames: readonly string[],
  intakeRaw: string | null | undefined,
): string[] {
  const intake = String(intakeRaw || "").trim();
  const fromBetween = extractBetweenPartyNameList(intake);
  if (fromBetween.length >= 2) return fromBetween;
  const fromEntities = extractAgreementEntityCandidates(intake);
  if (fromEntities.length >= 2) return fromEntities;
  return (partyNames || [])
    .map((n) => String(n || "").replace(/\s+/g, " ").trim())
    .filter((n) => n.length >= 3);
}

function normalizeCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function partyNameIsShortFormOf(fullLegal: string, displayName: string): boolean {
  const full = normalizeCompare(fullLegal);
  const display = normalizeCompare(displayName);
  if (!display || display === full) return false;
  if (full.startsWith(display)) return true;
  return shortFormsFromLegalName(fullLegal).some((short) => normalizeCompare(short) === display);
}

/**
 * When intake has full legal entities, prefer them over collapsed short labels on party rows
 * (starter preview only — does not add defined-short-name recital polish).
 */
export function enrichStarterPreviewPartiesFromIntake(
  draft: ParsedDraftShape,
  intakeText: string | null | undefined,
): ParsedDraftShape {
  const parties = Array.isArray(draft.parties) ? [...draft.parties] : [];
  if (parties.length < 2) return draft;

  const fullNames = resolveFullLegalPartiesForStarterPreview(
    parties.map((p) => String(p?.name ?? "")),
    intakeText,
  );
  if (fullNames.length < 2) return draft;

  const enriched = parties.map((party, idx) => {
    const current = String(party?.name ?? "").replace(/\s+/g, " ").trim();
    const matchedFull =
      fullNames[idx] ||
      fullNames.find((full) => partyNameIsShortFormOf(full, current)) ||
      null;
    if (!matchedFull || matchedFull === current) return party;
    if (partyNameIsShortFormOf(matchedFull, current) || current.length < matchedFull.length) {
      return { ...party, name: matchedFull };
    }
    return party;
  });

  return { ...draft, parties: enriched };
}
