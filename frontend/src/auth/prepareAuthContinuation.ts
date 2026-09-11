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
  captureContinuationFromLocation({
    agreementId: args?.agreementId,
    workflowStage: (args?.workflowStage as never) ?? "unknown",
    destinationPath: args?.destinationPath,
  });
  if (!args?.returningSignIn && args?.authPurpose !== "quick_pdf_return") {
    await ensureAnonymousSession();
  }
  const path =
    args?.destinationPath ??
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/app/create");
  const cont = await createServerAuthContinuation({
    agreementId: args?.agreementId,
    destinationPath: path,
    workflowStage: (args?.workflowStage as never) ?? "unknown",
    authPurpose: args?.authPurpose ?? (args?.returningSignIn ? "returning_sign_in" : "claim"),
    provider: args?.provider,
    returningSignIn: args?.returningSignIn || args?.authPurpose === "quick_pdf_return",
  });
  return cont.continuation_id;
}
