/**
 * StrictMode-safe single exchange for fragment bootstrap tokens.
 */

import {
  exchangeRecipientBootstrapToken,
  type RecipientBootstrapExchangeResult,
} from "./recipientBootstrapSessionApi";

let fragmentBootstrapExchangePromise: Promise<RecipientBootstrapExchangeResult> | null = null;

export function exchangeFragmentBootstrapTokenOnce(
  token: string,
): Promise<RecipientBootstrapExchangeResult> {
  if (!fragmentBootstrapExchangePromise) {
    fragmentBootstrapExchangePromise = exchangeRecipientBootstrapToken(token);
  }
  return fragmentBootstrapExchangePromise;
}

export function getFragmentBootstrapExchangePromise(): Promise<RecipientBootstrapExchangeResult> | null {
  return fragmentBootstrapExchangePromise;
}

export function resetFragmentBootstrapExchangeForTests(): void {
  fragmentBootstrapExchangePromise = null;
}
