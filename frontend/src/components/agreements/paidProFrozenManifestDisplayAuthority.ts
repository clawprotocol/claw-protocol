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
import {
  analyzeMultiPartyExecutionBlockShape,
  ensurePaidProAcceptanceExecutionBlockInvariant,
  resolveAcceptanceManifestRecordsForExecution,
} from "./paidProAcceptanceExecutionBlockInvariant";
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
  if (!tail) return true;
  const records = names.map((fullLegalName) => ({
    fullLegalName,
    roleLabel: fullLegalName,
    displayAlias: fullLegalName,
    signerName: null,
    signerTitle: null,
    partyAddress: null,
  }));
  const shape = analyzeMultiPartyExecutionBlockShape(text, records);
  if (!shape.malformed) return false;
  return names.some((name) => !tail.includes(name));
}

function resolveFrozenManifestDisplayPartyNames(
  opts?: { intakeText?: string | null; draft?: ParsedDraftShape | null },
): string[] {
  const intakeRecords = resolveAcceptanceManifestRecordsForExecution({
    draft: opts?.draft ?? null,
    intakeText: opts?.intakeText ?? null,
  });
  const intakeNames = intakeRecords.map((r) => r.fullLegalName);
  const frozenNames = readFrozenCanonicalManifestPartyNames();
  if (intakeNames.length >= 3 && frozenNames.length < intakeNames.length) {
    return intakeNames;
  }
  if (frozenNames.length >= 3) return frozenNames;
  if (intakeNames.length >= 3) return intakeNames;
  return frozenNames;
}

/**
 * When canonical manifest has 3+ parties, align visible recital/signature with manifest names.
 */
export function applyFrozenManifestPaidProDisplayAuthority(
  text: string,
  opts?: { intakeText?: string | null; draft?: ParsedDraftShape | null },
): { text: string; repairs: string[] } {
  const names = resolveFrozenManifestDisplayPartyNames(opts);
  if (names.length < 3) return { text, repairs: [] };

  const intakeRecords = resolveAcceptanceManifestRecordsForExecution({
    draft: opts?.draft ?? null,
    intakeText: opts?.intakeText ?? null,
  });

  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n");
  const parties = partiesFromManifestNames(names);
  const partyEntries = buildPartyEntries(names);

  const sectionAny = repairMalformedSectionAnyReference(out);
  if (sectionAny.repaired) {
    out = sectionAny.text;
    repairs.push("frozen_manifest:section_any_reference");
  }

  const executionCanonical =
    intakeRecords.length >= 3 &&
    !analyzeMultiPartyExecutionBlockShape(out, intakeRecords).malformed &&
    !corpusHasTwoPartyRoleSignatureTail(out);
  if (
    executionCanonical &&
    !sectionAny.repaired &&
    !frozenManifestRecitalNeedsRewrite(out, names) &&
    repairMalformedPaidProAgreementRecital(out, parties).text === out
  ) {
    return { text: out, repairs: [] };
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
    (corpusHasTwoPartyRoleSignatureTail(out) ||
      witnessTailMissingManifestNames(out, names) ||
      (intakeRecords.length >= 3 && analyzeMultiPartyExecutionBlockShape(out, intakeRecords).malformed));
  if (needsExecutionRebuild) {
    const records =
      intakeRecords.length >= 3
        ? intakeRecords
        : canonicalPartyRecordsFromSignerIdentities(
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
