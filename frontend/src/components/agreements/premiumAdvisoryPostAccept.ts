/**
 * Best-effort “advisory” HTTP (premium-review, premium-finalize-audit, premium-review-route) after
 * a paid, validated Pro body is already accepted. Failures (e.g. backend 503 when the LLM path errors)
 * must not block or demote the primary Pro success path — they only enrich the UI when present.
 *
 * Backend: `agreements_v2_api.premium_agreement_review` returns HTTP 503 on any exception in
 * `call_legal_llm` (see `HTTPException` with `premium_review_unavailable`).
 */
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildContextForReview, postPremiumAgreementReviewWithRetry } from "./premiumAgreementReviewApi";
import type { PremiumAgreementReview } from "./premiumAgreementReviewTypes";
import { buildPremiumFinalizeAuditContext, postPremiumFinalizeAuditWithRetry } from "./premiumFinalizeAuditApi";
import type { PremiumFinalizeAudit } from "./premiumFinalizeAuditTypes";
import { postPremiumReviewRouteWithRetry } from "./premiumReviewRouteApi";
import type { PremiumReviewRoute } from "./premiumReviewRouteTypes";
import {
  isSourceComparisonReviewMode,
  logSourceCompareSuppressed,
  type AgreementReviewMode,
} from "./agreementReviewMode";

const postAcceptLog = { logPostAcceptFailure: true } as const;

export type PremiumAdvisoryPostAcceptResult = {
  premiumReview: PremiumAgreementReview | null;
  premiumFinalizeAudit: PremiumFinalizeAudit | null;
  premiumReviewRoute: PremiumReviewRoute | null;
};

export async function fetchPremiumAdvisoryEnrichmentAfterAccept(args: {
  draft: ParsedDraftShape;
  /** Same SoT the pipeline used for the full draft (e.g. merged premium intake). */
  rawIntakeForSot: string;
  userGapAnswers: string | null | undefined;
  winningBodyText: string;
  reviewMode?: AgreementReviewMode;
}): Promise<PremiumAdvisoryPostAcceptResult> {
  if (args.reviewMode && isSourceComparisonReviewMode(args.reviewMode)) {
    logSourceCompareSuppressed();
    return { premiumReview: null, premiumFinalizeAudit: null, premiumReviewRoute: null };
  }
  const doc = (args.winningBodyText || "").trim();
  const soT = (args.rawIntakeForSot || "").trim();
  if (doc.length < 80 || soT.length < 1) {
    return { premiumReview: null, premiumFinalizeAudit: null, premiumReviewRoute: null };
  }

  let premiumReview: PremiumAgreementReview | null = null;
  let premiumFinalizeAudit: PremiumFinalizeAudit | null = null;
  let premiumReviewRoute: PremiumReviewRoute | null = null;

  try {
    if (doc.length >= 400) {
      premiumReview = await postPremiumAgreementReviewWithRetry(
        {
          intakeText: soT,
          documentText: doc,
          context: buildContextForReview(args.draft),
        },
        postAcceptLog,
      );
    }

    premiumFinalizeAudit = await postPremiumFinalizeAuditWithRetry(
      {
        intake_text: soT,
        document_text: doc,
        context: buildPremiumFinalizeAuditContext(args.draft, {
          userGapAnswers: args.userGapAnswers,
          premiumReview,
        }),
      },
      postAcceptLog,
    );

    premiumReviewRoute = await postPremiumReviewRouteWithRetry(
      {
        intake_text: soT,
        finalize_answers: (args.userGapAnswers || "").trim(),
        agreement_text: doc,
        party_count: Math.max(1, (args.draft.parties || []).length || 2),
        agreement_family: String(args.draft.agreement_family || "").trim(),
      },
      postAcceptLog,
    );
  } catch (e) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[premium-post-accept-advisory-failed]", {
        endpoint: "advisory_enrichment",
        status: "unexpected_throw",
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { premiumReview, premiumFinalizeAudit, premiumReviewRoute };
}
