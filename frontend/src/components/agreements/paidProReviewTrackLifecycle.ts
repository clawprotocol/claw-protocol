/**
 * Paid Pro review track lifecycle audit — independent from signature track.
 * Logs canonical hash at each review-only step for Test271 E2E hardening.
 */

import { redactReviewUrlForLog } from "../../launch/simpleProduct/reviewerLinkRowModel";
import { readPaidProCorpusLifecycleCheckpoint } from "./paidProCorpusLifecycleDiff";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";

export type PaidProReviewTrackLifecycleEvent =
  | "review_track_selected"
  | "review_recipient_setup"
  | "review_link_generated"
  | "reviewer_link_opened"
  | "reviewer_link_closed"
  | "returned_to_owner";

const SENSITIVE_LOG_KEYS = new Set([
  "href",
  "absoluteUrl",
  "url",
  "token",
  "jti",
  "reviewHref",
  "review_url",
  "fragment",
  "bootstrapToken",
]);

function sanitizeLifecycleLogPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value !== "string") {
      out[key] = value;
      continue;
    }
    const lowerKey = key.toLowerCase();
    if (
      SENSITIVE_LOG_KEYS.has(key) ||
      lowerKey.includes("token") ||
      lowerKey.includes("href") ||
      lowerKey.includes("fragment") ||
      lowerKey.includes("jti")
    ) {
      if (lowerKey.includes("href") || key === "absoluteUrl" || key === "url" || lowerKey.includes("url")) {
        out[key] = redactReviewUrlForLog(value);
      } else {
        out[key] = value.trim() ? "(redacted)" : value;
      }
      continue;
    }
    out[key] = value;
  }
  return out;
}

function logLifecycle(event: string, payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  console.info(event, sanitizeLifecycleLogPayload(payload));
}

export function resolvePaidProReviewTrackCanonicalHash(fallbackText?: string | null): string | null {
  const freeze = readPaidProCorpusLifecycleCheckpoint("canonical_freeze");
  if (freeze?.hash) return freeze.hash;
  const t = (fallbackText || "").trim();
  if (t.length >= 80) return hashPaidProCorpus(t);
  return null;
}

export function logPaidProReviewTrackLifecycle(
  event: PaidProReviewTrackLifecycleEvent,
  payload: Record<string, unknown>,
): void {
  logLifecycle(`[${event}]`, payload);
}

export function logReviewLinkCreated(payload: Record<string, unknown>): void {
  logLifecycle("[review-link-created]", payload);
}

export function logReviewLinkOpen(payload: Record<string, unknown>): void {
  logLifecycle("[review-link-open]", payload);
}

export function logReviewLinkSurfaceMounted(payload: Record<string, unknown>): void {
  logLifecycle("[review-link-surface-mounted]", payload);
}
