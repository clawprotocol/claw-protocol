/**
 * Orchestrates universal signer metadata seeding across Paid Pro UI and draft state.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  alignIntakeSignerMetadataToLegalEntities,
  mergeIntakeSignerMetadataIntoAuthorityParties,
} from "./intakeSignerMetadataAuthority";
import type { PremiumRecipientHandoffV2 } from "./premiumPartyNamesHandoff";
import { logPaidProSignerMetadataPipelineDiagnostics } from "./paidProSignerMetadataPipelineDiagnostics";
import {
  linearPremiumRecipientSlots,
  writePremiumRecipientHandoffFromAuthorityParties,
  writePremiumRecipientHandoffSignerMetadata,
} from "./premiumPartyNamesHandoff";
import {
  detectAndLogSignerMetadataLoss,
  hydrateSignerMetadataArraysNonDestructive,
  logSignerMetadataHandoff,
  mergeSignerMetadataIntoDraftParties,
  presenceFromResolved,
  resolveUniversalSignerMetadataBySlot,
  type UniversalSignerMetadataSources,
} from "./universalSignerMetadataAuthority";

export type PaidProSignerMetadataSeedArgs = {
  stage: string;
  legalEntities: readonly string[];
  intakeText?: string | null;
  corpusText?: string | null;
  draft?: ParsedDraftShape | null;
  handoff?: PremiumRecipientHandoffV2 | null;
  uiSignerNames?: readonly string[];
  uiSignerTitles?: readonly string[];
  uiSignerEmails?: readonly string[];
  uiPartyAddresses?: readonly string[];
  authoritativePartyCount?: number;
};

export type PaidProSignerMetadataSeedResult = {
  names: string[];
  titles: string[];
  emails: string[];
  addresses: string[];
  uiChanged: boolean;
  contactFieldsChanged: boolean;
  draft: ParsedDraftShape | null;
  draftChanged: boolean;
};

function hydrateStringArrayNonDestructive(
  current: readonly string[],
  resolved: readonly string[],
  count: number,
): { values: string[]; changed: boolean } {
  const values = current.slice(0, count);
  while (values.length < count) values.push("");
  let changed = false;
  for (let i = 0; i < count; i++) {
    const cur = (values[i] ?? "").trim();
    const next = (resolved[i] ?? "").trim();
    if (!cur && next) {
      values[i] = next;
      changed = true;
    }
  }
  return { values, changed };
}

export function runPaidProSignerMetadataAuthoritySeed(
  args: PaidProSignerMetadataSeedArgs,
): PaidProSignerMetadataSeedResult {
  const partyCount = Math.max(
    args.authoritativePartyCount ?? 0,
    args.legalEntities.length,
    args.uiSignerNames?.length ?? 0,
    2,
  );
  const intakeAligned = alignIntakeSignerMetadataToLegalEntities(args.intakeText, args.legalEntities);
  const canonicalLegalEntities = intakeAligned.map((s) => s.partyLegalName || args.legalEntities[s.partyIndex] || "");

  const sources: UniversalSignerMetadataSources = {
    legalEntities: canonicalLegalEntities,
    intakeText: args.intakeText,
    corpusText: args.corpusText,
    draftParties: args.draft?.parties ?? null,
    handoff: args.handoff ?? null,
    uiSignerNames: args.uiSignerNames,
    uiSignerTitles: args.uiSignerTitles,
  };
  const resolved = resolveUniversalSignerMetadataBySlot(sources);
  const presence = presenceFromResolved(args.stage, resolved);
  logSignerMetadataHandoff(presence);
  detectAndLogSignerMetadataLoss(presence);

  const hydrated = hydrateSignerMetadataArraysNonDestructive({
    currentNames: args.uiSignerNames ?? [],
    currentTitles: args.uiSignerTitles ?? [],
    resolved,
    stage: args.stage,
  });

  const intakeNames = intakeAligned.map((s) => s.signerName);
  const intakeTitles = intakeAligned.map((s) => s.signerTitle);
  const intakeEmails = intakeAligned.map((s) => s.signerEmail);
  const intakeAddresses = intakeAligned.map((s) => s.partyAddress);

  const namesHydrated = hydrateStringArrayNonDestructive(hydrated.names, intakeNames, partyCount);
  const titlesHydrated = hydrateStringArrayNonDestructive(hydrated.titles, intakeTitles, partyCount);
  const emailsHydrated = hydrateStringArrayNonDestructive(args.uiSignerEmails ?? [], intakeEmails, partyCount);
  const addressesHydrated = hydrateStringArrayNonDestructive(
    args.uiPartyAddresses ?? [],
    intakeAddresses,
    partyCount,
  );

  const names = namesHydrated.values;
  const titles = titlesHydrated.values;
  const emails = emailsHydrated.values;
  const addresses = addressesHydrated.values;
  const uiChanged =
    hydrated.changed || namesHydrated.changed || titlesHydrated.changed;
  const contactFieldsChanged = emailsHydrated.changed || addressesHydrated.changed;

  let draft = args.draft ?? null;
  let draftChanged = false;
  if (draft) {
    const merged = mergeSignerMetadataIntoDraftParties(draft, resolved);
    draftChanged = merged !== draft;
    draft = merged as ParsedDraftShape;
  }

  const authorityParties = mergeIntakeSignerMetadataIntoAuthorityParties(
    intakeAligned.map((slot, i) => ({
      partyIndex: i,
      partyLegalName: slot.partyLegalName,
      signerEmail: emails[i] ?? slot.signerEmail,
      signerName: names[i] ?? slot.signerName,
      signerTitle: titles[i] ?? slot.signerTitle,
      partyAddress: addresses[i] ?? slot.partyAddress,
    })),
    args.intakeText,
    canonicalLegalEntities,
  );

  const hasSignerSignal = authorityParties.some(
    (p) =>
      p.signerName.trim() ||
      p.signerTitle.trim() ||
      p.signerEmail.trim() ||
      p.partyAddress.trim(),
  );

  if (hasSignerSignal) {
    writePremiumRecipientHandoffFromAuthorityParties(authorityParties);
  } else if (hydrated.changed) {
    writePremiumRecipientHandoffSignerMetadata({
      signerNames: names,
      signerTitles: titles,
      partyLegalNames: canonicalLegalEntities,
      partyEmails: emails,
      partyAddresses: addresses,
      authoritativePartyCount: partyCount,
    });
  }

  logPaidProSignerMetadataPipelineDiagnostics({
    stage: args.stage,
    intakeRaw: args.intakeText,
    legalEntities: canonicalLegalEntities,
    draftParties: draft?.parties ?? undefined,
    uiSignerNames: names,
    uiSignerTitles: titles,
    executionBlockSignerSource: hasSignerSignal ? "intake_signer_metadata_authority" : null,
  });

  return {
    names,
    titles,
    emails,
    addresses,
    uiChanged,
    contactFieldsChanged,
    draft,
    draftChanged,
  };
}

/** Read current handoff emails/addresses for non-destructive seed merge. */
export function readHandoffContactFieldsForSeed(
  handoff: PremiumRecipientHandoffV2 | null | undefined,
  partyCount: number,
): { emails: string[]; addresses: string[] } {
  const slots = linearPremiumRecipientSlots(handoff ?? null, Math.max(partyCount, 2));
  return {
    emails: slots.map((s) => String(s.email ?? "").trim()),
    addresses: slots.map((s) => String(s.partyAddress ?? "").trim()),
  };
}
