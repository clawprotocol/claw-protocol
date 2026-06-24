/**
 * Shared quad-party accepted server corpus for lifecycle/freeze tests.
 * Uses deterministic fallback — corrupted malformed server drafts must not freeze.
 */

import { buildDeterministicQuadPartyMutualServicesProFallback } from "./deterministicQuadPartyProFallback";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

export function padOperativeCorpusBeforeWitness(base: string, minLen = 2000): string {
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
