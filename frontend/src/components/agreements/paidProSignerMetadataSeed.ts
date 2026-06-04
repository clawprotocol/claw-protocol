/**
 * Orchestrates universal signer metadata seeding across Paid Pro UI and draft state.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PremiumRecipientHandoffV2 } from "./premiumPartyNamesHandoff";
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
};

export type PaidProSignerMetadataSeedResult = {
  names: string[];
  titles: string[];
  uiChanged: boolean;
  draft: ParsedDraftShape | null;
  draftChanged: boolean;
};

export function runPaidProSignerMetadataAuthoritySeed(
  args: PaidProSignerMetadataSeedArgs,
): PaidProSignerMetadataSeedResult {
  const sources: UniversalSignerMetadataSources = {
    legalEntities: args.legalEntities,
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

  let draft = args.draft ?? null;
  let draftChanged = false;
  if (draft) {
    const merged = mergeSignerMetadataIntoDraftParties(draft, resolved);
    draftChanged = merged !== draft;
    draft = merged as ParsedDraftShape;
  }

  return {
    names: hydrated.names,
    titles: hydrated.titles,
    uiChanged: hydrated.changed,
    draft,
    draftChanged,
  };
}
