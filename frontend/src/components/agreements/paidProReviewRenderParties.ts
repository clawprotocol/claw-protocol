/**
 * Party records for Paid Pro review/copy/signer surfaces — merges consumed authority, live UI, and universal signer metadata.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { mergeCanonicalPartyAddresses } from "./canonicalPartyStructuredAddress";
import {
  resolveCanonicalPartyIdentitiesFromIntake,
  resolveCanonicalPartyIdentitiesFromSources,
} from "./canonicalPartyIdentityResolver";
import {
  buildPaidProSignerMetadataParties,
  mergeLabeledPartyAuthorityIntoParties,
  readConsumedPaidProSignerMetadataAuthority,
  type LiveSignerMetadataUiState,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import {
  canonicalBundleToAuthorityParties,
  readCanonicalPartyMetadata,
} from "./canonicalPartyMetadataAuthority";
import { resolveUniversalSignerMetadataBySlot } from "./universalSignerMetadataAuthority";
import {
  hasPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import {
  paidProSignerMetadataPartiesFromFrozenManifest,
  readFrozenCanonicalManifestPartyNames,
} from "./frozenCanonicalManifestAuthority";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { isPaidProReviewSignerMetadataSessionActive } from "./paidProReviewRenderSessionGate";
import {
  buildSignerMetadataPartiesFromIntakeManifest,
  intakePartyManifestIsAuthoritative,
} from "./intakePartyManifestAuthority";

export type ResolvePaidProReviewRenderPartiesArgs = {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  liveSignerMetadataUi?: LiveSignerMetadataUiState | null;
};

function mergeCanonicalBundleWhenSignerMetadataPresent(
  parties: readonly PaidProSignerMetadataParty[],
  intakeRaw: string,
): PaidProSignerMetadataParty[] {
  const merged = mergeLabeledPartyAuthorityIntoParties(parties, intakeRaw);
  const canonical = readCanonicalPartyMetadata();
  if (!canonical?.parties?.length) return merged;
  const fromCanonical = canonicalBundleToAuthorityParties(canonical);
  const hasSignerSignal = fromCanonical.some(
    (p) => p.signerName.trim() || p.signerEmail.trim() || p.signerTitle.trim() || p.partyAddress.trim(),
  );
  if (!hasSignerSignal) return merged;
  const cap = Math.max(merged.length, fromCanonical.length);
  const out: PaidProSignerMetadataParty[] = [];
  for (let i = 0; i < cap; i += 1) {
    const base = merged[i] ?? fromCanonical[i];
    const canon = fromCanonical[i];
    if (!base) {
      if (canon) out.push(canon);
      continue;
    }
    if (!canon) {
      out.push(base);
      continue;
    }
    out.push({
      ...base,
      partyLegalName: base.partyLegalName.trim() || canon.partyLegalName,
      signerName: base.signerName.trim() || canon.signerName,
      signerTitle: base.signerTitle.trim() || canon.signerTitle,
      signerEmail: base.signerEmail.trim() || canon.signerEmail,
      partyAddress: mergeCanonicalPartyAddresses(base.partyAddress, canon.partyAddress),
    });
  }
  return out.length ? out : merged;
}

function pickSignerField(
  consumed: string,
  live: string,
  preferLive: boolean,
): string {
  const c = consumed.trim();
  const l = live.trim();
  if (preferLive) return l || c;
  return c || l;
}

function mergeLiveSignerFieldsOntoParties(
  base: readonly PaidProSignerMetadataParty[],
  live: readonly PaidProSignerMetadataParty[] | null,
  preferLiveOverConsumed = false,
): PaidProSignerMetadataParty[] {
  if (!live?.length) return [...base];
  return base.map((party, index) => {
    const slot = live[index];
    if (!slot) return party;
    return {
      ...party,
      partyLegalName: pickSignerField(party.partyLegalName, slot.partyLegalName, preferLiveOverConsumed),
      signerEmail: pickSignerField(party.signerEmail, slot.signerEmail, preferLiveOverConsumed),
      signerName: pickSignerField(party.signerName, slot.signerName, preferLiveOverConsumed),
      signerTitle: pickSignerField(party.signerTitle, slot.signerTitle, preferLiveOverConsumed),
      partyAddress: pickSignerField(party.partyAddress, slot.partyAddress, preferLiveOverConsumed),
    };
  });
}

function mergeFrozenManifestParties(
  base: readonly PaidProSignerMetadataParty[],
  intakeRaw: string,
  liveParties: readonly PaidProSignerMetadataParty[] | null,
  preferLiveSignerFields: boolean,
): PaidProSignerMetadataParty[] {
  const frozen = paidProSignerMetadataPartiesFromFrozenManifest();
  if (frozen.length < 3) return [...base];
  const mergedFrozen = mergeLiveSignerFieldsOntoParties(frozen, liveParties, preferLiveSignerFields);
  if (base.length >= 3) {
    return mergeLabeledPartyAuthorityIntoParties(
      mergeLiveSignerFieldsOntoParties(base, mergedFrozen, false),
      intakeRaw,
    );
  }
  return mergeLabeledPartyAuthorityIntoParties(mergedFrozen, intakeRaw);
}

/**
 * TEST539 — restore canonical party identity onto any slot whose resolved legal name was dropped or
 * degraded to a placeholder (empty / "Party N") by a prior generation attempt's contaminated
 * consumed authority. Once the intake manifest authoritatively resolves the real legal entity for a
 * slot, that identity is the authority and must survive into review/notice/signer surfaces. Only
 * non-authoritative slots are rewritten; count and all other slots/signer fields are preserved, so
 * genuine 5-party intakes and real party identities are untouched.
 */
function overlayIntakeManifestIdentityOntoContaminatedSlots(
  parties: readonly PaidProSignerMetadataParty[],
  intakeRaw: string,
): PaidProSignerMetadataParty[] {
  if (!intakeRaw || !intakePartyManifestIsAuthoritative(intakeRaw)) return [...parties];
  const manifest = buildSignerMetadataPartiesFromIntakeManifest(intakeRaw);
  if (manifest.length < 2) return [...parties];
  return parties.map((party, index) => {
    const name = party.partyLegalName.trim();
    if (name.length >= 2 && isAuthoritativeLegalEntityName(name)) return party;
    const manifestName = manifest[index]?.partyLegalName?.trim() ?? "";
    if (manifestName.length >= 2 && isAuthoritativeLegalEntityName(manifestName)) {
      return {
        ...party,
        partyLegalName: manifestName,
        partyAddress: party.partyAddress?.trim() || manifest[index]?.partyAddress?.trim() || "",
      };
    }
    return party;
  });
}

export function resolvePartiesForReviewRender(
  args?: ResolvePaidProReviewRenderPartiesArgs,
): PaidProSignerMetadataParty[] {
  const resolved = resolvePartiesForReviewRenderCore(args);
  return overlayIntakeManifestIdentityOntoContaminatedSlots(resolved, (args?.intakeText ?? "").trim());
}

function resolvePartiesForReviewRenderCore(
  args?: ResolvePaidProReviewRenderPartiesArgs,
): PaidProSignerMetadataParty[] {
  const intakeRaw = (args?.intakeText ?? "").trim();
  const draftPartyNames =
    args?.draft?.parties?.map((p) => String((p as { name?: string }).name ?? "").trim()) ?? null;
  const slotCount = resolveAuthoritativeSignerCount({
    intakeText: intakeRaw || null,
    draftPartyNames: draftPartyNames ?? undefined,
    draftParties: args?.draft?.parties,
  }).count;
  const draftAuthoritative =
    args?.draft?.parties
      ?.map((p) => String((p as { name?: string }).name ?? "").trim())
      .filter((name) => name.length >= 2 && isAuthoritativeLegalEntityName(name)) ?? [];

  const partiesFromDraftAuthority = (): PaidProSignerMetadataParty[] | null => {
    if (draftAuthoritative.length < slotCount) return null;
    const acceptedCorpus = hasPaidProSourceOfTruth() ? getPaidProSourceOfTruthText() : null;
    const legalEntities = draftAuthoritative.slice(0, slotCount);
    const universal = resolveUniversalSignerMetadataBySlot({
      legalEntities,
      intakeText: intakeRaw || null,
      corpusText: acceptedCorpus,
      draftParties: args?.draft?.parties?.map((p) => ({
        name: String((p as { name?: string }).name ?? ""),
        signerName: (p as { signerName?: string }).signerName,
        signerTitle: (p as { signerTitle?: string }).signerTitle,
      })),
      uiSignerNames: args?.liveSignerMetadataUi?.partySignerNames,
      uiSignerTitles: args?.liveSignerMetadataUi?.partySignerTitles,
    });
    return mergeLabeledPartyAuthorityIntoParties(
      legalEntities.map((partyLegalName, partyIndex) => {
        const slot = universal[partyIndex];
        return {
          partyIndex,
          partyLegalName,
          signerEmail: "",
          signerName: (slot?.signerName?.trim() || "").trim(),
          signerTitle: (slot?.signerTitle?.trim() || "").trim(),
          partyAddress: "",
        };
      }),
      intakeRaw,
    );
  };

  const draftAuthorityParties = partiesFromDraftAuthority();
  if (draftAuthorityParties) {
    // Draft legal names win for entity slots, but consumed/live signer email/name/title
    // must still merge — otherwise diagnostics and notice hydration lose @emails.
    const consumed = readConsumedPaidProSignerMetadataAuthority()?.parties ?? null;
    const liveParties = args?.liveSignerMetadataUi
      ? buildPaidProSignerMetadataParties(args.liveSignerMetadataUi)
      : null;
    const preferLive = isPaidProReviewSignerMetadataSessionActive();
    const mergedMeta = mergeLiveSignerFieldsOntoParties(
      mergeLiveSignerFieldsOntoParties(draftAuthorityParties, consumed, false),
      liveParties,
      preferLive,
    );
    return mergeCanonicalBundleWhenSignerMetadataPresent(mergedMeta, intakeRaw);
  }

  const frozenManifestNames = readFrozenCanonicalManifestPartyNames();
  const livePartiesEarly = args?.liveSignerMetadataUi
    ? buildPaidProSignerMetadataParties(args.liveSignerMetadataUi)
    : null;
  const preferLiveSignerFieldsEarly = isPaidProReviewSignerMetadataSessionActive();

  if (frozenManifestNames.length >= 3 && !intakeRaw) {
    return mergeFrozenManifestParties([], intakeRaw, livePartiesEarly, preferLiveSignerFieldsEarly);
  }

  const labeledAuthority = intakeRaw
    ? mergeLabeledPartyAuthorityIntoParties([], intakeRaw)
    : [];
  const liveParties = args?.liveSignerMetadataUi
    ? buildPaidProSignerMetadataParties(args.liveSignerMetadataUi)
    : null;
  const preferLiveSignerFields = isPaidProReviewSignerMetadataSessionActive();

  if (labeledAuthority.length >= 3) {
    const consumed = readConsumedPaidProSignerMetadataAuthority()?.parties;
    if (consumed && consumed.length >= 2) {
      return mergeLabeledPartyAuthorityIntoParties(
        mergeLiveSignerFieldsOntoParties(consumed, liveParties, preferLiveSignerFields),
        intakeRaw,
      );
    }
    if (liveParties && liveParties.length >= 2) {
      return mergeLabeledPartyAuthorityIntoParties(liveParties, intakeRaw);
    }
    if (labeledAuthority.length >= slotCount) {
      return mergeCanonicalBundleWhenSignerMetadataPresent(labeledAuthority, intakeRaw);
    }
    const fromDraft = partiesFromDraftAuthority();
    if (fromDraft) return fromDraft;
    return labeledAuthority;
  }

  const consumed = readConsumedPaidProSignerMetadataAuthority()?.parties;
  if (consumed && consumed.length >= 2) {
    const merged = mergeCanonicalBundleWhenSignerMetadataPresent(
      mergeLabeledPartyAuthorityIntoParties(
        mergeLiveSignerFieldsOntoParties(consumed, liveParties, preferLiveSignerFields),
        intakeRaw,
      ),
      intakeRaw,
    );
    if (frozenManifestNames.length >= 3 && merged.length < frozenManifestNames.length) {
      return mergeFrozenManifestParties(merged, intakeRaw, liveParties, preferLiveSignerFields);
    }
    return merged;
  }
  if (frozenManifestNames.length >= 3) {
    return mergeFrozenManifestParties([], intakeRaw, liveParties, preferLiveSignerFields);
  }
  if (liveParties && liveParties.length >= 2) {
    return mergeLabeledPartyAuthorityIntoParties(liveParties, intakeRaw);
  }
  const acceptedCorpus = hasPaidProSourceOfTruth() ? getPaidProSourceOfTruthText() : null;
  const records = acceptedCorpus
    ? resolveCanonicalPartyIdentitiesFromSources({
        rawIntake: intakeRaw || null,
        starterNames: draftPartyNames,
        generatedBody: labeledAuthority.length >= 3 ? null : acceptedCorpus,
      })
    : resolveCanonicalPartyIdentitiesFromIntake(intakeRaw || null, draftPartyNames);
  if (records.length < 2) return consumed ?? [];

  const legalEntities = records.slice(0, slotCount).map((r) => r.fullLegalName);
  const universal = resolveUniversalSignerMetadataBySlot({
    legalEntities,
    intakeText: intakeRaw || null,
    corpusText: acceptedCorpus,
    draftParties: args?.draft?.parties?.map((p) => ({
      name: String((p as { name?: string }).name ?? ""),
      signerName: (p as { signerName?: string }).signerName,
      signerTitle: (p as { signerTitle?: string }).signerTitle,
    })),
    uiSignerNames: args?.liveSignerMetadataUi?.partySignerNames,
    uiSignerTitles: args?.liveSignerMetadataUi?.partySignerTitles,
  });

  return mergeLabeledPartyAuthorityIntoParties(
    records.slice(0, slotCount).map((record, partyIndex) => {
      const slot = universal[partyIndex];
      return {
        partyIndex,
        partyLegalName: record.fullLegalName,
        signerEmail: "",
        signerName: (record.signerName?.trim() || slot?.signerName?.trim() || "").trim(),
        signerTitle: (record.signerTitle?.trim() || slot?.signerTitle?.trim() || "").trim(),
        partyAddress: "",
      };
    }),
    intakeRaw,
  );
}
