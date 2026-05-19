/**
 * Persist starter review before Pro checkout so Back/cancel restores in-tab state
 * without re-running home auto-generate or draft API fetch.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  writeCreateReviewDraftReadyMarker,
  writeCreateReviewDraftSnapshot,
} from "./agreementIntakeStorage";
import { appendReturnToQueryParam } from "../../launch/checkoutParams";

const SESSION_KEY = "claw_checkout_back_starter_review_v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const CHECKOUT_BACK_RESTORE_QUERY_VALUE = "starterReview";

export type CheckoutBackStarterReviewSnapshotV1 = {
  version: 1;
  savedAt: number;
  source: "checkout_back_restore";
  intakeText: string;
  draft: ParsedDraftShape;
  previewText?: string;
  createFlowPhase: "draft_ready_for_review";
  displayPhase: "review";
};

export function buildCreateReturnToWithStarterReviewRestore(): string {
  return appendReturnToQueryParam("/app/create", "restore", CHECKOUT_BACK_RESTORE_QUERY_VALUE);
}

export function isCheckoutBackRestoreRequested(search: string): boolean {
  try {
    const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    return q.get("restore") === CHECKOUT_BACK_RESTORE_QUERY_VALUE;
  } catch {
    return false;
  }
}

export function hasCheckoutBackRestoreSnapshot(): boolean {
  return readCheckoutBackRestoreSnapshot() != null;
}

export function readCheckoutBackRestoreSnapshot(): CheckoutBackStarterReviewSnapshotV1 | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckoutBackStarterReviewSnapshotV1;
    if (parsed?.version !== 1 || parsed.source !== "checkout_back_restore") return null;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (!parsed.draft || typeof parsed.intakeText !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistStarterReviewBeforeCheckout(args: {
  intakeText: string;
  draft: ParsedDraftShape;
  previewText?: string;
}): void {
  const intakeText = (args.intakeText || "").trim();
  if (!intakeText || !args.draft) return;
  const body: CheckoutBackStarterReviewSnapshotV1 = {
    version: 1,
    savedAt: Date.now(),
    source: "checkout_back_restore",
    intakeText,
    draft: args.draft,
    previewText: args.previewText?.trim() || undefined,
    createFlowPhase: "draft_ready_for_review",
    displayPhase: "review",
  };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(body));
  } catch {
    /* ignore */
  }
  writeCreateReviewDraftReadyMarker();
  writeCreateReviewDraftSnapshot(args.draft);
  try {
    localStorage.setItem("claw_agreement_creator_intake_v1", intakeText);
  } catch {
    /* ignore */
  }
}

export function clearCheckoutBackRestoreSnapshot(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function logCheckoutBackRestoreStart(): void {
  console.info("[checkout-back-restore-start]");
}

export function logCheckoutBackRestoreApplied(args: {
  hasDraft: boolean;
  hasPreview: boolean;
  inputLen: number;
}): void {
  console.info("[checkout-back-restore-applied]", args);
}

export function logCheckoutBackRegenerationSkipped(reason: "saved_starter_review"): void {
  console.info("[checkout-back-regeneration-skipped]", { reason });
}

export function logCheckoutBackRestoreMiss(reason: string): void {
  console.info("[checkout-back-restore-miss]", { reason });
}
