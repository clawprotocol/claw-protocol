/**
 * Post-finalize paid Pro agreement editor open resolver — hydrated snapshot seed only.
 */

import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  canProceedPaidProReviewFirstHandoffAfterFinalize,
  resolvePaidProPostFinalizeReviewHash,
  resolvePaidProPostFinalizeReviewPlain,
} from "./paidProPostFinalizeReviewSurface";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";

export type PaidProPostFinalizeEditOpenResult =
  | {
      opened: true;
      plain: string;
      source: "authoritative_signing_snapshot" | "simple_pro_final_review_display";
      corpusHash: string;
      bodyLen: number;
      hydrated: true;
    }
  | {
      opened: false;
      reason: string;
      corpusHash: string;
      hydrated: boolean;
      canProceed: boolean;
    };

export function resolvePaidProPostFinalizeEditDraftPlain(fallbackPlain?: string): {
  plain: string;
  source: "authoritative_signing_snapshot" | "simple_pro_final_review_display" | "none";
} {
  const locked = resolvePaidProPostFinalizeReviewPlain();
  if (locked.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return { plain: locked, source: "authoritative_signing_snapshot" };
  }
  const fb = (fallbackPlain ?? "").trim();
  if (fb.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return { plain: fb, source: "simple_pro_final_review_display" };
  }
  return { plain: "", source: "none" };
}

export function tryResolvePaidProPostFinalizeEditOpen(args: {
  hasDraft: boolean;
  signersComplete: boolean;
  fallbackPlain?: string;
}): PaidProPostFinalizeEditOpenResult {
  const hydratedLocked = isPaidProPostFinalizeHydratedCorpusLocked();
  const { plain, source } = resolvePaidProPostFinalizeEditDraftPlain(args.fallbackPlain);
  const corpusHash =
    plain.length >= 80 ? hashPaidProCorpus(plain) : resolvePaidProPostFinalizeReviewHash();
  const canProceed = canProceedPaidProReviewFirstHandoffAfterFinalize({
    signersComplete: args.signersComplete,
    reviewPlain: plain,
  });

  if (!hydratedLocked) {
    return {
      opened: false,
      reason: "post_finalize_lock_inactive",
      corpusHash,
      hydrated: false,
      canProceed,
    };
  }
  if (!args.hasDraft) {
    return {
      opened: false,
      reason: "no_draft",
      corpusHash,
      hydrated: true,
      canProceed,
    };
  }
  if (plain.length < PAID_PRO_AUTHORITY_MIN_LEN || source === "none") {
    return {
      opened: false,
      reason: "hydrated_plain_unavailable",
      corpusHash,
      hydrated: true,
      canProceed,
    };
  }
  return {
    opened: true,
    plain,
    source,
    corpusHash,
    bodyLen: plain.length,
    hydrated: true,
  };
}

let lastEditOpenedLog = "";
let lastEditBlockedLog = "";

export function logPaidProPostFinalizeEditOpened(payload: {
  corpusHash: string;
  hydrated: boolean;
  bodyLen: number;
  source: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = `${payload.corpusHash}:${payload.source}`;
  if (key === lastEditOpenedLog) return;
  lastEditOpenedLog = key;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-post-finalize-edit-opened]", payload);
}

export function logPaidProPostFinalizeEditBlocked(payload: {
  reason: string;
  corpusHash: string;
  hydrated: boolean;
  canProceed: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = `${payload.reason}:${payload.corpusHash}`;
  if (key === lastEditBlockedLog) return;
  lastEditBlockedLog = key;
  // eslint-disable-next-line no-console
  console.warn("[paid-pro-post-finalize-edit-blocked]", payload);
}
