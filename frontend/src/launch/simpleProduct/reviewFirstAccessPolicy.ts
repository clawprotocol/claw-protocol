import {
  fetchRecipientAccessPolicy,
  type RecipientAccessPolicy,
} from "../../agreement/recipientAccessApi";
import { SIGNING_TOKEN_SECRET_NOT_CONFIGURED_CODE } from "../../agreement/recipientAccessMintPayload";
import { logReviewFirstPolicyPreflightBlocked } from "../../components/agreements/guidedDealCompletion/guidedFinalReviewToSigning";
import {
  REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE,
  agreementIdShortForReviewFirstLog,
  logReviewFirstEnvTokenSecretMissing,
} from "./reviewFirstSendSurface";

const POLICY_CACHE_MS = 30_000;

let cachedPolicy: { policy: RecipientAccessPolicy; fetchedAt: number } | null = null;

export function clearReviewFirstAccessPolicyCache(): void {
  cachedPolicy = null;
}

export async function fetchReviewFirstAccessPolicy(
  options?: { forceRefresh?: boolean },
): Promise<RecipientAccessPolicy | null> {
  if (
    !options?.forceRefresh &&
    cachedPolicy &&
    Date.now() - cachedPolicy.fetchedAt < POLICY_CACHE_MS
  ) {
    return cachedPolicy.policy;
  }
  const policy = await fetchRecipientAccessPolicy();
  if (policy) {
    cachedPolicy = { policy, fetchedAt: Date.now() };
  }
  return policy;
}

export function isReviewLinkMintEnabledFromPolicy(policy: RecipientAccessPolicy | null): boolean {
  if (!policy) return true;
  if (typeof policy.review_link_mint_enabled === "boolean") {
    return policy.review_link_mint_enabled;
  }
  return policy.signing_token_configured !== false;
}

export type ReviewFirstMintPolicyGateResult =
  | { ok: true; policy: RecipientAccessPolicy | null }
  | {
      ok: false;
      userMessage: string;
      mintErrorCode: string;
      policy: RecipientAccessPolicy | null;
    };

/**
 * Preflight before POST …/recipient-access-token — avoids repeated 422 mint loops when
 * the API reports review-link mint is disabled (e.g. production without signing secret).
 */
export async function resolveReviewFirstMintPolicyGate(args: {
  agreementId: string;
  source?: string | null;
  forceRefresh?: boolean;
}): Promise<ReviewFirstMintPolicyGateResult> {
  const policy = await fetchReviewFirstAccessPolicy({ forceRefresh: args.forceRefresh });
  if (!isReviewLinkMintEnabledFromPolicy(policy)) {
    logReviewFirstPolicyPreflightBlocked({
      agreementId: args.agreementId,
      source: args.source ?? null,
      signingTokenConfigured: policy?.signing_token_configured ?? null,
      reviewLinkMintEnabled: policy?.review_link_mint_enabled ?? false,
      signingTokenEnvVarDetected: policy?.signing_token_env_var_detected ?? null,
    });
    logReviewFirstEnvTokenSecretMissing({
      agreementId: args.agreementId,
      source: args.source ?? null,
    });
    return {
      ok: false,
      userMessage: REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE,
      mintErrorCode: SIGNING_TOKEN_SECRET_NOT_CONFIGURED_CODE,
      policy,
    };
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.info("[review-first-policy-preflight]", {
      agreementIdShort: agreementIdShortForReviewFirstLog(args.agreementId),
      source: args.source ?? null,
      reviewLinkMintEnabled: policy?.review_link_mint_enabled ?? null,
      signingTokenConfigured: policy?.signing_token_configured ?? null,
      signingTokenEnvVarDetected: policy?.signing_token_env_var_detected ?? null,
    });
  }
  return { ok: true, policy };
}
