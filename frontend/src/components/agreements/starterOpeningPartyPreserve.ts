/**
 * Starter-preview-only party identity guard: preserve full legal entity names in opening
 * when intake lists them, without paid-Pro defined-short-name polish.
 */

import { extractAgreementEntityCandidates } from "../../agreement/partyPlaceholderDisplay";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { labeledPartyLegalEntities } from "./labeledPartyBlockParse";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { extractLineSeparatedLegalEntityParties } from "./partySlotIdentityNormalize";
import { shortFormsFromLegalName } from "./paidProPartyNamePreserve";
import { isolateLegalEntityFromContaminatedName } from "./starterPartyIdentityIsolation";
import { isSignerTitleLikeRole } from "./starterRoleLabelGuard";
import {
  resolveCanonicalPartyRoleLabel,
  resolveStarterTwoPartyCommercialAuthority,
} from "./canonicalPartyRoleAuthority";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { repairDraftPartiesFromIntakeAuthority } from "./partySlotIdentityNormalize";

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

  const authority = resolveStarterTwoPartyCommercialAuthority(
    intakeText,
    parties.map((p) => String(p?.name ?? "")),
  );
  if (authority) {
    return {
      ...draft,
      parties: authority.parties.map((slot) => {
        const prev = parties.find((p) => partyLegalNamesMatch(p.name, slot.name)) ?? {};
        return { ...prev, name: slot.name, role: slot.role };
      }),
    };
  }

  return {
    ...draft,
    parties: parties.map((party, index) => {
      const role = String(party?.role ?? "").trim().toLowerCase();
      const preserveIntakeRole = Boolean(role && !GENERIC_STARTER_PARTY_ROLE.has(role) && !isSignerTitleLikeRole(role));
      if (preserveIntakeRole) {
        return {
          ...party,
          role: resolveCanonicalPartyRoleLabel({
            partyIndex: index,
            partyCount: parties.length,
            explicitRole: party?.role,
            agreementFamily: draft.agreement_family,
            preserveIntakeRole: true,
          }),
        };
      }
      return {
        ...party,
        role: resolveCanonicalPartyRoleLabel({
          partyIndex: index,
          partyCount: parties.length,
          agreementFamily: draft.agreement_family,
        }),
      };
    }),
  };
}

function resolveFullLegalPartiesForStarterPreview(
  partyNames: readonly string[],
  intakeRaw: string | null | undefined,
): string[] {
  const intake = String(intakeRaw || "").trim();
  const fromLineSeparated = extractLineSeparatedLegalEntityParties(intake);
  if (fromLineSeparated.length >= 2) return fromLineSeparated;
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

function countUppercaseLetters(s: string): number {
  return (s.match(/[A-Z]/g) || []).length;
}

/** Prefer draft/display casing when intake extraction is a weaker or truncated match. */
function preferStarterPreviewPartyDisplayName(draftName: string, candidate: string): string {
  const draft = String(draftName || "").replace(/\s+/g, " ").trim();
  const cand = String(candidate || "").replace(/\s+/g, " ").trim();
  if (!draft) return cand;
  if (!cand) return draft;
  const draftNorm = normalizeCompare(draft);
  const candNorm = normalizeCompare(cand);
  if (draftNorm === candNorm) {
    return countUppercaseLetters(draft) >= countUppercaseLetters(cand) ? draft : cand;
  }
  if (draftNorm.includes(candNorm) && draft.length > cand.length) return draft;
  if (candNorm.includes(draftNorm) && cand.length > draft.length) return cand;
  return cand;
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
  if (parties.length < 2) return inferStarterCommercialPartyRoles(draft, intakeText);

  const fullNames = resolveFullLegalPartiesForStarterPreview(
    parties.map((p) => String(p?.name ?? "")),
    intakeText,
  );
  if (fullNames.length < 2) return inferStarterCommercialPartyRoles(draft, intakeText);

  if (parties.length > 2) {
    const enriched = parties.map((party) => {
      const rawCurrent = String(party?.name ?? "").replace(/\s+/g, " ").trim();
      const current = isolateLegalEntityFromContaminatedName(rawCurrent);
      const matchedFull =
        fullNames.find((full) => partyLegalNamesMatch(full, current)) ||
        fullNames.find((full) => partyNameIsShortFormOf(full, current)) ||
        null;
      const resolvedName = preferStarterPreviewPartyDisplayName(rawCurrent, matchedFull || current);
      if (!resolvedName || resolvedName === rawCurrent) return party;
      return { ...party, name: resolvedName };
    });
    return { ...draft, parties: enriched };
  }

  const repairedParties = repairDraftPartiesFromIntakeAuthority(
    parties.map((p) => ({
      name: String(p?.name ?? ""),
      role: p?.role,
      email: p?.email,
      id: p?.id,
    })),
    intakeText,
  );
  const baseParties =
    repairedParties.length >= 2
      ? repairedParties
      : fullNames.length > parties.length
        ? fullNames.map((name, index) => parties[index] ?? { name, role: index === 0 ? "Client" : index === 1 ? "Service Provider" : "party" })
        : parties;

  const withRoles = inferStarterCommercialPartyRoles({ ...draft, parties: baseParties }, intakeText);
  const roleParties = Array.isArray(withRoles.parties) ? withRoles.parties : baseParties;

  const enriched = roleParties.map((party, index) => {
    const rawCurrent = String(party?.name ?? "").replace(/\s+/g, " ").trim();
    const originalDraftName = String(parties[index]?.name ?? "").replace(/\s+/g, " ").trim();
    const current = isolateLegalEntityFromContaminatedName(rawCurrent);
    const matchedFull =
      fullNames.find((full) => partyLegalNamesMatch(full, current)) ||
      fullNames.find((full) => partyLegalNamesMatch(full, originalDraftName)) ||
      fullNames.find((full) => partyNameIsShortFormOf(full, current)) ||
      fullNames.find((full) => partyNameIsShortFormOf(full, originalDraftName)) ||
      null;
    const resolvedName = preferStarterPreviewPartyDisplayName(
      originalDraftName || rawCurrent,
      matchedFull || current,
    );
    if (!resolvedName || resolvedName === rawCurrent) return party;
    return { ...party, name: resolvedName };
  });

  return { ...withRoles, parties: enriched };
}
