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

function splitFrozenOperativeAndExecution(text: string): { clause: string; tail: string } {
  const idx = (text || "").search(/\bIN WITNESS WHEREOF\b/i);
  if (idx < 0) return { clause: text, tail: "" };
  return { clause: text.slice(0, idx), tail: text.slice(idx) };
}

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
  const frozenParts = splitFrozenOperativeAndExecution(frozenCorpus);
  const overlaidParts = splitFrozenOperativeAndExecution(finalized.text);
  // After freeze, signer overlay may change execution/signature/date presentation only.
  if (overlaidParts.clause !== frozenParts.clause) {
    if (!overlaidParts.tail) return frozenCorpus;
    return `${frozenParts.clause}${overlaidParts.tail}`;
  }
  return finalized.text;
}
