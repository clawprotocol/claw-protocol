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
import { overlayCorpusDeclaredRoleLabels } from "./paidProAcceptedCorpusPartyRoles";
import { ensurePaidProMultiPartyAgreementOpening, ensurePaidProServicesAgreementOpening } from "./paidProOpeningRecitalGuard";
import {
  overlayDeclaredOpeningRoleParentheticals,
  repairOpeningRecitalRoleLabelsFromManifest,
} from "./paidProOpeningRoleLabelConsistency";
import {
  corpusDeclaresConsultantClientOpening,
  restoreDeclaredConsultantClientPaper,
} from "./paidProDeclaredConsultantClientPaper";

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
    ? overlayDeclaredOpeningRoleParentheticals(
        overlayCorpusDeclaredRoleLabels(
          canonicalPartyRecordsFromSignerIdentities(authorityPartiesToCanonicalPartyIdentities(parties)),
          out,
        ),
        out,
      )
    : undefined;
  const acceptedBeforeRoleRepair = out;
  if (records && records.length >= 2 && !corpusDeclaresConsultantClientOpening(out)) {
    const roleLabels = repairOpeningRecitalRoleLabelsFromManifest(out, records);
    out = roleLabels.text;
    repairs.push(...roleLabels.repairs);
    if (records.length < 3) {
      const opening = ensurePaidProServicesAgreementOpening(out, records);
      out = opening.text;
      repairs.push(...opening.repairs);
    } else {
      const multiOpening = ensurePaidProMultiPartyAgreementOpening(out, records);
      out = multiOpening.text;
      repairs.push(...multiOpening.repairs);
    }
  }
  const dup = repairDuplicateAgreementOpening(out, records);
  out = dup.text;
  repairs.push(...dup.repairs);

  const servicePartyLabels = stripServiceScopePartyPlaceholderLabels(out);
  out = servicePartyLabels.text;
  repairs.push(...servicePartyLabels.repairs);

  out = stripPremiumIntelligenceCalloutsFromCorpus(out);
  const restored = restoreDeclaredConsultantClientPaper(out, acceptedBeforeRoleRepair || text);
  if (restored !== out) {
    out = restored;
    repairs.push("recital:restore_declared_consultant_client");
  }

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
