/**
 * Paid Pro review track lifecycle audit — independent from signature track.
 * Logs canonical hash at each review-only step for Test271 E2E hardening.
 */

import { readPaidProCorpusLifecycleCheckpoint } from "./paidProCorpusLifecycleDiff";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";

export type PaidProReviewTrackLifecycleEvent =
  | "review_track_selected"
  | "review_recipient_setup"
  | "review_link_generated"
  | "reviewer_link_opened"
  | "reviewer_link_closed"
  | "returned_to_owner";

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
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info(`[${event}]`, payload);
}

export function logReviewLinkCreated(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-link-created]", payload);
}

export function logReviewLinkOpen(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-link-open]", payload);
}

export function logReviewLinkSurfaceMounted(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-link-surface-mounted]", payload);
}
