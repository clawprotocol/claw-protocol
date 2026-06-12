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
import { ensurePaidProServicesAgreementOpening } from "./paidProOpeningRecitalGuard";
import { repairOpeningRecitalRoleLabelsFromManifest } from "./paidProOpeningRoleLabelConsistency";

export function repairMalformedPaidProAgreementRecital(
  text: string,
  parties?: readonly PaidProSignerMetadataParty[],
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n");

  const fused = repairFusedExecutionRecitalClause(out);
  out = fused.text;
  repairs.push(...fused.repairs);

  const phrases = repairMalformedAgreementOpeningPhrases(out);
  out = phrases.text;
  repairs.push(...phrases.repairs);

  const records = parties?.length
    ? canonicalPartyRecordsFromSignerIdentities(authorityPartiesToCanonicalPartyIdentities(parties))
    : undefined;
  if (records && records.length >= 2) {
    const roleLabels = repairOpeningRecitalRoleLabelsFromManifest(out, records);
    out = roleLabels.text;
    repairs.push(...roleLabels.repairs);
    const opening = ensurePaidProServicesAgreementOpening(out, records);
    out = opening.text;
    repairs.push(...opening.repairs);
  }
  const dup = repairDuplicateAgreementOpening(out, records);
  out = dup.text;
  repairs.push(...dup.repairs);

  const servicePartyLabels = stripServiceScopePartyPlaceholderLabels(out);
  out = servicePartyLabels.text;
  repairs.push(...servicePartyLabels.repairs);

  out = stripPremiumIntelligenceCalloutsFromCorpus(out);

  return { text: out, repairs };
}

/** Remove ("party") labels the model attached to service deliverables in malformed Pro recitals. */
export function stripServiceScopePartyPlaceholderLabels(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = text;
  const before = out;
  out = out.replace(
    /(\b(?:AI\s+workflow\s+consulting|implementation\s+support|process\s+documentation|configuration\s+assistance|training\s+services)\b)\s*\(\s*["']party["']\s*\)/gi,
    "$1",
  );
  if (out !== before) repairs.push("recital:strip_service_scope_party_placeholder");
  return { text: out, repairs };
}
