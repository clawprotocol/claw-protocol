/**
 * Render-time signature-region overlay on frozen Paid Pro SoT — does not mutate stored SoT bytes.
 */

import { applySignerPartyIdentityToAuthoritativeAgreement } from "./guidedDealCompletion/signerPartyIdentity";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import {
  authorityPartiesToCanonicalPartyIdentities,
  type PaidProPartyRoleContext,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { fillPaidProSignatureNoticeFieldsAfterExecutionRepair } from "./paidProSignerSigningCorpusHygiene";
import { hasSignerMetadataForExecutionOverlay } from "./paidProSignerMetadataCommitPolicy";

export function applyPaidProSoTSignerExecutionOverlay(
  frozenCorpus: string,
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): string {
  if (!parties.length || !hasSignerMetadataForExecutionOverlay(parties)) {
    return frozenCorpus;
  }
  let text = enforcePaidProSingleExecutionBlock(frozenCorpus).text;
  if (parties.length >= 2) {
    text = fillPaidProSignatureNoticeFieldsAfterExecutionRepair(text, parties, roleContext).text;
    const identities = authorityPartiesToCanonicalPartyIdentities(parties, roleContext);
    const identityApply = applySignerPartyIdentityToAuthoritativeAgreement(
      text,
      identities,
      roleContext?.intakeText ?? "",
      { signatureRegionOnly: true },
    );
    if (!identityApply.rejected) {
      text = identityApply.text;
    }
  }
  return text;
}
