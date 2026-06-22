/**
 * Display-safe Paid Pro polish driven by frozen canonical manifest (post-SoT only).
 * Repairs recital/signature drift without mutating operative business terms outside party identity.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  buildPartyEntries,
  frozenManifestRecitalNeedsRewrite,
  normalizeOpeningRecital,
  normalizeSignatureBlockHeadings,
} from "./paidProAgreementPolish";
import { canonicalPartyRecordsFromSignerIdentities } from "./canonicalPartyIdentityResolver";
import {
  authorityPartiesToCanonicalPartyIdentities,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { ensurePaidProAcceptanceExecutionBlockInvariant } from "./paidProAcceptanceExecutionBlockInvariant";
import { repairMalformedPaidProAgreementRecital } from "./paidProAgreementRecitalRepair";
import { readFrozenCanonicalManifestPartyNames } from "./frozenCanonicalManifestAuthority";

export function repairMalformedSectionAnyReference(text: string): { text: string; repaired: boolean } {
  if (!/\bSection\s+Any\b/i.test(text)) return { text, repaired: false };
  return {
    text: text.replace(/\bSection\s+Any\b/gi, "this Agreement"),
    repaired: true,
  };
}

function partiesFromManifestNames(names: readonly string[]): PaidProSignerMetadataParty[] {
  return names.map((partyLegalName, partyIndex) => ({
    partyIndex,
    partyLegalName,
    signerEmail: "",
    signerName: "",
    signerTitle: "",
    partyAddress: "",
  }));
}

function corpusHasTwoPartyRoleSignatureTail(text: string): boolean {
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : text.slice(-2400);
  return /CLIENT\s*:/i.test(tail) && /SERVICE\s+PROVIDER\s*:/i.test(tail);
}

function witnessTailMissingManifestNames(text: string, names: readonly string[]): boolean {
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : "";
  return names.some((name) => !tail.includes(name));
}

/**
 * When canonical manifest has 3+ parties, align visible recital/signature with manifest names.
 */
export function applyFrozenManifestPaidProDisplayAuthority(
  text: string,
  _opts?: { intakeText?: string | null; draft?: ParsedDraftShape | null },
): { text: string; repairs: string[] } {
  const names = readFrozenCanonicalManifestPartyNames();
  if (names.length < 3) return { text, repairs: [] };

  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n");
  const parties = partiesFromManifestNames(names);
  const partyEntries = buildPartyEntries(names);

  const sectionAny = repairMalformedSectionAnyReference(out);
  if (sectionAny.repaired) {
    out = sectionAny.text;
    repairs.push("frozen_manifest:section_any_reference");
  }

  const malformedRecital = repairMalformedPaidProAgreementRecital(out, parties);
  if (malformedRecital.text !== out) {
    out = malformedRecital.text;
    repairs.push(...malformedRecital.repairs.map((tag) => `frozen_manifest:${tag}`));
  }

  const recital = normalizeOpeningRecital(out, partyEntries, "high", {
    forceRewrite: frozenManifestRecitalNeedsRewrite(out, names),
  });
  if (recital.log.applied) {
    out = recital.text;
    repairs.push("frozen_manifest:recital_polish");
  }

  const sig = normalizeSignatureBlockHeadings(out, partyEntries);
  if (sig.log.replacedCount > 0) {
    out = sig.text;
    repairs.push("frozen_manifest:signature_headings");
  }

  const needsExecutionRebuild =
    names.length >= 3 &&
    (corpusHasTwoPartyRoleSignatureTail(out) || witnessTailMissingManifestNames(out, names));
  if (needsExecutionRebuild) {
    const records = canonicalPartyRecordsFromSignerIdentities(
      authorityPartiesToCanonicalPartyIdentities(parties),
    );
    const exec = ensurePaidProAcceptanceExecutionBlockInvariant(out, records);
    if (exec.text !== out) {
      out = exec.text;
      repairs.push(...exec.repairs.map((tag) => `frozen_manifest:${tag}`));
    }
  }

  return { text: out, repairs: [...new Set(repairs)] };
}
