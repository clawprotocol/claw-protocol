/**
 * DEV-only Paid Pro corpus mutation timeline (temporary investigation instrumentation).
 * Logs only authoritative store writes — never read/resolve/render paths.
 */

import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";

export type PaidProCorpusStore =
  | "agreementDocumentText"
  | "authoritativeAgreementDocument"
  | "paidProSourceOfTruth"
  | "acceptedReviewCorpusRef"
  | "finalizedSigningCorpusRef"
  | "pinned_signer_applied_corpus"
  | "authoritative_signing_snapshot";

export type PaidProMutationTraceEvent = {
  timestamp: number;
  caller: string;
  stage: string;
  surface: string | null;
  store: PaidProCorpusStore;
  oldLen: number;
  oldHash: string;
  newLen: number;
  newHash: string;
  sourceBefore: string | null;
  sourceAfter: string | null;
  didChange: boolean;
  stack: string;
};

/** Stores that may receive trace entries (excludes resolver/render output). */
export const PAID_PRO_MUTATION_WRITE_STORES: readonly PaidProCorpusStore[] = [
  "agreementDocumentText",
  "authoritativeAgreementDocument",
  "paidProSourceOfTruth",
  "acceptedReviewCorpusRef",
  "finalizedSigningCorpusRef",
  "pinned_signer_applied_corpus",
  "authoritative_signing_snapshot",
];

const WRITE_STORES = new Set<PaidProCorpusStore>(PAID_PRO_MUTATION_WRITE_STORES);

const TIMELINE_CAP = 100;

const timeline: PaidProMutationTraceEvent[] = [];
const dedupeKeys = new Set<string>();

let reviewCorpusArmed = false;
let reviewArmedAt: number | null = null;
let reviewArmedPhase: string | null = null;
let forceEnabledForTests = false;

function isDevTraceEnabled(): boolean {
  if (forceEnabledForTests) return true;
  return typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV) && import.meta.env?.MODE !== "test";
}

function corpusHash(text: string): string {
  const t = (text || "").trim();
  if (!t) return "empty";
  return fingerprintAgreementBody(t);
}

function captureStack(skip = 2): string {
  const raw = new Error().stack ?? "";
  return raw
    .split("\n")
    .slice(skip, skip + 10)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function dedupeKeyFor(args: {
  caller: string;
  stage: string;
  store: PaidProCorpusStore;
  oldHash: string;
  newHash: string;
}): string {
  return `${args.caller}|${args.stage}|${args.store}|${args.oldHash}|${args.newHash}`;
}

function emitTimeline(added: PaidProMutationTraceEvent | null): void {
  // eslint-disable-next-line no-console
  console.info("[paid-pro-mutation-timeline]", {
    reviewArmed: reviewCorpusArmed,
    reviewArmedAt,
    reviewArmedPhase,
    eventCount: timeline.length,
    cappedAt: TIMELINE_CAP,
    lastEvent: added,
  });
}

export function setPaidProMutationTraceForceEnabledForTests(enabled: boolean): void {
  forceEnabledForTests = enabled;
}

export function resetPaidProMutationTraceForTests(): void {
  timeline.length = 0;
  dedupeKeys.clear();
  reviewCorpusArmed = false;
  reviewArmedAt = null;
  reviewArmedPhase = null;
  forceEnabledForTests = false;
}

/** Arm invariant after first valid Paid Pro review + draft_ready_for_review. */
export function armPaidProMutationTraceReviewReady(args: {
  phase: string;
  corpusLen?: number;
  corpusHash?: string;
}): void {
  if (!isDevTraceEnabled()) return;
  if (reviewCorpusArmed) return;
  reviewCorpusArmed = true;
  reviewArmedAt = Date.now();
  reviewArmedPhase = args.phase;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-mutation-trace-review-armed]", {
    phase: args.phase,
    corpusLen: args.corpusLen ?? null,
    corpusHash: args.corpusHash ?? null,
  });
}

export function isPaidProMutationTraceReviewArmed(): boolean {
  return reviewCorpusArmed;
}

export function getPaidProMutationTimeline(): readonly PaidProMutationTraceEvent[] {
  return timeline;
}

export function tracePaidProCorpusMutation(args: {
  store: PaidProCorpusStore;
  caller: string;
  stage: string;
  surface?: string | null;
  oldText?: string | null;
  newText?: string | null;
  sourceBefore?: string | null;
  sourceAfter?: string | null;
}): void {
  if (!isDevTraceEnabled()) return;
  if (!WRITE_STORES.has(args.store)) return;

  const oldText = args.oldText ?? "";
  const newText = args.newText ?? "";
  const oldLen = oldText.length;
  const newLen = newText.length;
  const oldHash = corpusHash(oldText);
  const newHash = corpusHash(newText);
  const didChange = oldHash !== newHash || oldLen !== newLen;
  if (!didChange) return;

  const dedupeKey = dedupeKeyFor({
    caller: args.caller,
    stage: args.stage,
    store: args.store,
    oldHash,
    newHash,
  });
  if (dedupeKeys.has(dedupeKey)) return;
  dedupeKeys.add(dedupeKey);

  const event: PaidProMutationTraceEvent = {
    timestamp: Date.now(),
    caller: args.caller,
    stage: args.stage,
    surface: args.surface ?? null,
    store: args.store,
    oldLen,
    oldHash,
    newLen,
    newHash,
    sourceBefore: args.sourceBefore ?? null,
    sourceAfter: args.sourceAfter ?? null,
    didChange,
    stack: captureStack(3),
  };

  timeline.push(event);
  while (timeline.length > TIMELINE_CAP) {
    timeline.shift();
  }

  // eslint-disable-next-line no-console
  console.info("[paid-pro-mutation-trace]", event);

  if (reviewCorpusArmed) {
    // eslint-disable-next-line no-console
    console.error("[paid-pro-authoritative-body-mutated-after-review]", {
      reviewArmedPhase,
      reviewArmedAt,
      ...event,
    });
  }

  emitTimeline(event);
}
