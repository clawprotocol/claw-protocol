/**
 * TEST442 — brand licensing opening recital cross-mapped alias corruption (live TEST441 follow-up).
 */

import {
  applyBrandLicensingFrozenCorpusAuthority,
} from "./paidProBrandLicensingFreezeAuthority";
import {
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
  TEST440_REALISTIC_PROSE_INTAKE,
  TEST440_TRANSACTION_TITLE,
} from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";
import {
  buildTest441DefectiveFrozenDisplayCorpus,
  TEST441_REALISTIC_PROSE_INTAKE,
  test441BrightPeakFirstDraft,
} from "./paidProTest441BrandLicensingFrozenDisplayFixtures";

export const TEST442_TRANSACTION_TITLE = TEST440_TRANSACTION_TITLE;
export const TEST442_REALISTIC_PROSE_INTAKE = TEST441_REALISTIC_PROSE_INTAKE;
export const TEST442_ALL_PARTIES = [TEST440_EVERGREEN, TEST440_ATLAS, TEST440_HORIZON, TEST440_BRIGHT_PEAK];

/** Live-style cross-mapped opening aliases with otherwise professional brand-licensing body. */
export function buildTest442CrossMappedOpeningCorpus(
  intake = TEST442_REALISTIC_PROSE_INTAKE,
  draft = test441BrightPeakFirstDraft(),
): string {
  const professionalBase = applyBrandLicensingFrozenCorpusAuthority(
    buildTest441DefectiveFrozenDisplayCorpus(intake, draft),
    draft,
    intake,
  ).text;
  const sec1Idx = professionalBase.search(/\n\s*1\.\s+/);
  const operative = sec1Idx >= 0 ? professionalBase.slice(sec1Idx) : professionalBase;
  const corruptedOpening = [
    TEST442_TRANSACTION_TITLE,
    "",
    `This Manufacturing, Distribution, Licensing and Marketing Services Agreement (this "Agreement") is entered into by and among ${TEST440_BRIGHT_PEAK} ("Evergreen Outdoor Brands LLC"), ${TEST440_EVERGREEN} ("Atlas Consumer Products Inc"), ${TEST440_ATLAS} ("Horizon Wholesale Group LLC"), and ${TEST440_HORIZON} ("BrightPeak Retail Solutions LLC") (each a "Party" and collectively the "Parties").`,
    "",
  ].join("\n");
  return `${corruptedOpening}${operative}`;
}

export function test442CrossMappedOpeningMarkers(): {
  brightPeakAlias: string;
  evergreenAlias: string;
} {
  return {
    brightPeakAlias: `${TEST440_BRIGHT_PEAK} ("Evergreen Outdoor Brands LLC")`,
    evergreenAlias: `${TEST440_EVERGREEN} ("Atlas Consumer Products Inc")`,
  };
}

/** Server-success style long body with cross-mapped opening only (mirrors live TEST441). */
export function buildTest442ServerSuccessCrossMappedOpeningCorpus(
  intake = TEST440_REALISTIC_PROSE_INTAKE,
  draft = test441BrightPeakFirstDraft(),
): string {
  return buildTest442CrossMappedOpeningCorpus(intake, draft);
}
