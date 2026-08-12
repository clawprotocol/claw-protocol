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
  buildPostFreezeCorpusByteDiffPayload,
  classifyPostFreezeCorpusMutation,
  computeByteLevelCorpusDiff,
  formatByteLevelCorpusDiffReport,
  isPostFreezeAuthorizedSignerOverlayDrift,
  recordPostFreezeCorpusBoundary,
  resolvePaidProFrozenAuthoritativePlain,
  shouldSkipPostFreezeDriftForReadonlyHtmlStrip,
  type PaidProPostFreezeMutationSource,
  type PostFreezeCorpusMutationClass,
} from "./paidProPostFreezeCorpusInvariant";

let instrumentationLogForceForTests = false;

/** Enables authority-surface console instrumentation under Vitest (dedupe still applies). */
export function setPaidProInstrumentationLogForceForTests(on: boolean): void {
  instrumentationLogForceForTests = on;
}

function shouldEmitAuthorityLog(event: Parameters<typeof shouldLogPaidProAuthoritySurfaceEvent>[0]): boolean {
  return shouldLogPaidProAuthoritySurfaceEvent(event, { force: instrumentationLogForceForTests || undefined });
}

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
    !shouldEmitAuthorityLog({
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
    !shouldEmitAuthorityLog({
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

export type CanonicalEstablishReconcileClassification = "canonical_refreeze" | "corpus_boundary_match";

function executionPartyRoleFingerprint(text: string): string {
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : text;
  const roles =
    tail.match(
      /(?:^|\n)\s*(?:CLIENT|SERVICE\s+PROVIDER|CONSULTANT|PROVIDER|COMPANY|CONTRACTOR)\s*:/gim,
    ) ?? [];
  return fingerprintAgreementBody(roles.join("|"));
}

export function detectPostFreezeStructuralDrift(before: string, after: string): boolean {
  const frozenPlain = normalizeNewlines(before).trim();
  const renderedPlain = normalizeNewlines(after).trim();
  if (!frozenPlain || !renderedPlain) return false;
  if (countWitnessExecutionSections(frozenPlain) !== countWitnessExecutionSections(renderedPlain)) {
    return true;
  }
  if (countPaidProExecutionBlocks(frozenPlain) !== countPaidProExecutionBlocks(renderedPlain)) {
    return true;
  }
  if (executionPartyRoleFingerprint(frozenPlain) !== executionPartyRoleFingerprint(renderedPlain)) {
    return true;
  }
  const frozenManifestHash = getFrozenCanonicalAgreementCorpus()?.signerManifestHash;
  if (frozenManifestHash) {
    const manifest = getFrozenCanonicalAgreementCorpus()?.signerManifest ?? [];
    const manifestKey = fingerprintAgreementBody(JSON.stringify(manifest));
    if (manifestKey !== frozenManifestHash) return true;
  }
  return false;
}

export type PostFreezeCorpusInstrumentationEmit = "canonical_establish_reconcile" | "post_freeze_corpus_drift" | "none";

export type PostFreezeCorpusInstrumentationDecision = {
  emit: PostFreezeCorpusInstrumentationEmit;
  frozenHash: string | null;
  renderedHash: string | null;
  identical: boolean;
  structuralDrift: boolean;
  witnessCount: number;
  executionBlockCount: number;
  classification: PostFreezeCorpusMutationClass | null;
};

export function decidePostFreezeCorpusInstrumentation(args: {
  surface: string;
  renderedText: string;
  frozenHash?: string | null;
  mutationSource?: PaidProPostFreezeMutationSource;
  frozenPlain?: string | null;
}): PostFreezeCorpusInstrumentationDecision {
  const rendered = (args.renderedText || "").trim();
  const witnessCount = countWitnessExecutionSections(rendered);
  const executionBlockCount = countPaidProExecutionBlocks(rendered);
  const none = (frozenHash: string | null, renderedHash: string | null): PostFreezeCorpusInstrumentationDecision => ({
    emit: "none",
    frozenHash,
    renderedHash,
    identical: Boolean(frozenHash && renderedHash && frozenHash === renderedHash),
    structuralDrift: false,
    witnessCount,
    executionBlockCount,
    classification: null,
  });

  if (shouldSkipPostFreezeDriftForReadonlyHtmlStrip(args.surface)) {
    return none(null, null);
  }
  if (rendered.length < 200) {
    return none(null, null);
  }

  const frozenHash = args.frozenHash ?? resolveFrozenCorpusHashForDrift();
  if (!frozenHash) {
    return none(null, null);
  }

  const renderedHash = hashPaidProCorpus(rendered);
  const identical = frozenHash === renderedHash;
  const frozenPlain = args.frozenPlain ?? resolvePaidProFrozenAuthoritativePlain();
  const structuralDrift = frozenPlain ? detectPostFreezeStructuralDrift(frozenPlain, rendered) : false;
  const mutationSource = args.mutationSource ?? "unknown";
  const classification =
    frozenPlain && !identical
      ? classifyPostFreezeCorpusMutation({ mutationSource, before: frozenPlain, after: rendered })
      : null;

  const authorizedSignerOverlay =
    Boolean(frozenPlain) &&
    !identical &&
    (mutationSource === "signer_identity_apply" ||
      classification === "signer_hydration" ||
      isPostFreezeAuthorizedSignerOverlayDrift(frozenPlain!, rendered));

  if (authorizedSignerOverlay) {
    return none(frozenHash, renderedHash);
  }

  if (identical && !structuralDrift) {
    return {
      emit: "canonical_establish_reconcile",
      frozenHash,
      renderedHash,
      identical: true,
      structuralDrift: false,
      witnessCount,
      executionBlockCount,
      classification: null,
    };
  }

  const suppressedClassification =
    classification === "canonical_refreeze" ||
    classification === "display_html" ||
    classification === "signer_hydration" ||
    mutationSource === "canonical_establish_reconcile" ||
    mutationSource === "signer_identity_apply";

  if (!identical && suppressedClassification) {
    return {
      emit: "none",
      frozenHash,
      renderedHash,
      identical: false,
      structuralDrift,
      witnessCount,
      executionBlockCount,
      classification,
    };
  }

  if (!identical || structuralDrift) {
    return {
      emit: "post_freeze_corpus_drift",
      frozenHash,
      renderedHash,
      identical,
      structuralDrift,
      witnessCount,
      executionBlockCount,
      classification: classification ?? (identical ? null : "illegal_structural"),
    };
  }

  return none(frozenHash, renderedHash);
}

export function logCanonicalEstablishReconcile(args: {
  surface: string;
  classification: CanonicalEstablishReconcileClassification;
  frozenHash?: string;
  renderedHash?: string;
  preFreezeHash?: string;
  postFreezeHash?: string;
  preFreezeLen?: number;
  postFreezeLen?: number;
  preFreezePlain?: string | null;
  postFreezePlain?: string | null;
  witnessCount?: number;
  executionBlockCount?: number;
}): void {
  const classification = args.classification;
  const frozenHash = args.frozenHash ?? args.postFreezeHash ?? args.preFreezeHash ?? "";
  const renderedHash = args.renderedHash ?? frozenHash;
  const pre = (args.preFreezePlain || "").trim();
  const post = (args.postFreezePlain || "").trim();
  const byteDiff =
    classification === "canonical_refreeze" && pre && post
      ? formatByteLevelCorpusDiffReport(computeByteLevelCorpusDiff(pre, post))
      : null;

  const source =
    classification === "canonical_refreeze" ? "canonical_refreeze" : "corpus_boundary_match";
  const payloadSignature =
    classification === "canonical_refreeze"
      ? JSON.stringify({
          preFreezeHash: args.preFreezeHash,
          postFreezeHash: args.postFreezeHash,
        })
      : JSON.stringify({
          frozenHash,
          renderedHash,
          identical: frozenHash === renderedHash,
          witnessCount: args.witnessCount ?? 0,
          executionBlockCount: args.executionBlockCount ?? 0,
        });

  if (
    !shouldEmitAuthorityLog({
      event: "canonical-establish-reconcile",
      surface: args.surface,
      hash: renderedHash || frozenHash,
      source,
      payloadSignature,
    })
  ) {
    return;
  }

  if (classification === "corpus_boundary_match") {
    // eslint-disable-next-line no-console
    console.info("[canonical-establish-reconcile]", {
      surface: args.surface,
      classification,
      frozenHash,
      renderedHash,
      identical: frozenHash === renderedHash,
      witnessCount: args.witnessCount ?? 0,
      executionBlockCount: args.executionBlockCount ?? 0,
      len: args.postFreezeLen,
    });
    return;
  }

  // eslint-disable-next-line no-console
  console.info("[canonical-establish-reconcile]", {
    surface: args.surface,
    classification,
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
  const rendered = (args.renderedText || "").trim();
  if (rendered.length < 200) return;

  // Readonly HTML entry audits input plain separately from post-strip display; do not
  // hard-fail when callers pass pre-freeze or signature-bearing plain into the builder.
  if (shouldSkipPostFreezeDriftForReadonlyHtmlStrip(args.surface)) {
    return;
  }

  const frozenPlain = resolvePaidProFrozenAuthoritativePlain();
  const decision = decidePostFreezeCorpusInstrumentation({
    surface: args.surface,
    renderedText: rendered,
    frozenHash: args.frozenHash,
    mutationSource: args.mutationSource ?? "readonly_display_strip",
    frozenPlain: frozenPlain ?? undefined,
  });

  if (decision.frozenHash) {
    recordPostFreezeCorpusBoundary({
      surface: args.surface,
      renderedText: rendered,
      mutationSource: args.mutationSource,
      frozenHash: decision.frozenHash,
    });
  }

  if (frozenPlain) {
    logPostFreezeCorpusByteDiff({
      surface: args.surface,
      frozenPlain,
      renderedPlain: rendered,
      mutationSource: args.mutationSource,
      suppressed: decision.emit !== "post_freeze_corpus_drift",
    });
  }

  assertPostFreezeRenderedCorpusMatchesFrozen({
    surface: args.surface,
    renderedText: rendered,
    mutationSource: args.mutationSource,
    frozenHash: decision.frozenHash ?? undefined,
    frozenPlain: frozenPlain ?? undefined,
  });

  if (decision.emit === "canonical_establish_reconcile" && decision.frozenHash && decision.renderedHash) {
    logCanonicalEstablishReconcile({
      surface: args.surface,
      classification: "corpus_boundary_match",
      frozenHash: decision.frozenHash,
      renderedHash: decision.renderedHash,
      witnessCount: decision.witnessCount,
      executionBlockCount: decision.executionBlockCount,
      postFreezeLen: rendered.length,
    });
    return;
  }

  if (decision.emit !== "post_freeze_corpus_drift" || !decision.frozenHash || !decision.renderedHash) {
    return;
  }

  const diff = frozenPlain
    ? formatByteLevelCorpusDiffReport(computeByteLevelCorpusDiff(frozenPlain, rendered))
    : null;
  const boundary = readPostFreezeBoundaryHeadTail(rendered);
  const mutationSource = args.mutationSource ?? "unknown";

  if (
    !shouldEmitAuthorityLog({
      event: "post-freeze-corpus-drift",
      surface: args.surface,
      hash: decision.renderedHash,
      source: "drift",
      payloadSignature: JSON.stringify({
        frozenHash: decision.frozenHash,
        identical: decision.identical,
        mutationSource,
        structuralDrift: decision.structuralDrift,
        witnessCount: decision.witnessCount,
        executionBlockCount: decision.executionBlockCount,
      }),
    })
  ) {
    return;
  }

  // eslint-disable-next-line no-console
  console.info("[post-freeze-corpus-drift]", {
    surface: args.surface,
    frozenHash: decision.frozenHash,
    renderedHash: decision.renderedHash,
    identical: decision.identical,
    structuralDrift: decision.structuralDrift,
    len: rendered.length,
    mutationSource,
    classification: decision.classification ?? "illegal_structural",
    witnessCount: decision.witnessCount,
    executionBlockCount: decision.executionBlockCount,
    head: boundary.head,
    tail: boundary.tail,
    ...(diff ? { byteDiff: diff } : {}),
  });
}

function logPostFreezeCorpusByteDiff(args: {
  surface: string;
  frozenPlain: string;
  renderedPlain: string;
  mutationSource?: PaidProPostFreezeMutationSource;
  suppressed?: boolean;
}): void {
  if (!instrumentationLogForceForTests && import.meta.env?.DEV !== true) return;
  const payload = buildPostFreezeCorpusByteDiffPayload(args.frozenPlain, args.renderedPlain, args.surface);
  if (payload.identical) return;
  // eslint-disable-next-line no-console
  console.info("[post-freeze-corpus-byte-diff]", {
    ...payload,
    mutationSource: args.mutationSource ?? "unknown",
    suppressed: Boolean(args.suppressed),
  });
}

function readPostFreezeBoundaryHeadTail(text: string, n = 250): { head: string; tail: string } {
  const t = text || "";
  return {
    head: t.slice(0, n),
    tail: t.length > n ? t.slice(-n) : t,
  };
}

/** Fingerprint helper for HTML/plain render boundaries that use agreement body hash. */
export function fingerprintRenderedCorpus(text: string): string {
  return fingerprintAgreementBody(text);
}
