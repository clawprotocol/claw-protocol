import type { AccessTier } from "../access/types";
import type { AgreementDraft } from "./agreementTypes";
import { isPaidProAgreementAuthoritative } from "../components/agreements/paidProAgreementAuthority";
import { hasCurrentSessionProEntitlement } from "../components/agreements/paidProSessionEligibility";
import type { PremiumSendIntent } from "../launch/simpleProduct/premiumSendIntent";
import { buildSimpleSendHandoff, type SimpleSendHandoff } from "../launch/simpleProduct/simpleSendHandoff";

export type WorkspaceCreatePostGenerationHandoffInput = {
  agreementId: string;
  primedDraft: AgreementDraft;
  tier: AccessTier;
  handoff?: {
    premiumSendIntent?: PremiumSendIntent | null;
    openFlowPhase?: "review" | "send";
  };
};

/** Paid / Pro users get the same streamlined review-first chrome as first-time Pro create. */
export function shouldUseStreamlinedWorkspaceCreateReview(input: {
  tier: AccessTier;
  agreementId: string;
  primedDraft: AgreementDraft;
}): boolean {
  return (
    input.tier !== "free" ||
    isPaidProAgreementAuthoritative({ draft: input.primedDraft, agreementId: input.agreementId }) ||
    hasCurrentSessionProEntitlement()
  );
}

export function buildWorkspaceCreateSimpleSendHandoff(
  input: WorkspaceCreatePostGenerationHandoffInput,
): SimpleSendHandoff {
  const agreementId = String(input.agreementId || "").trim();
  const streamlinedSimpleFlow = shouldUseStreamlinedWorkspaceCreateReview({
    tier: input.tier,
    agreementId,
    primedDraft: input.primedDraft,
  });
  return buildSimpleSendHandoff({
    agreementId,
    primedDraft: input.primedDraft,
    streamlinedSimpleFlow,
    premiumSendIntent: input.handoff?.premiumSendIntent ?? null,
    ...(input.handoff?.openFlowPhase === "send" || input.handoff?.openFlowPhase === "review"
      ? { openFlowPhase: input.handoff.openFlowPhase }
      : {}),
  });
}

export function workspaceCreatePostSendPath(agreementId: string): string {
  return `/app/send/${encodeURIComponent(String(agreementId || "").trim())}`;
}
