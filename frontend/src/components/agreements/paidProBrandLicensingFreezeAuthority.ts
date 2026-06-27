/**
 * Brand licensing / manufacturing / distribution stack — frozen SoT and display corpus authority.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  intakeDescribesBrandLicensingDistributionManufacturingStack,
  resolveAgreementTitleFromIntakeScope,
} from "./paidProAgreementTitleScope";
import {
  applyPaidProExecutiveDraftPolish,
  hasBrandLicensingNoticeOrGoverningLawCorruption,
  rebuildBrandLicensingNoticesAndGoverningLawSection,
} from "./paidProExecutiveDraftPolish";
import {
  rebuildBrandLicensingDocumentOpeningAuthority,
  resolveBrandLicensingPartyOrderFromProseIntake,
  resolveBrandLicensingRoleFromProseIntake,
  resolveDeterministicQuadPartyNames,
} from "./deterministicQuadPartyProFallback";
import {
  assertBrandLicensingRoleFidelityForFreeze,
  resolveBrandLicensingAuthoritativeRoleMap,
  resolveBrandLicensingPartyOrderFromIntake,
} from "./paidProBrandLicensingRoleMap";
import { assertNoRepeatedSupplementalProvisionsForFreeze } from "./paidProSupplementalProvisionsFillerGate";
import { repairBrandLicensingRoleFidelityInCorpus } from "./paidProBrandLicensingRoleFidelityRepair";
import { applySectionStructureIntegrity } from "./sectionStructureAuthority";
import { parseLabeledPartyBlocks } from "./labeledPartyBlockParse";
import type { CanonicalPartyIdentityRecord } from "./canonicalPartyIdentityResolver";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import {
  detectOpeningRecitalCrossMappedLegalNameAliases,
  detectOpeningRecitalRoleLabelInversion,
} from "./paidProOpeningRoleLabelConsistency";

export function brandLicensingFrozenCorpusHasProfessionalDefects(text: string): boolean {
  const trimmed = (text || "").trim();
  if (!trimmed) return true;
  const head = trimmed.slice(0, Math.min(trimmed.length, 4_000));
  const titleLine = trimmed.split("\n").find((line) => line.trim().length >= 8)?.trim() ?? "";
  if (/^SERVICES AGREEMENT$/i.test(titleLine)) return true;
  if (!/MANUFACTURING,\s+DISTRIBUTION,\s+LICENSING/i.test(trimmed.slice(0, 600))) return true;
  if (/\(\s*["']Client["']\s*\)/i.test(head)) return true;
  if (/\(\s*["']Service Provider["']\s*\)/i.test(head)) return true;
  if (/\bService Provider\s*\(\s*["']/i.test(head)) return true;
  if (/\bClient\s*\(\s*["']/i.test(head)) return true;
  if (/the\s+the\s*["']Parties["']\)\.\s*GOVERNING LAW/i.test(trimmed)) return true;
  if (/Address:[^\n]*\bGOVERNING LAW\b/i.test(trimmed)) return true;
  if (hasBrandLicensingNoticeOrGoverningLawCorruption(trimmed)) return true;
  if (/\b11\.\s+NOTICES\b/i.test(trimmed) && !/12\.\s+GOVERNING LAW/i.test(trimmed)) return true;
  return false;
}

/** Opening recital maps a party legal name into another party's quoted alias (live TEST442 defect). */
export function brandLicensingOpeningRecitalNeedsAuthorityRepair(
  text: string,
  intakeText: string | null | undefined,
  draft?: ParsedDraftShape | null,
): boolean {
  const intake = String(intakeText || "").trim();
  if (!intake || !intakeDescribesBrandLicensingDistributionManufacturingStack(intake)) {
    return false;
  }
  const records = manifestRecordsFromBrandLicensingProseIntake(intake, draft ?? null);
  if (records.length < 4) return false;
  const partyNames = records.map((r) => r.fullLegalName);
  if (detectOpeningRecitalCrossMappedLegalNameAliases(text, partyNames)) return true;
  if (detectOpeningRecitalRoleLabelInversion(text, records)) return true;
  if (/\bService Provider\s*\(\s*["']Master Distributor["']\s*\)/i.test(text)) return true;
  if (/\bClient\s*\(\s*["']Marketing/i.test(text)) return true;
  return false;
}

export function manifestRecordsFromBrandLicensingProseIntake(
  intakeText: string,
  draft?: ParsedDraftShape | null,
): CanonicalPartyIdentityRecord[] {
  const intake = String(intakeText || "").trim();
  if (!intake) return [];
  const labeled = parseLabeledPartyBlocks(intake);
  const proseOrder = resolveBrandLicensingPartyOrderFromIntake(intake);
  const fallbackProse = resolveBrandLicensingPartyOrderFromProseIntake(intake);
  const parties =
    proseOrder.length >= 4
      ? proseOrder.slice(0, 4)
      : fallbackProse.length >= 4
        ? fallbackProse.slice(0, 4)
        : resolveDeterministicQuadPartyNames(intake, draft).slice(0, 4);
  if (parties.length < 4) return [];

  const roleMap = resolveBrandLicensingAuthoritativeRoleMap(intake, draft);

  return parties.map((fullLegalName, index) => {
    const fromMap = roleMap.find((e) => partyLegalNamesMatch(e.fullLegalName, fullLegalName));
    const fromProse = resolveBrandLicensingRoleFromProseIntake(intake, fullLegalName);
    const fromDraft = (draft?.parties ?? []).find((p) =>
      partyLegalNamesMatch(String(p?.name ?? "").trim(), fullLegalName),
    );
    const draftRole = String(fromDraft?.role ?? "").trim();
    const block = labeled.find((b) => partyLegalNamesMatch(b.legalEntity, fullLegalName)) ?? labeled[index];
    const roleLabel =
      fromMap?.roleLabel ||
      (fromProse && fromProse.length >= 2 ? fromProse : null) ||
      (draftRole.length >= 2 && !/^(?:party|client|service provider)$/i.test(draftRole) ? draftRole : null) ||
      (block?.roleLabel?.trim().length >= 2 ? block.roleLabel.trim() : null) ||
      `Party ${index + 1}`;
    return {
      fullLegalName,
      roleLabel,
      displayAlias: fullLegalName.split(/\s+/).slice(0, 2).join(" "),
      signerName: block?.signerName?.trim() || null,
      signerTitle: block?.signerTitle?.trim() || null,
      partyAddress: block?.address?.trim() || null,
    };
  });
}

export function applyBrandLicensingFrozenCorpusAuthority(
  text: string,
  draft: ParsedDraftShape | null | undefined,
  intakeText: string | null | undefined,
): { text: string; repairs: string[] } {
  const intake = String(intakeText || "").trim();
  if (!intake || !intakeDescribesBrandLicensingDistributionManufacturingStack(intake)) {
    return { text: (text || "").trim(), repairs: [] };
  }

  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n").trim();

  const executive = applyPaidProExecutiveDraftPolish(out, intake, draft ?? null);
  out = executive.text;
  repairs.push(...executive.repairs);

  const proseRecords = manifestRecordsFromBrandLicensingProseIntake(intake, draft ?? null);
  const proseParties =
    proseRecords.length >= 4
      ? proseRecords.map((r) => r.fullLegalName).filter(isAuthoritativeLegalEntityName)
      : [];
  const parties = resolveDeterministicQuadPartyNames(intake, draft).filter(isAuthoritativeLegalEntityName);
  const openingPartyOrder =
    proseParties.length >= 4 ? proseParties : resolveBrandLicensingPartyOrderFromIntake(intake).slice(0, 4);
  const needsOpeningAuthority =
    openingPartyOrder.length >= 4 &&
    (brandLicensingFrozenCorpusHasProfessionalDefects(out) ||
      brandLicensingOpeningRecitalNeedsAuthorityRepair(out, intake, draft ?? null));
  if (needsOpeningAuthority) {
    const opening = rebuildBrandLicensingDocumentOpeningAuthority(
      out,
      intake,
      draft ?? null,
      openingPartyOrder,
    );
    if (opening.text !== out) {
      out = opening.text;
      repairs.push(...opening.repairs);
    }
    const titleScope = resolveAgreementTitleFromIntakeScope(intake);
    if (!out.startsWith(titleScope.titleUpper)) {
      const lines = out.split("\n");
      if (lines.length > 0 && lines[0].trim().length >= 4) {
        lines[0] = titleScope.titleUpper;
        out = lines.join("\n");
        repairs.push("brand_licensing:reconcile_title_line");
      }
    }
    const executiveAfterOpening = applyPaidProExecutiveDraftPolish(out, intake, draft ?? null);
    out = executiveAfterOpening.text;
    repairs.push(...executiveAfterOpening.repairs);
  }

  if (
    parties.length >= 4 &&
    (hasBrandLicensingNoticeOrGoverningLawCorruption(out) ||
      (/\b11\.\s+NOTICES\b/i.test(out) && !/12\.\s+GOVERNING LAW/i.test(out)))
  ) {
    const notices = rebuildBrandLicensingNoticesAndGoverningLawSection(out, parties, intake, draft ?? null);
    if (notices.text !== out) {
      out = notices.text;
      repairs.push(...notices.repairs);
    }
  }

  const structure = applySectionStructureIntegrity(out, {
    source: "brand_licensing_frozen_corpus_authority",
    repair: true,
  });
  if (structure.text !== out) {
    out = structure.text;
    repairs.push(...structure.repairs.map((r) => `section_structure:${r}`));
  }

  return { text: out.trimEnd(), repairs: [...new Set(repairs)] };
}

export function assertBrandLicensingFrozenCorpusAuthorityForFreeze(
  text: string,
  intakeText: string | null | undefined,
  draft?: ParsedDraftShape | null,
): void {
  const intake = String(intakeText || "").trim();
  if (!intake || !intakeDescribesBrandLicensingDistributionManufacturingStack(intake)) return;
  let corpus = (text || "").trim();
  if (
    brandLicensingFrozenCorpusHasProfessionalDefects(corpus) ||
    brandLicensingOpeningRecitalNeedsAuthorityRepair(corpus, intake, draft ?? null)
  ) {
    const repaired = applyBrandLicensingFrozenCorpusAuthority(corpus, draft ?? null, intake);
    corpus = repaired.text;
  }
  if (
    brandLicensingFrozenCorpusHasProfessionalDefects(corpus) ||
    brandLicensingOpeningRecitalNeedsAuthorityRepair(corpus, intake, draft ?? null)
  ) {
    throw new Error("[paid-pro-sot-freeze-blocked] brand_licensing_professional_corpus_defect");
  }
  const roleRepair = repairBrandLicensingRoleFidelityInCorpus(corpus, intake, draft ?? null);
  if (roleRepair.text !== corpus) {
    corpus = roleRepair.text.trimEnd();
  }
  assertBrandLicensingRoleFidelityForFreeze(corpus, intake, draft ?? null);
  assertNoRepeatedSupplementalProvisionsForFreeze(corpus);
  const structureRepaired = applySectionStructureIntegrity(corpus, {
    source: "brand_licensing_freeze_final",
    repair: true,
  });
  corpus = structureRepaired.text.trimEnd();
  const structure = applySectionStructureIntegrity(corpus, {
    source: "brand_licensing_freeze_final",
    repair: false,
  });
  if (structure.anomalyCount > 0) {
    const authorityRepair = applyBrandLicensingFrozenCorpusAuthority(corpus, draft ?? null, intake);
    corpus = authorityRepair.text.trimEnd();
    const structureRepairedAgain = applySectionStructureIntegrity(corpus, {
      source: "brand_licensing_freeze_final_retry",
      repair: true,
    });
    corpus = structureRepairedAgain.text.trimEnd();
    const verify = applySectionStructureIntegrity(corpus, {
      source: "brand_licensing_freeze_final_verify",
      repair: false,
    });
    if (verify.anomalyCount > 0) {
      throw new Error(
        `[paid-pro-sot-freeze-blocked] brand_licensing_section_structure_anomaly:${verify.anomalyCount}`,
      );
    }
  }
}

/** Non-throwing freeze gate preview for pipeline preserve/recovery decisions. */
export function brandLicensingFreezeAuthorityPasses(
  text: string,
  intakeText: string | null | undefined,
  draft?: ParsedDraftShape | null,
): boolean {
  try {
    assertBrandLicensingFrozenCorpusAuthorityForFreeze(text, intakeText, draft ?? null);
    return true;
  } catch {
    return false;
  }
}
