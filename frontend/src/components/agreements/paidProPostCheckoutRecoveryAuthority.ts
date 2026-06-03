/**
 * Post-checkout local recovery → paid Pro source-of-truth handoff.
 * Recovery bodies that pass display gates commit through the same SoT path as server_full_draft.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  freezePaidProPostCheckoutRecoveryCanonicalSnapshot,
  resolvePaidProPostCheckoutRecoveryDisplayPlain,
} from "./paidProPostCheckoutRenderGate";
import { hasLatchedLongAcceptedServerFullDraft } from "./paidProAcceptedServerFullDraftCommitGuard";
import {
  establishPaidProSourceOfTruth,
  type PaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";

export type PostCheckoutRecoverySotCommitResult =
  | { committed: true; record: PaidProSourceOfTruth }
  | { committed: false; reason: string };

export function tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth(args: {
  body: string;
  draft: ParsedDraftShape;
  intakeText: string;
  premiumRenderSource: string;
  reviewSessionId?: string | null;
}): PostCheckoutRecoverySotCommitResult {
  if (hasLatchedLongAcceptedServerFullDraft()) {
    return { committed: false, reason: "latched_server_full_draft_authority_present" };
  }
  const displayPlain = resolvePaidProPostCheckoutRecoveryDisplayPlain({
    draft: args.draft,
    intakeText: args.intakeText,
    winningPremiumBodyText: args.body,
    premiumRenderSource: args.premiumRenderSource,
    premiumDegradedServerLocalRecovery:
      args.premiumRenderSource === "premium_degraded_server_local_recovery",
  });
  if (displayPlain.length < PAID_PRO_AUTHORITY_MIN_LEN) {
    return { committed: false, reason: "recovery_display_plain_below_review_min" };
  }
  try {
    const record = establishPaidProSourceOfTruth({
      text: displayPlain,
      source: "server_full_draft",
      draft: args.draft,
      intakeText: args.intakeText,
      reviewSessionId: args.reviewSessionId ?? null,
    });
    freezePaidProPostCheckoutRecoveryCanonicalSnapshot({
      text: record.text,
      draft: args.draft,
      intakeText: args.intakeText,
      reviewSessionId: args.reviewSessionId ?? null,
    });
    return { committed: true, record };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "establish_paid_pro_source_of_truth_failed";
    return { committed: false, reason };
  }
}

export function isPremiumNetworkLocalRecoveryRenderSource(
  source: string | null | undefined,
): boolean {
  return String(source || "").trim() === PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE;
}
