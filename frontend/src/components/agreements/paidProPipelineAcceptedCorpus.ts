/**
 * Records the corpus hash accepted by premiumCompletionPipeline so establishPaidProSourceOfTruth
 * can skip a redundant full safe-display pass when the incoming body is unchanged.
 * Also retains the accepted body text for concise Pro corpora (<15k) before React ref handoff.
 */

import { hashPaidProCorpus } from "./paidProSourceOfTruthState";

/** Matches guided final review minimum — inlined to avoid simpleProFinalReviewCorpus import cycle. */
const PIPELINE_ACCEPTED_CORPUS_BODY_MIN_LEN = 1500;

let pipelineAcceptedCorpusHash: string | null = null;
let pipelineAcceptedCorpusBody: string | null = null;

export function paidProPipelineAcceptedCorpusHash(text: string): string | null {
  const t = (text || "").trim();
  return t.length >= 80 ? hashPaidProCorpus(t) : t.length > 0 ? `len:${t.length}` : null;
}

export function markPaidProPipelineAcceptedCorpusHash(text: string): void {
  const t = (text || "").trim();
  pipelineAcceptedCorpusHash = paidProPipelineAcceptedCorpusHash(t);
  if (t.length >= PIPELINE_ACCEPTED_CORPUS_BODY_MIN_LEN) {
    const prev = pipelineAcceptedCorpusBody?.trim() ?? "";
    if (!prev || t.length >= prev.length) {
      pipelineAcceptedCorpusBody = t;
    }
  }
}

export function readPaidProPipelineAcceptedCorpusHash(): string | null {
  return pipelineAcceptedCorpusHash;
}

/** Session-scoped accepted pipeline body — survives until explicit clear or longer acceptance. */
export function readPaidProPipelineAcceptedCorpusBody(): string | null {
  return pipelineAcceptedCorpusBody;
}

export function clearPaidProPipelineAcceptedCorpusHash(): void {
  pipelineAcceptedCorpusHash = null;
  pipelineAcceptedCorpusBody = null;
}

export function clearPaidProPipelineAcceptedCorpusHashForTests(): void {
  clearPaidProPipelineAcceptedCorpusHash();
}
