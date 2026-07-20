/**
 * StrictMode-safe single exchange for negotiation-review fragment bootstrap tokens.
 * Deduplicates by agreement id + cryptographic token fingerprint.
 */

import { sha256Hex } from "../utils/agreements/hash";
import {
  exchangeNegotiationReviewBootstrapToken,
  type NegotiationReviewBootstrapExchangeResult,
} from "./negotiationReviewSessionApi";
import { getReviewFragmentBootstrapMetadata } from "./reviewFragmentBootstrapToken";

const exchangePromises = new Map<string, Promise<NegotiationReviewBootstrapExchangeResult>>();
const fingerprintPromises = new Map<string, Promise<string>>();
const pendingByRawToken = new Map<string, Promise<NegotiationReviewBootstrapExchangeResult>>();

function fingerprintToken(token: string): Promise<string> {
  const raw = token.trim();
  if (!raw) return Promise.resolve("");
  const existing = fingerprintPromises.get(raw);
  if (existing) return existing;
  const promise = sha256Hex(raw);
  fingerprintPromises.set(raw, promise);
  return promise;
}

function resolveAgreementIdForExchange(agreementId?: string): string {
  const explicit = (agreementId || "").trim();
  if (explicit) return explicit;
  return (getReviewFragmentBootstrapMetadata()?.agreementIdFromPath || "").trim();
}

function exchangeKey(agreementId: string, tokenFingerprint: string): string {
  return `${agreementId}:${tokenFingerprint}`;
}

export function exchangeReviewFragmentBootstrapTokenOnce(
  token: string,
  agreementId?: string,
): Promise<NegotiationReviewBootstrapExchangeResult> {
  const trimmed = token.trim();
  const aid = resolveAgreementIdForExchange(agreementId);
  const rawPendingKey = `${aid}:raw:${trimmed}`;
  const existingPending = pendingByRawToken.get(rawPendingKey);
  if (existingPending) {
    return existingPending;
  }
  const promise = fingerprintToken(trimmed).then((fp) => {
    const key = exchangeKey(aid, fp);
    const existing = exchangePromises.get(key);
    if (existing) {
      return existing;
    }
    const exchangePromise = exchangeNegotiationReviewBootstrapToken(trimmed);
    exchangePromises.set(key, exchangePromise);
    void exchangePromise.finally(() => {
      if (exchangePromises.get(key) === exchangePromise) {
        exchangePromises.delete(key);
      }
    });
    return exchangePromise;
  });
  pendingByRawToken.set(rawPendingKey, promise);
  void promise.finally(() => {
    if (pendingByRawToken.get(rawPendingKey) === promise) {
      pendingByRawToken.delete(rawPendingKey);
    }
  });
  return promise;
}

export function getReviewFragmentBootstrapExchangePromise(
  agreementId?: string,
): Promise<NegotiationReviewBootstrapExchangeResult> | null {
  const aid = (agreementId || getReviewFragmentBootstrapMetadata()?.agreementIdFromPath || "").trim();
  if (!aid) return null;
  const prefix = `${aid}:`;
  const matches: Promise<NegotiationReviewBootstrapExchangeResult>[] = [];
  for (const [key, promise] of exchangePromises.entries()) {
    if (key.startsWith(prefix)) {
      matches.push(promise);
    }
  }
  // StrictMode remount: join only when exactly one in-flight exchange exists for this agreement.
  if (matches.length === 1) {
    return matches[0]!;
  }
  return null;
}

export function resetReviewFragmentBootstrapExchangeForTests(): void {
  exchangePromises.clear();
  fingerprintPromises.clear();
  pendingByRawToken.clear();
}
