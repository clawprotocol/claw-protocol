/**
 * Render-time signature-region overlay on frozen Paid Pro SoT — does not mutate stored SoT bytes.
 */

import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import {
  mergeLabeledPartyAuthorityIntoParties,
  type PaidProPartyRoleContext,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { finalizePaidProSigningCorpusText } from "./paidProSignerSigningCorpusHygiene";
import { shouldApplyExecutionBlockSignerOverlay } from "./paidProSignerMetadataCommitPolicy";

export function applyPaidProSoTSignerExecutionOverlay(
  frozenCorpus: string,
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): string {
  const intake = roleContext?.intakeText ?? "";
  const hydrationParties = mergeLabeledPartyAuthorityIntoParties(parties, intake);
  if (
    !hydrationParties.length ||
    !shouldApplyExecutionBlockSignerOverlay({ parties: hydrationParties, intakeText: intake })
  ) {
    return frozenCorpus;
  }
  const ctx: PaidProPartyRoleContext = {
    ...roleContext,
    intakeText: (intake || roleContext?.intakeText) ?? null,
    acceptedCorpus: roleContext?.acceptedCorpus ?? frozenCorpus,
    draftPartyNames:
      roleContext?.draftPartyNames ?? hydrationParties.map((p) => p.partyLegalName),
  };
  let text = enforcePaidProSingleExecutionBlock(frozenCorpus, {
    authorityParties: hydrationParties,
    intakeText: ctx.intakeText ?? null,
    draftPartyNames: ctx.draftPartyNames ?? null,
  }).text;
  const finalized = finalizePaidProSigningCorpusText(text, hydrationParties, ctx);
  return finalized.text;
}
