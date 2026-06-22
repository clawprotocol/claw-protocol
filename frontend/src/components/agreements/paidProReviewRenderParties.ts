/**
 * Party records for Paid Pro review/copy/signer surfaces — merges consumed authority, live UI, and universal signer metadata.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
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
import { resolveUniversalSignerMetadataBySlot } from "./universalSignerMetadataAuthority";
import {
  hasPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { isPaidProReviewSignerMetadataSessionActive } from "./paidProReviewRenderSessionGate";

export type ResolvePaidProReviewRenderPartiesArgs = {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  liveSignerMetadataUi?: LiveSignerMetadataUiState | null;
};

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

export function resolvePartiesForReviewRender(
  args?: ResolvePaidProReviewRenderPartiesArgs,
): PaidProSignerMetadataParty[] {
  const intakeRaw = (args?.intakeText ?? "").trim();
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
    return labeledAuthority;
  }

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
  const acceptedCorpus = hasPaidProSourceOfTruth() ? getPaidProSourceOfTruthText() : null;
  const draftPartyNames =
    args?.draft?.parties?.map((p) => String((p as { name?: string }).name ?? "").trim()) ?? null;
  const slotCount = resolveAuthoritativeSignerCount({
    intakeText: intakeRaw || null,
    draftPartyNames: draftPartyNames ?? undefined,
    draftParties: args?.draft?.parties,
  }).count;
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
