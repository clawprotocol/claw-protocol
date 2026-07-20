/**
 * Negotiation-review session lifecycle helpers (GTM Security Slice 3B).
 */

import { clearAllEphemeralOwnerReviewCopyLinks } from "../launch/simpleProduct/ephemeralOwnerReviewCopyLinks";
import { logoutNegotiationReviewSession } from "./negotiationReviewSessionApi";

let negotiationReviewSessionActive = false;
let sessionInvalidationListeners: Array<() => void> = [];

export type LogoutNegotiationReviewSessionResult =
  | { ok: true }
  | { ok: false; message: string };

export function setNegotiationReviewSessionAuth(active: boolean): void {
  negotiationReviewSessionActive = active;
}

export function isNegotiationReviewSessionAuth(): boolean {
  return negotiationReviewSessionActive;
}

export function onNegotiationReviewSessionInvalidated(listener: () => void): () => void {
  sessionInvalidationListeners.push(listener);
  return () => {
    sessionInvalidationListeners = sessionInvalidationListeners.filter((l) => l !== listener);
  };
}

export function invalidateNegotiationReviewSessionPresentation(): void {
  negotiationReviewSessionActive = false;
  clearAllEphemeralOwnerReviewCopyLinks();
  for (const listener of sessionInvalidationListeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

export async function logoutNegotiationReviewSessionPresentation(): Promise<LogoutNegotiationReviewSessionResult> {
  try {
    const status = await logoutNegotiationReviewSession();
    if (!status.ok || status.authenticated) {
      return {
        ok: false,
        message: "We could not end your review session. Check your connection and try again.",
      };
    }
  } catch {
    return {
      ok: false,
      message: "We could not end your review session. Check your connection and try again.",
    };
  }
  invalidateNegotiationReviewSessionPresentation();
  return { ok: true };
}

export function resetNegotiationReviewSessionAuthForTests(): void {
  negotiationReviewSessionActive = false;
  sessionInvalidationListeners = [];
}

/** Headers for recipient reads/mutations when session cookie auth is active. */
export function negotiationReviewSessionReadHeaders(): Record<string, string> {
  return {};
}

/** Fetch init fragment for recipient agreement API calls. */
export function recipientReviewFetchInit(
  explicitToken?: string | null,
): Pick<RequestInit, "credentials" | "headers"> {
  if (negotiationReviewSessionActive) {
    return { credentials: "include", headers: {} };
  }
  const t = (explicitToken || "").trim();
  if (!t) {
    return { headers: {} };
  }
  return { headers: { "X-Claw-Recipient-Access-Token": t } };
}
