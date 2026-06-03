/**
 * Canonical party legal names for signing corpus — slot-isolated, never fused across parties.
 */

import type { CanonicalPartyIdentity } from "./guidedDealCompletion/signerPartyIdentity";
import { rebuildSignatureBlocksWithPartyIdentities } from "./guidedDealCompletion/signerPartyIdentity";
import {
  authorityPartiesToCanonicalPartyIdentities,
  type PaidProPartyRoleContext,
} from "./paidProSignerMetadataAuthority";
import { signaturePatchStartIndex } from "./guidedDealCompletion/signatureRegion";
import {
  applySignatureNoticeContactFieldsToCorpus,
  buildPartyNoticeDetailsBlock,
  corpusHasPartyNoticeDetails,
  stripExistingPartyNoticeDetails,
} from "./paidProPartyNoticeDetails";
import { stripPaidProSignerSummaryBlocksFromCorpus } from "./paidProSignerSigningCorpusHygiene";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { forbidPaidProExecutionBlockSynthesis } from "./paidProExecutionBlockAuthority";
import {
  isFusedOrConcatenatedPartyLegalName,
  QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE,
} from "./signerSetupPartyIdentity";

export { QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE };

export function resolveCanonicalPartyLegalNameForIndex(
  partyIndex: number,
  parties: readonly PaidProSignerMetadataParty[],
): string {
  const identities = authorityPartiesToCanonicalPartyIdentities(parties);
  return identities[partyIndex]?.partyDisplayName?.trim() ?? "";
}

export function corpusContainsFusedPartyLegalName(corpus: string): boolean {
  const text = corpus || "";
  if (text.includes(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE)) return true;
  const marker = signaturePatchStartIndex(text);
  const tail = marker >= 0 ? text.slice(marker) : text.slice(Math.floor(text.length * 0.65));
  return tail.split("\n").some((line) => isFusedOrConcatenatedPartyLegalName(line));
}

export function partyNoticeDetailsBlockMatchesAuthority(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
): boolean {
  if (!corpusHasPartyNoticeDetails(corpus)) return false;
  const start = corpus.search(/^\s*Party Notice Details:\s*$/im);
  if (start < 0) return false;
  const tail = corpus.slice(start);
  const relEnd = tail.search(/\n\n(?=\d+\.\s*\w|IN WITNESS WHEREOF)/im);
  const existing = (relEnd >= 0 ? tail.slice(0, relEnd) : tail).trim();
  return existing === buildPartyNoticeDetailsBlock(parties).trim();
}

function signatureRegionNeedsCanonicalRebuild(
  corpus: string,
  identities: readonly CanonicalPartyIdentity[],
): boolean {
  if (corpusContainsFusedPartyLegalName(corpus)) return true;
  const canonical = identities.map((id) => id.partyDisplayName.trim()).filter(Boolean);
  if (canonical.length < 2) return false;
  const marker = signaturePatchStartIndex(corpus);
  if (marker < 0) return true;
  const tail = corpus.slice(marker).toLowerCase();
  for (const name of canonical) {
    if (!tail.includes(name.toLowerCase())) return true;
  }
  return false;
}

/**
 * Rebuild signature blocks from authority — notice contact fields live in execution only.
 */
export function applyCanonicalPartyLegalNamesToSigningCorpus(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
  roleContext?: PaidProPartyRoleContext | null,
): { text: string; repaired: boolean } {
  const identities = authorityPartiesToCanonicalPartyIdentities(parties, roleContext);
  const signerCount = identities.filter((id) => id.partyDisplayName.trim().length >= 2).length;
  let text = (corpus || "").replace(/\r\n/g, "\n");
  let repaired = false;

  if (
    signerCount >= 2 &&
    signatureRegionNeedsCanonicalRebuild(text, identities) &&
    !forbidPaidProExecutionBlockSynthesis(text, signerCount)
  ) {
    const rebuilt = rebuildSignatureBlocksWithPartyIdentities(text, identities);
    if (rebuilt.count > 0) {
      text = rebuilt.text;
      repaired = true;
    }
  }

  if (corpusHasPartyNoticeDetails(text)) {
    text = stripExistingPartyNoticeDetails(text);
    repaired = true;
  }
  const summaryStrip = stripPaidProSignerSummaryBlocksFromCorpus(text);
  if (summaryStrip.removed > 0) {
    text = summaryStrip.text;
    repaired = true;
  }

  const signatureNoticeApply = applySignatureNoticeContactFieldsToCorpus(text, parties, roleContext);
  if (signatureNoticeApply.applied) {
    text = signatureNoticeApply.text;
    repaired = true;
  }

  for (const legal of identities.map((id) => id.partyDisplayName)) {
    if (!legal || !text.includes(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE)) continue;
    text = text.split(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE).join(legal);
    repaired = true;
  }

  return { text: text.trimEnd() + (text.endsWith("\n") ? "" : "\n"), repaired };
}

export function assertCorpusHasNoFusedPartyLegalNames(
  corpus: string,
  parties: readonly PaidProSignerMetadataParty[],
): void {
  if (corpusContainsFusedPartyLegalName(corpus)) {
    throw new Error("fused_party_legal_name_in_corpus");
  }
  const client = resolveCanonicalPartyLegalNameForIndex(0, parties);
  const provider = resolveCanonicalPartyLegalNameForIndex(1, parties);
  if (client && corpus.includes(client) && provider && corpus.includes(provider)) {
    const fused = `${client} ${provider}`;
    if (corpus.includes(fused)) {
      throw new Error("concatenated_party_legal_names_in_corpus");
    }
  }
  if (corpus.includes(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE)) {
    throw new Error("qa_fused_party_legal_name_in_corpus");
  }
}
