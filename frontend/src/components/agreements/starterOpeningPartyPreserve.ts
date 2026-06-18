/**
 * Starter-preview-only party identity guard: preserve full legal entity names in opening
 * when intake lists them, without paid-Pro defined-short-name polish.
 */

import { extractAgreementEntityCandidates } from "../../agreement/partyPlaceholderDisplay";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { labeledPartyLegalEntities } from "./labeledPartyBlockParse";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { shortFormsFromLegalName } from "./paidProPartyNamePreserve";
import { isolateLegalEntityFromContaminatedName } from "./starterPartyIdentityIsolation";

const GENERIC_STARTER_PARTY_ROLE = new Set(["", "party", "parties", "signer", "signatory"]);

function isStarterServicesAgreementLike(
  draft: ParsedDraftShape,
  intakeText: string | null | undefined,
): boolean {
  const family = String(draft.agreement_family || "").toLowerCase();
  if (
    ["residential_lease", "commercial_lease", "nda", "operating_agreement", "generic_business_agreement"].includes(
      family,
    )
  ) {
    return false;
  }
  if (["services_agreement", "consulting_agreement", "independent_contractor_agreement"].includes(family)) {
    return true;
  }
  const blob = [draft.title, intakeText].filter(Boolean).join(" ");
  return /\b(?:services?\s+agreement|consulting|contractor|provider|will\s+provide|perform|setup|implementation|workflow)\b/i.test(
    blob,
  );
}

/**
 * Two-party commercial services starters: map generic draft roles to Client / Service Provider.
 */
export function inferStarterCommercialPartyRoles(
  draft: ParsedDraftShape,
  intakeText: string | null | undefined,
): ParsedDraftShape {
  const parties = Array.isArray(draft.parties) ? [...draft.parties] : [];
  if (parties.length !== 2) return draft;
  if (!isStarterServicesAgreementLike(draft, intakeText)) return draft;
  return {
    ...draft,
    parties: parties.map((party, index) => {
      const role = String(party?.role ?? "").trim().toLowerCase();
      if (!GENERIC_STARTER_PARTY_ROLE.has(role)) return party;
      return {
        ...party,
        role: index === 0 ? "Client" : "Service Provider",
      };
    }),
  };
}

function resolveFullLegalPartiesForStarterPreview(
  partyNames: readonly string[],
  intakeRaw: string | null | undefined,
): string[] {
  const intake = String(intakeRaw || "").trim();
  const fromLabeled = labeledPartyLegalEntities(intake);
  if (fromLabeled.length >= 2) return fromLabeled;
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
  const withRoles = inferStarterCommercialPartyRoles(draft, intakeText);
  const parties = Array.isArray(withRoles.parties) ? [...withRoles.parties] : [];
  if (parties.length < 2) return withRoles;

  const fullNames = resolveFullLegalPartiesForStarterPreview(
    parties.map((p) => String(p?.name ?? "")),
    intakeText,
  );
  if (fullNames.length < 2) return withRoles;

  const baseParties =
    fullNames.length > parties.length
      ? fullNames.map((name, index) => parties[index] ?? { name, role: index === 0 ? "Client" : index === 1 ? "Service Provider" : "party" })
      : parties;

  const enriched = baseParties.map((party, idx) => {
    const rawCurrent = String(party?.name ?? "").replace(/\s+/g, " ").trim();
    const current = isolateLegalEntityFromContaminatedName(rawCurrent);
    const matchedFull =
      fullNames[idx] ||
      fullNames.find((full) => partyNameIsShortFormOf(full, current)) ||
      null;
    const resolvedName = matchedFull || current;
    if (!resolvedName || resolvedName === rawCurrent) return party;
    return { ...party, name: resolvedName };
  });

  return { ...withRoles, parties: enriched };
}
