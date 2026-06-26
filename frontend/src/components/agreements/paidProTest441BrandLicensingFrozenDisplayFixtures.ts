/**
 * TEST441 — frozen/display brand licensing corpus authority (live TEST440 rerun defects).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildDeterministicQuadPartyBrandLicensingProFallback } from "./deterministicQuadPartyProFallback";
import {
  buildTest440CorruptedNoticeTail,
  TEST440_ALL_PARTIES,
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
  TEST440_MIN_RECOVERY_LEN,
  TEST440_REALISTIC_PROSE_INTAKE,
  TEST440_TRANSACTION_TITLE,
  test440BrandLicensingDraft,
} from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";
import { TEST439_TARGET_DEGRADED_LEN } from "./paidProTest439BrandLicensingDegradedRecoveryFixtures";

export const TEST441_TRANSACTION_TITLE = TEST440_TRANSACTION_TITLE;
export const TEST441_MIN_FROZEN_LEN = TEST440_MIN_RECOVERY_LEN;
export const TEST441_ALL_PARTIES = TEST440_ALL_PARTIES;
export const TEST441_REALISTIC_PROSE_INTAKE = TEST440_REALISTIC_PROSE_INTAKE;

/** Draft with BrightPeak first — mirrors live extraction order defect. */
export function test441BrightPeakFirstDraft(): ParsedDraftShape {
  const base = test440BrandLicensingDraft();
  return {
    ...base,
    parties: [
      { name: TEST440_BRIGHT_PEAK, role: "Marketing & E-commerce Manager" } as never,
      { name: TEST440_EVERGREEN, role: "Brand Owner" } as never,
      { name: TEST440_ATLAS, role: "Manufacturer" } as never,
      { name: TEST440_HORIZON, role: "Master Distributor" } as never,
    ],
  };
}

/** Live-style frozen corpus: SERVICES title, Client/Service Provider recital, shifted body roles, notice bleed. */
export function buildTest441DefectiveFrozenDisplayCorpus(
  intake = TEST441_REALISTIC_PROSE_INTAKE,
  draft = test441BrightPeakFirstDraft(),
): string {
  const wrongOrder = [TEST440_BRIGHT_PEAK, TEST440_EVERGREEN, TEST440_ATLAS, TEST440_HORIZON];
  const shifted = buildDeterministicQuadPartyBrandLicensingProFallback({
    draft: {
      ...draft,
      parties: wrongOrder.map((name) => ({ name, role: "party" })) as never,
    },
    rawIntake: intake,
    partyNames: wrongOrder,
  });
  if (!shifted.ok) {
    throw new Error(`shifted_fallback_failed:${shifted.reasons.join(",")}`);
  }
  const sec1Idx = shifted.body.search(/\n\s*1\.\s+[A-Z]/);
  const operative = sec1Idx >= 0 ? shifted.body.slice(sec1Idx) : shifted.body;
  const defectiveHead = [
    "SERVICES AGREEMENT",
    "",
    `This Services Agreement (this "Agreement") is entered into as of the Effective Date by and among ${TEST440_BRIGHT_PEAK} ("Client"), ${TEST440_EVERGREEN} ("Service Provider"), ${TEST440_ATLAS} ("Service Provider"), and ${TEST440_HORIZON} ("Service Provider") (each a "Party" and collectively, the "Parties").`,
    "",
  ].join("\n");
  let body = `${defectiveHead}${operative}`;
  const noticeIdx = body.search(/\b11\.\s+NOTICES\b/i);
  if (noticeIdx >= 0) {
    body = `${body.slice(0, noticeIdx).trimEnd()}\n\n${buildTest440CorruptedNoticeTail()}`;
  }
  return body;
}

export function buildTest441DegradedJsonParseDocumentText(): string {
  let body = buildTest441DefectiveFrozenDisplayCorpus();
  let i = 20;
  while (body.length < TEST439_TARGET_DEGRADED_LEN) {
    body +=
      `\n\n${i}. Supplemental Commercial Provision ${i}. Each Party shall maintain royalty reporting tier ${i} under Oklahoma commercial standards.`;
    i += 1;
  }
  return body.slice(0, TEST439_TARGET_DEGRADED_LEN);
}

export function test441DefectiveCorpusMarkers(): {
  title: string;
  clientParty: string;
  serviceProviderParty: string;
} {
  return {
    title: "SERVICES AGREEMENT",
    clientParty: TEST440_BRIGHT_PEAK,
    serviceProviderParty: TEST440_EVERGREEN,
  };
}
