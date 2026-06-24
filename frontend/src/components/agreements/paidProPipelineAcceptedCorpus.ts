/**
 * Records the corpus hash accepted by premiumCompletionPipeline so establishPaidProSourceOfTruth
 * can skip a redundant full safe-display pass when the incoming body is unchanged.
 */

import { hashPaidProCorpus } from "./paidProSourceOfTruth";

let pipelineAcceptedCorpusHash: string | null = null;

export function paidProPipelineAcceptedCorpusHash(text: string): string | null {
  const t = (text || "").trim();
  return t.length >= 80 ? hashPaidProCorpus(t) : t.length > 0 ? `len:${t.length}` : null;
}

export function markPaidProPipelineAcceptedCorpusHash(text: string): void {
  pipelineAcceptedCorpusHash = paidProPipelineAcceptedCorpusHash(text);
}

export function readPaidProPipelineAcceptedCorpusHash(): string | null {
  return pipelineAcceptedCorpusHash;
}

export function clearPaidProPipelineAcceptedCorpusHash(): void {
  pipelineAcceptedCorpusHash = null;
}

export function clearPaidProPipelineAcceptedCorpusHashForTests(): void {
  clearPaidProPipelineAcceptedCorpusHash();
}
