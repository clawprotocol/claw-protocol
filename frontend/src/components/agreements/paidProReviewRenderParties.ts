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
import { hasPaidProSourceOfTruth, getPaidProSourceOfTruthText } from "./paidProSourceOfTruth";

export type ResolvePaidProReviewRenderPartiesArgs = {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  liveSignerMetadataUi?: LiveSignerMetadataUiState | null;
};

function mergeLiveSignerFieldsOntoParties(
  base: readonly PaidProSignerMetadataParty[],
  live: readonly PaidProSignerMetadataParty[] | null,
): PaidProSignerMetadataParty[] {
  if (!live?.length) return [...base];
  return base.map((party, index) => {
    const slot = live[index];
    if (!slot) return party;
    return {
      ...party,
      partyLegalName: party.partyLegalName.trim() || slot.partyLegalName,
      signerEmail: party.signerEmail.trim() || slot.signerEmail,
      signerName: party.signerName.trim() || slot.signerName,
      signerTitle: party.signerTitle.trim() || slot.signerTitle,
      partyAddress: party.partyAddress.trim() || slot.partyAddress,
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

  if (labeledAuthority.length >= 3) {
    const consumed = readConsumedPaidProSignerMetadataAuthority()?.parties;
    if (consumed && consumed.length >= 2) {
      return mergeLabeledPartyAuthorityIntoParties(
        mergeLiveSignerFieldsOntoParties(consumed, liveParties),
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
      mergeLiveSignerFieldsOntoParties(consumed, liveParties),
      intakeRaw,
    );
  }
  if (liveParties && liveParties.length >= 2) {
    return mergeLabeledPartyAuthorityIntoParties(liveParties, intakeRaw);
  }
  const acceptedCorpus = hasPaidProSourceOfTruth() ? getPaidProSourceOfTruthText() : null;
  const draftPartyNames =
    args?.draft?.parties?.map((p) => String((p as { name?: string }).name ?? "").trim()) ?? null;
  const records = acceptedCorpus
    ? resolveCanonicalPartyIdentitiesFromSources({
        rawIntake: intakeRaw || null,
        starterNames: draftPartyNames,
        generatedBody: acceptedCorpus,
      })
    : resolveCanonicalPartyIdentitiesFromIntake(intakeRaw || null, draftPartyNames);
  if (records.length < 2) return consumed ?? [];

  const legalEntities = records.map((r) => r.fullLegalName);
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
    records.slice(0, 12).map((record, partyIndex) => {
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
