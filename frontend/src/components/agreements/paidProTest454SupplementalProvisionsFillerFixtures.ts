/**
 * TEST454 — Supplemental Provisions filler gate + role-faithful structural recovery.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  TEST448_ALL_PARTIES,
  TEST448_LIVE_INTAKE,
  TEST448_TRANSACTION_TITLE,
  test448BrightPeakFirstDraft,
} from "./paidProTest448BrandLicensingOrchestrationFixtures";
import {
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
} from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";

export const TEST454_TRANSACTION_TITLE = TEST448_TRANSACTION_TITLE;
export const TEST454_LIVE_INTAKE = TEST448_LIVE_INTAKE;
export const TEST454_ALL_PARTIES = TEST448_ALL_PARTIES;

export function test454BrightPeakFirstDraft(): ParsedDraftShape {
  return test448BrightPeakFirstDraft();
}

/** Live extraction order with generic roles — mirrors degraded recovery defect. */
export function test454GenericPartyRolesDraft(): ParsedDraftShape {
  const base = test454BrightPeakFirstDraft();
  return {
    ...base,
    duration: "As stated in the agreement.",
    parties: [
      { name: TEST440_BRIGHT_PEAK, role: "party" } as never,
      { name: TEST440_EVERGREEN, role: "party" } as never,
      { name: TEST440_ATLAS, role: "party" } as never,
      { name: TEST440_HORIZON, role: "party" } as never,
    ],
  };
}

/** Legacy padded corpus with repeated Supplemental Provisions filler (pre-TEST454 defect). */
export function buildTest454LegacyRepeatedFillerCorpus(base: string, minLen = 15_000): string {
  if (base.length >= minLen) return base;
  const witnessIdx = base.search(/\bIN WITNESS WHEREOF\b/i);
  const insertAt = witnessIdx >= 0 ? witnessIdx : base.length;
  let pad = "\n\nSupplemental Provisions\n\n";
  while (base.length + pad.length < minLen) {
    pad +=
      "Each Party agrees to cooperate in good faith on milestones, deliverables, reporting, and change orders under this Agreement.\n\n";
  }
  return `${base.slice(0, insertAt)}${pad}${base.slice(insertAt)}`;
}

export function buildTest454PaddedUniqueCorpus(base: string, minLen = 15_000): string {
  return padOperativeCorpusBeforeWitness(base, minLen);
}
