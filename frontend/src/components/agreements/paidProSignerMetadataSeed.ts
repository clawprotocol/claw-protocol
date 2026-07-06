/**
 * Orchestrates canonical party metadata seeding — single mutable owner, projections only downstream.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  logCanonicalPartyMetadataDiagnostics,
  mapCanonicalStageFromSeedStage,
  mutateCanonicalPartyMetadata,
  readCanonicalPartyMetadata,
} from "./canonicalPartyMetadataAuthority";
import { alignIntakeSignerMetadataToLegalEntities } from "./structuredIntakePartyContactParse";
import { mergeCanonicalPartyAddresses } from "./canonicalPartyStructuredAddress";
import { resolveLegalEntitiesForCanonicalMetadata } from "./canonicalLegalEntitiesForMetadata";
import type { PremiumRecipientHandoffV2 } from "./premiumPartyNamesHandoff";
import { logPaidProSignerMetadataPipelineDiagnostics } from "./paidProSignerMetadataPipelineDiagnostics";
import { linearPremiumRecipientSlots } from "./premiumPartyNamesHandoff";
import { readConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { readSignerMetadataEffectiveMax } from "./signerMetadataEffective";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import {
  detectAndLogSignerMetadataLoss,
  hydrateSignerMetadataArraysNonDestructive,
  logSignerMetadataHandoff,
  mergeSignerMetadataIntoDraftParties,
  presenceFromResolved,
  resolveUniversalSignerMetadataBySlotForCanonicalSeed,
  type ResolvedEntitySignerMetadata,
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

function buildUiPartiesFromSeedArgs(
  args: PaidProSignerMetadataSeedArgs,
  partyCount: number,
  legalEntities: readonly string[],
  intakeAligned: ReturnType<typeof alignIntakeSignerMetadataToLegalEntities>,
  resolved: readonly ResolvedEntitySignerMetadata[],
  handoffContacts: { emails: string[]; addresses: string[] },
): PaidProSignerMetadataParty[] {
  const parties: PaidProSignerMetadataParty[] = [];
  for (let i = 0; i < partyCount; i += 1) {
    const slot = intakeAligned[i];
    const uni = resolved[i];
    parties.push({
      partyIndex: i,
      partyLegalName: legalEntities[i] || slot?.partyLegalName || "",
      signerName:
        (args.uiSignerNames?.[i] ?? "").trim() ||
        uni?.signerName ||
        slot?.signerName ||
        "",
      signerTitle:
        (args.uiSignerTitles?.[i] ?? "").trim() ||
        uni?.signerTitle ||
        slot?.signerTitle ||
        "",
      signerEmail:
        (args.uiSignerEmails?.[i] ?? "").trim() ||
        slot?.signerEmail ||
        handoffContacts.emails[i] ||
        "",
      partyAddress: mergeCanonicalPartyAddresses(
        slot?.partyAddress || handoffContacts.addresses[i] || "",
        args.uiPartyAddresses?.[i] ?? "",
      ),
    });
  }
  return parties;
}

export function runPaidProSignerMetadataAuthoritySeed(
  args: PaidProSignerMetadataSeedArgs,
): PaidProSignerMetadataSeedResult {
  const resolvedLegalEntities = resolveLegalEntitiesForCanonicalMetadata({
    legalEntities: args.legalEntities,
    intakeText: args.intakeText,
    draft: args.draft ?? null,
  });
  const partyCount = (() => {
    const consumedCount =
      readConsumedPaidProSignerMetadataAuthority()?.parties?.filter(
        (p) => String(p.partyLegalName ?? "").trim().length >= 2,
      ).length ?? 0;
    const effectiveMax = readSignerMetadataEffectiveMax().partySlots;
    const raw = Math.max(
      args.authoritativePartyCount ?? 0,
      resolvedLegalEntities.length,
      consumedCount,
      effectiveMax,
      args.uiSignerNames?.length ?? 0,
      2,
    );
    if (args.authoritativePartyCount != null && args.authoritativePartyCount >= 2) {
      return Math.min(raw, args.authoritativePartyCount);
    }
    return raw;
  })();
  const intakeAligned = alignIntakeSignerMetadataToLegalEntities(args.intakeText, resolvedLegalEntities);
  const canonicalLegalEntities = intakeAligned.map(
    (s, i) => s.partyLegalName || resolvedLegalEntities[i] || args.legalEntities[i] || "",
  );

  const sources: UniversalSignerMetadataSources = {
    legalEntities: canonicalLegalEntities,
    intakeText: args.intakeText,
    corpusText: null,
    draftParties: args.draft?.parties ?? null,
    handoff: args.handoff ?? null,
    uiSignerNames: args.uiSignerNames,
    uiSignerTitles: args.uiSignerTitles,
  };
  const resolved = resolveUniversalSignerMetadataBySlotForCanonicalSeed(sources);
  const presence = presenceFromResolved(args.stage, resolved);
  logSignerMetadataHandoff(presence);
  detectAndLogSignerMetadataLoss(presence);

  const hydrated = hydrateSignerMetadataArraysNonDestructive({
    currentNames: args.uiSignerNames ?? [],
    currentTitles: args.uiSignerTitles ?? [],
    resolved,
    stage: args.stage,
  });

  const handoffContacts = readHandoffContactFieldsForSeed(args.handoff ?? null, partyCount);
  const uiParties = buildUiPartiesFromSeedArgs(
    args,
    partyCount,
    canonicalLegalEntities,
    intakeAligned,
    resolved,
    handoffContacts,
  );
  const hasUserEdits = uiParties.some(
    (_, i) =>
      (args.uiSignerNames?.[i] ?? "").trim() ||
      (args.uiSignerTitles?.[i] ?? "").trim(),
  );

  const canonicalStage = mapCanonicalStageFromSeedStage(args.stage);
  const bundle = mutateCanonicalPartyMetadata({
    stage: canonicalStage,
    legalEntities: canonicalLegalEntities,
    intakeText: args.intakeText,
    uiParties,
    mutationSource: hasUserEdits ? "user_edited_ui" : "structured_intake",
    replaceSession: false,
    project: true,
  });

  const names = bundle.parties.map((p) => p.signerName);
  const titles = bundle.parties.map((p) => p.signerTitle);
  const emails = bundle.parties.map((p) => p.signerEmail);
  const addresses = bundle.parties.map((p) => p.partyAddress);
  const intakeAddresses = intakeAligned.map((s) => s.partyAddress);
  const finalAddresses = Array.from({ length: partyCount }, (_, i) =>
    mergeCanonicalPartyAddresses(addresses[i] ?? "", intakeAddresses[i] ?? ""),
  );

  const resolvedNames = resolved.map((r) => r.signerName);
  const resolvedTitles = resolved.map((r) => r.signerTitle);
  const namesHydrated = hydrateStringArrayNonDestructive(names, resolvedNames, partyCount);
  const titlesHydrated = hydrateStringArrayNonDestructive(titles, resolvedTitles, partyCount);
  const intakeNames = intakeAligned.map((s) => s.signerName);
  const intakeTitles = intakeAligned.map((s) => s.signerTitle);
  const finalNames = hydrateStringArrayNonDestructive(namesHydrated.values, intakeNames, partyCount);
  const finalTitles = hydrateStringArrayNonDestructive(titlesHydrated.values, intakeTitles, partyCount);

  const uiWasEmpty =
    !(args.uiSignerNames ?? []).some((n) => n.trim()) &&
    !(args.uiSignerTitles ?? []).some((t) => t.trim());
  const uiChanged =
    hydrated.changed ||
    finalNames.changed ||
    finalTitles.changed ||
    (uiWasEmpty &&
      bundle.parties.some((p) => p.signerName.trim() || p.signerTitle.trim()));
  const contactFieldsChanged =
    emails.some(Boolean) ||
    finalAddresses.some(Boolean) ||
    finalNames.changed ||
    finalTitles.changed ||
    bundle.parties.some((p) => p.partyLegalName.trim() || p.partyAddress.trim());

  let draft = args.draft ?? null;
  let draftChanged = false;
  if (draft) {
    const merged = mergeSignerMetadataIntoDraftParties(draft, resolved);
    draftChanged = merged !== draft;
    draft = merged as ParsedDraftShape;
  }

  const hasSignerSignal = bundle.parties.some(
    (p) => p.signerName.trim() || p.signerTitle.trim() || p.signerEmail.trim() || p.partyAddress.trim(),
  );

  logPaidProSignerMetadataPipelineDiagnostics({
    stage: args.stage,
    intakeRaw: args.intakeText,
    legalEntities: canonicalLegalEntities,
    draftParties: draft?.parties ?? undefined,
    uiSignerNames: finalNames.values,
    uiSignerTitles: finalTitles.values,
    executionBlockSignerSource: hasSignerSignal ? "canonical_party_metadata_authority" : null,
  });

  logCanonicalPartyMetadataDiagnostics(canonicalStage, readCanonicalPartyMetadata() ?? bundle);

  return {
    names: finalNames.values,
    titles: finalTitles.values,
    emails,
    addresses: finalAddresses,
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
