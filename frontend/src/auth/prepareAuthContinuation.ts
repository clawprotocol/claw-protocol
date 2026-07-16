/**
 * Prepare server-backed auth continuation before OAuth / magic link.
 */

import { captureContinuationFromLocation } from "./authContinuationContext";
import { createServerAuthContinuation } from "./authContinuationApi";
import { ensureAnonymousSession } from "./anonymousSessionApi";

export async function prepareAuthContinuation(args?: {
  agreementId?: string;
  workflowStage?: string;
  destinationPath?: string;
  authPurpose?: string;
  provider?: string;
  returningSignIn?: boolean;
}): Promise<string> {
  // Capture returns the effective continuation — which, for a claim, is the one
  // persisted on the agreement surface (preserved even across an intermediate
  // generic sign-in surface). Consume it instead of re-deriving from window.location
  // so email and Google both retain the original agreement + return destination.
  const effective = captureContinuationFromLocation({
    agreementId: args?.agreementId,
    workflowStage: (args?.workflowStage as never) ?? "unknown",
    destinationPath: args?.destinationPath,
  });
  if (!args?.returningSignIn) {
    await ensureAnonymousSession();
  }
  // Returning sign-in is an explicit generic flow and must never adopt a claim.
  const adoptClaim = !args?.returningSignIn;
  const path =
    args?.destinationPath ??
    (adoptClaim ? effective.destinationPath : undefined) ??
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/app/create");
  const cont = await createServerAuthContinuation({
    agreementId: args?.agreementId ?? (adoptClaim ? effective.agreementId : undefined),
    destinationPath: path,
    workflowStage: (args?.workflowStage as never) ?? effective.workflowStage ?? "unknown",
    authPurpose: args?.returningSignIn ? "returning_sign_in" : args?.authPurpose ?? "claim",
    provider: args?.provider,
    returningSignIn: args?.returningSignIn,
  });
  return cont.continuation_id;
}
