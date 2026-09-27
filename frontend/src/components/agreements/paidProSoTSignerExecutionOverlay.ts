/**
 * Render-time signature-region overlay on frozen Paid Pro SoT — does not mutate stored SoT bytes.
 */

import {
  fillBlankPreservedAddedPartySignerNames,
  shouldPreserveApprovedAddedPartyExecutionTail,
} from "./paidProDeclaredConsultantClientPaper";
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

const SIGNATURE_TAIL_LINE =
  /^(in witness whereof|by:|name:|title:|date:|signature|signed)\b|^[_\s.\-]+$/i;

/**
 * Accepted paper may continue with operative sentences after the witness heading.
 * Those lines are not an execution tail and must survive signer projection.
 */
function executionTailDropsFrozenOperative(frozenTail: string, overlaidTail: string): boolean {
  for (const line of frozenTail.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length < 40 || SIGNATURE_TAIL_LINE.test(trimmed)) continue;
    if (!overlaidTail.includes(trimmed)) return true;
  }
  return false;
}

/** After freeze, keep the accepted clause and take only the overlaid execution tail. */
export function preserveFrozenOperativeClause(frozenCorpus: string, overlaid: string): string {
  const frozenParts = splitFrozenOperativeAndExecution(frozenCorpus);
  const overlaidParts = splitFrozenOperativeAndExecution(overlaid);
  if (executionTailDropsFrozenOperative(frozenParts.tail, overlaidParts.tail)) return frozenCorpus;
  if (overlaidParts.clause === frozenParts.clause) return overlaid;
  if (!overlaidParts.tail) return frozenCorpus;
  return `${frozenParts.clause}${overlaidParts.tail}`;
}

export function applyPaidProSoTSignerExecutionOverlay(
  frozenCorpus: string,
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): string {
  const intake = roleContext?.intakeText ?? "";
  const hydrationParties = mergeLabeledPartyAuthorityIntoParties(parties, intake);
  const hydrationNames = hydrationParties.map((party) => party.partyLegalName);
  if (shouldPreserveApprovedAddedPartyExecutionTail(frozenCorpus, hydrationNames)) {
    return fillBlankPreservedAddedPartySignerNames(frozenCorpus, hydrationParties);
  }
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
  return preserveFrozenOperativeClause(frozenCorpus, finalized.text);
}
