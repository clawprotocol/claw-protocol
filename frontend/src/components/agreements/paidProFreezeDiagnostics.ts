/**
 * Production diagnostics for paid-Pro canonical freeze and post-freeze consumer parity.
 */

import { hashPaidProCorpus } from "./paidProSourceOfTruth";

function isTestMode(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

export function logPaidProFreezeEstablished(payload: {
  hash: string;
  partyCount: number;
  signerCount: number;
}): void {
  if (isTestMode()) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-freeze-established]", payload);
}

export function logPaidProFreezeConsumer(payload: {
  consumer: string;
  hash: string;
  partyCount: number;
  signerCount: number;
}): void {
  if (isTestMode()) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-freeze-consumer]", payload);
}

export function logPaidProPostFreezeMutationAttempt(payload: {
  caller: string;
  blocked: boolean;
  surface?: string | null;
}): void {
  if (isTestMode()) return;
  // eslint-disable-next-line no-console
  console.warn("[paid-pro-post-freeze-mutation-attempt]", payload);
}

export function paidProFreezeConsumerMeta(corpusText: string): { hash: string; partyCount: number; signerCount: number } {
  const hash = hashPaidProCorpus(corpusText);
  return { hash, partyCount: 0, signerCount: 0 };
}
