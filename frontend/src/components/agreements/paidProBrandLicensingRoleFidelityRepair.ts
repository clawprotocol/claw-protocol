/**
 * Repair substantive brand-licensing sections when role fidelity fails before freeze.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildDeterministicQuadPartyBrandLicensingProFallback } from "./deterministicQuadPartyProFallback";
import {
  assessBrandLicensingRoleFidelity,
  brandLicensingIntakeHasExplicitRoleLabels,
} from "./paidProBrandLicensingRoleMap";
import { intakeDescribesBrandLicensingDistributionManufacturingStack } from "./paidProAgreementTitleScope";

export function repairBrandLicensingRoleFidelityInCorpus(
  text: string,
  intakeText: string,
  draft?: ParsedDraftShape | null,
): { text: string; repairs: string[] } {
  const intake = String(intakeText || "").trim();
  const body = (text || "").replace(/\r\n/g, "\n").trim();
  if (!body || !intake || !intakeDescribesBrandLicensingDistributionManufacturingStack(intake)) {
    return { text: body, repairs: [] };
  }
  if (!brandLicensingIntakeHasExplicitRoleLabels(intake, draft ?? null)) {
    return { text: body, repairs: [] };
  }
  if (assessBrandLicensingRoleFidelity(body, intake, draft ?? null).ok) {
    return { text: body, repairs: [] };
  }

  const fallback = buildDeterministicQuadPartyBrandLicensingProFallback({
    draft: draft ?? ({} as ParsedDraftShape),
    rawIntake: intake,
  });
  if (!fallback.ok) return { text: body, repairs: [] };

  const fbSec1 = fallback.body.search(/(?:^|\n)\s*1\.\s+[A-Z]/im);
  const fbNotices = fallback.body.search(/(?:^|\n)\s*11\.\s+NOTICES\b/im);
  if (fbSec1 < 0 || fbNotices < 0 || fbNotices <= fbSec1) {
    return { text: body, repairs: [] };
  }
  const replacement = fallback.body.slice(fbSec1, fbNotices).trim();

  const sec1Idx = body.search(/(?:^|\n)\s*1\.\s+[A-Z]/im);
  const noticeIdx = body.search(/(?:^|\n)\s*11\.\s+NOTICES\b/im);
  if (sec1Idx < 0 || noticeIdx < 0 || noticeIdx <= sec1Idx) {
    return { text: fallback.body, repairs: ["brand_licensing:replace_operative_from_role_fallback"] };
  }

  const head = body.slice(0, sec1Idx).trimEnd();
  const tail = body.slice(noticeIdx);
  const repaired = `${head}\n\n${replacement}\n\n${tail}`.trim();
  if (!assessBrandLicensingRoleFidelity(repaired, intake, draft ?? null).ok) {
    return { text: body, repairs: [] };
  }
  return { text: repaired, repairs: ["brand_licensing:repair_substantive_role_sections"] };
}
