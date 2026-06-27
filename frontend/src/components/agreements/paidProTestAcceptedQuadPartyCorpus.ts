/**
 * Shared quad-party accepted server corpus for lifecycle/freeze tests.
 * Uses deterministic fallback — corrupted malformed server drafts must not freeze.
 */

import { buildDeterministicQuadPartyMutualServicesProFallback } from "./deterministicQuadPartyProFallback";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { expandOperativeCorpusWithUniqueSupplements } from "./paidProSupplementalProvisionsFillerGate";

export function padOperativeCorpusBeforeWitness(base: string, minLen = 2000): string {
  return expandOperativeCorpusWithUniqueSupplements(base, minLen);
}

export function buildAcceptedQuadPartyServerCorpus(
  intake: string,
  draft: ParsedDraftShape,
  minLen = 2000,
): string {
  const fallback = buildDeterministicQuadPartyMutualServicesProFallback({
    rawIntake: intake,
    draft,
  });
  if (!fallback.ok) return "";
  return padOperativeCorpusBeforeWitness(fallback.body, minLen);
}
