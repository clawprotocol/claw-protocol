/**
 * Paid Pro execution-block placement and post-freeze corpus drift instrumentation.
 */

import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countWitnessExecutionSections } from "./paidProSignerSigningCorpusHygiene";
import { findSignatureRegionStart } from "./guidedDealCompletion/signatureRegion";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import {
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { shouldLogPaidProAuthoritySurfaceEvent } from "./paidProAuthoritySurfaceLog";
import {
  assertPostFreezeRenderedCorpusMatchesFrozen,
  classifyPostFreezeCorpusMutation,
  computeByteLevelCorpusDiff,
  formatByteLevelCorpusDiffReport,
  recordPostFreezeCorpusBoundary,
  resolvePaidProFrozenAuthoritativePlain,
  shouldSkipPostFreezeDriftForReadonlyHtmlStrip,
  type PaidProPostFreezeMutationSource,
} from "./paidProPostFreezeCorpusInvariant";

function normalizeNewlines(text: string): string {
  return (text || "").replace(/\r\n/g, "\n");
}

function firstExecutionOffsetInCorpus(text: string): number {
  const body = normalizeNewlines(text);
  if (!body) return -1;
  const candidates: number[] = [];
  const witness = body.search(/\bIN WITNESS WHEREOF\b/i);
  if (witness >= 0) candidates.push(witness);
  const sigRegion = findSignatureRegionStart(body);
  if (sigRegion >= 0) candidates.push(sigRegion);
  const roleMatch = body.match(
    /(?:^|\n)\s*(?:CLIENT|SERVICE\s+PROVIDER|CONSULTANT|PROVIDER)\s*:\s*(?:\n|$)/im,
  );
  if (roleMatch?.index != null) {
    candidates.push(roleMatch.index + (roleMatch[0].startsWith("\n") ? 1 : 0));
  }
  const signatures = body.search(/(?:^|\n)\s*(?:\d+\.\s+)?SIGNATURES\s*\.?\s*(?:\n|$)/im);
  if (signatures >= 0) candidates.push(signatures);
  const filtered = candidates.filter((n) => n >= 0);
  return filtered.length ? Math.min(...filtered) : -1;
}

/** Index of the last numbered substantive section heading before the execution region. */
export function lastSubstantiveSectionOffset(text: string): number {
  const body = normalizeNewlines(text);
  const execStart = firstExecutionOffsetInCorpus(body);
  const head = execStart >= 0 ? body.slice(0, execStart) : body;
  let last = -1;
  for (const m of head.matchAll(/^\s*(\d+(?:\.\d+)*)\.\s+\S+/gm)) {
    if (m.index != null) last = m.index;
  }
  return last;
}

export type ExecutionBlockLocationPayload = {
  surface: string;
  firstExecutionOffset: number;
  lastSubstantiveSectionOffset: number;
  executionAfterFinalSection: boolean;
  len: number;
  hash?: string;
};

export function analyzeExecutionBlockLocation(
  text: string,
  surface: string,
): ExecutionBlockLocationPayload {
  const body = normalizeNewlines(text).trim();
  const firstExecutionOffset = firstExecutionOffsetInCorpus(body);
  const lastSection = lastSubstantiveSectionOffset(body);
  const executionAfterFinalSection =
    firstExecutionOffset < 0 ||
    lastSection < 0 ||
    firstExecutionOffset > lastSection;
  return {
    surface,
    firstExecutionOffset,
    lastSubstantiveSectionOffset: lastSection,
    executionAfterFinalSection,
    len: body.length,
    hash: body.length >= 200 ? hashPaidProCorpus(body) : undefined,
  };
}

export function logExecutionBlockLocation(text: string, surface: string): void {
  const payload = analyzeExecutionBlockLocation(text, surface);
  const corpusHash = payload.hash ?? "";
  if (!corpusHash) return;
  if (
    !shouldLogPaidProAuthoritySurfaceEvent({
      event: "execution-block-location",
      surface: payload.surface,
      hash: corpusHash,
      source: "execution_placement",
      payloadSignature: JSON.stringify({
        firstExecutionOffset: payload.firstExecutionOffset,
        lastSubstantiveSectionOffset: payload.lastSubstantiveSectionOffset,
        executionAfterFinalSection: payload.executionAfterFinalSection,
      }),
    })
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[execution-block-location]", payload);
}

export function logExecutionBlockCount(text: string, surface: string): void {
  const body = normalizeNewlines(text).trim();
  const witnessCount = countWitnessExecutionSections(body);
  const executionBlockCount = countPaidProExecutionBlocks(body);
  const hash = body.length >= 200 ? hashPaidProCorpus(body) : "";
  if (!hash) return;
  if (
    !shouldLogPaidProAuthoritySurfaceEvent({
      event: "execution-block-count",
      surface,
      hash,
      source: "execution_count",
      payloadSignature: JSON.stringify({ witnessCount, executionBlockCount }),
    })
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[execution-block-count]", { surface, witnessCount, executionBlockCount, hash, len: body.length });
}

export function resolveFrozenCorpusHashForDrift(): string | null {
  const frozen = getFrozenCanonicalAgreementCorpus();
  if (frozen?.hash) return frozen.hash;
  if (hasPaidProSourceOfTruth()) return getPaidProSourceOfTruth()?.hash ?? null;
  return null;
}

export function logCanonicalEstablishReconcile(args: {
  surface: string;
  preFreezeHash: string;
  postFreezeHash: string;
  preFreezeLen: number;
  postFreezeLen: number;
  preFreezePlain?: string | null;
  postFreezePlain?: string | null;
}): void {
  const pre = (args.preFreezePlain || "").trim();
  const post = (args.postFreezePlain || "").trim();
  const byteDiff =
    pre && post ? formatByteLevelCorpusDiffReport(computeByteLevelCorpusDiff(pre, post)) : null;
  if (
    !shouldLogPaidProAuthoritySurfaceEvent({
      event: "canonical-establish-reconcile",
      surface: args.surface,
      hash: args.postFreezeHash,
      source: "canonical_refreeze",
      payloadSignature: JSON.stringify({
        preFreezeHash: args.preFreezeHash,
        postFreezeHash: args.postFreezeHash,
      }),
    })
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[canonical-establish-reconcile]", {
    surface: args.surface,
    classification: "canonical_refreeze",
    preFreezeHash: args.preFreezeHash,
    postFreezeHash: args.postFreezeHash,
    preFreezeLen: args.preFreezeLen,
    postFreezeLen: args.postFreezeLen,
    ...(byteDiff ? { byteDiff } : {}),
  });
}

export function logPostFreezeCorpusDrift(args: {
  surface: string;
  renderedText: string;
  frozenHash?: string | null;
  mutationSource?: PaidProPostFreezeMutationSource;
}): void {
  if (shouldSkipPostFreezeDriftForReadonlyHtmlStrip(args.surface)) {
    return;
  }
  const rendered = (args.renderedText || "").trim();
  if (rendered.length < 200) return;
  const frozenHash = args.frozenHash ?? resolveFrozenCorpusHashForDrift();
  if (!frozenHash) return;
  const frozenPlain = resolvePaidProFrozenAuthoritativePlain();
  const renderedHash = hashPaidProCorpus(rendered);
  const identical = frozenHash === renderedHash;
  const mutationSource = args.mutationSource ?? "unknown";
  const boundary = recordPostFreezeCorpusBoundary({
    surface: args.surface,
    renderedText: rendered,
    mutationSource,
    frozenHash,
  });
  assertPostFreezeRenderedCorpusMatchesFrozen({
    surface: args.surface,
    renderedText: rendered,
    mutationSource,
    frozenHash,
    frozenPlain: frozenPlain ?? undefined,
  });
  const diff =
    !identical && frozenPlain
      ? formatByteLevelCorpusDiffReport(computeByteLevelCorpusDiff(frozenPlain, rendered))
      : null;
  const classification =
    frozenPlain && !identical
      ? classifyPostFreezeCorpusMutation({ mutationSource, before: frozenPlain, after: rendered })
      : null;
  if (classification === "canonical_refreeze" || classification === "display_html") {
    return;
  }
  if (
    !shouldLogPaidProAuthoritySurfaceEvent({
      event: "post-freeze-corpus-drift",
      surface: args.surface,
      hash: renderedHash,
      source: identical ? "identical" : "drift",
      payloadSignature: JSON.stringify({ frozenHash, identical, mutationSource }),
    })
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[post-freeze-corpus-drift]", {
    surface: args.surface,
    frozenHash,
    renderedHash,
    identical,
    len: rendered.length,
    mutationSource,
    classification: classification ?? (identical ? "identical" : "illegal_structural"),
    head: boundary.head,
    tail: boundary.tail,
    ...(diff ? { byteDiff: diff } : {}),
  });
}

/** Fingerprint helper for HTML/plain render boundaries that use agreement body hash. */
export function fingerprintRenderedCorpus(text: string): string {
  return fingerprintAgreementBody(text);
}
