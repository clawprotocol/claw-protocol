/**
 * Normalize malformed paid Pro agreement recitals after generation (duplicate opener, fused execution).
 */

import {
  canonicalPartyRecordsFromSignerIdentities,
  repairDuplicateAgreementOpening,
  repairFusedExecutionRecitalClause,
  repairMalformedAgreementOpeningPhrases,
} from "./canonicalPartyIdentityResolver";
import { stripPremiumIntelligenceCalloutsFromCorpus } from "./premiumDocumentIntelligenceStrip";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { authorityPartiesToCanonicalPartyIdentities } from "./paidProSignerMetadataAuthority";

export function repairMalformedPaidProAgreementRecital(
  text: string,
  parties?: readonly PaidProSignerMetadataParty[],
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n");

  const fused = repairFusedExecutionRecitalClause(out);
  out = fused.text;
  repairs.push(...fused.repairs);

  const records = parties?.length
    ? canonicalPartyRecordsFromSignerIdentities(authorityPartiesToCanonicalPartyIdentities(parties))
    : undefined;
  const dup = repairDuplicateAgreementOpening(out, records);
  out = dup.text;
  repairs.push(...dup.repairs);

  const phrases = repairMalformedAgreementOpeningPhrases(out);
  out = phrases.text;
  repairs.push(...phrases.repairs);

  out = stripPremiumIntelligenceCalloutsFromCorpus(out);

  return { text: out, repairs };
}
