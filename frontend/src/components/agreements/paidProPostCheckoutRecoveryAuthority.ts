/**
 * Post-checkout local recovery → paid Pro source-of-truth handoff.
 * Recovery bodies that pass display gates commit through the same SoT path as server_full_draft.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  freezePaidProPostCheckoutRecoveryCanonicalSnapshot,
  meetsPaidProDegradedRecoveryDisplayRequirements,
  resolvePaidProPostCheckoutRecoveryDisplayPlain,
} from "./paidProPostCheckoutRenderGate";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import { hasLatchedLongAcceptedServerFullDraft } from "./paidProAcceptedServerFullDraftCommitGuard";
import {
  establishPaidProSourceOfTruth,
  type PaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
  PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
} from "./premiumNetworkRecoveryLocalDraft";

export type PostCheckoutRecoverySotCommitResult =
  | {
      committed: true;
      record: PaidProSourceOfTruth;
      /** Result of freezePaidProPostCheckoutRecoveryCanonicalSnapshot only — not ref assignment. */
      canonicalSnapshotFrozen: boolean;
      reviewCorpusLen: number;
    }
  | { committed: false; reason: string; reviewCorpusLen: number };

export type PostCheckoutRecoverySotPreview = {
  eligible: boolean;
  displayPlain: string;
  blockReason: string;
  rawBodyLen: number;
  displayPlainLen: number;
};

/** Same gates as {@link tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth} without mutating SoT. */
export function previewPostCheckoutRecoverySotCommit(args: {
  body: string;
  draft: ParsedDraftShape;
  intakeText: string;
  premiumRenderSource: string;
}): PostCheckoutRecoverySotPreview {
  const rawBodyLen = (args.body || "").trim().length;
  if (hasLatchedLongAcceptedServerFullDraft()) {
    return {
      eligible: false,
      displayPlain: "",
      blockReason: "latched_server_full_draft_authority_present",
      rawBodyLen,
      displayPlainLen: 0,
    };
  }
  const displayPlain = resolvePaidProPostCheckoutRecoveryDisplayPlain({
    draft: args.draft,
    intakeText: args.intakeText,
    winningPremiumBodyText: args.body,
    premiumRenderSource: args.premiumRenderSource,
    premiumDegradedServerLocalRecovery:
      args.premiumRenderSource === PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
  });
  const rawBody = (args.body || "").trim();
  const resolvedDisplayPlain =
    displayPlain.length >= PAID_PRO_AUTHORITY_MIN_LEN
      ? displayPlain
      : meetsPaidProDegradedRecoveryDisplayRequirements(rawBody, args.intakeText) &&
          (args.premiumRenderSource === PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE ||
            args.premiumRenderSource === PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE)
        ? rawBody
        : "";
  if (resolvedDisplayPlain.length < PAID_PRO_AUTHORITY_MIN_LEN) {
    return {
      eligible: false,
      displayPlain: resolvedDisplayPlain,
      blockReason: "recovery_display_plain_below_review_min",
      rawBodyLen,
      displayPlainLen: resolvedDisplayPlain.length,
    };
  }
  return {
    eligible: true,
    displayPlain: resolvedDisplayPlain,
    blockReason: "",
    rawBodyLen,
    displayPlainLen: resolvedDisplayPlain.length,
  };
}

export function logPremiumRecoveryAuthority(args: {
  surface: string;
  /** Final authority adoption only — call after authoritativeAgreementSnapshotRef is assigned when true. */
  accepted: boolean;
  adoptedToSoT: boolean;
  /** authoritativeAgreementSnapshotRef.current assigned with non-empty committed corpus. */
  authoritativeSnapshotAssigned: boolean;
  /** freezePaidProPostCheckoutRecoveryCanonicalSnapshot produced a frozen hash. */
  canonicalSnapshotFrozen: boolean;
  blockedReason: string | null;
  reviewCorpusLen: number;
  premiumRenderSource?: string | null;
  rawBodyLen?: number | null;
  displayPlainLen?: number | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (import.meta.env.DEV && args.accepted && !args.authoritativeSnapshotAssigned) {
    // eslint-disable-next-line no-console
    console.warn("[premium-recovery-authority] accepted:true requires authoritativeSnapshotAssigned:true", {
      surface: args.surface,
    });
  }
  // eslint-disable-next-line no-console
  console.info("[premium-recovery-authority]", {
    surface: args.surface,
    accepted: args.accepted,
    adoptedToSoT: args.adoptedToSoT,
    authoritativeSnapshotAssigned: args.authoritativeSnapshotAssigned,
    canonicalSnapshotFrozen: args.canonicalSnapshotFrozen,
    blockedReason: args.blockedReason,
    reviewCorpusLen: args.reviewCorpusLen,
    premiumRenderSource: args.premiumRenderSource ?? null,
    rawBodyLen: args.rawBodyLen ?? null,
    displayPlainLen: args.displayPlainLen ?? null,
  });
}

export function tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth(args: {
  body: string;
  draft: ParsedDraftShape;
  intakeText: string;
  premiumRenderSource: string;
  reviewSessionId?: string | null;
}): PostCheckoutRecoverySotCommitResult {
  const preview = previewPostCheckoutRecoverySotCommit({
    body: args.body,
    draft: args.draft,
    intakeText: args.intakeText,
    premiumRenderSource: args.premiumRenderSource,
  });
  if (!preview.eligible) {
    return {
      committed: false,
      reason: preview.blockReason,
      reviewCorpusLen: preview.rawBodyLen,
    };
  }
  try {
    markPaidProPipelineValidationPassed({
      text: preview.displayPlain,
      source: args.premiumRenderSource,
    });
    const record = establishPaidProSourceOfTruth({
      text: preview.displayPlain,
      source: "server_full_draft",
      draft: args.draft,
      intakeText: args.intakeText,
      reviewSessionId: args.reviewSessionId ?? null,
      generationOutcome: "degraded",
    });
    const frozen = freezePaidProPostCheckoutRecoveryCanonicalSnapshot({
      text: record.text,
      draft: args.draft,
      intakeText: args.intakeText,
      reviewSessionId: args.reviewSessionId ?? null,
    });
    return {
      committed: true,
      record,
      canonicalSnapshotFrozen: Boolean(frozen?.hash),
      reviewCorpusLen: record.text.length,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "establish_paid_pro_source_of_truth_failed";
    return { committed: false, reason, reviewCorpusLen: preview.displayPlainLen };
  }
}

export function isPremiumNetworkLocalRecoveryRenderSource(
  source: string | null | undefined,
): boolean {
  return String(source || "").trim() === PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE;
}
