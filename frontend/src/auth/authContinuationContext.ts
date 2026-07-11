/**
 * Canonical post-auth / post-checkout continuation (no agreement body in URLs).
 */

import type { PremiumSendIntent } from "../launch/simpleProduct/premiumSendIntent";

export type AuthWorkflowStage =
  | "starter"
  | "pro_review"
  | "pro_edit"
  | "upgrade"
  | "checkout_return"
  | "signer_setup"
  | "signature_prep"
  | "dashboard"
  | "claim"
  | "settings"
  | "unknown";

export type AuthContinuationContextV1 = {
  v: 1;
  agreementId?: string;
  sourcePath: string;
  destinationPath: string;
  workflowStage: AuthWorkflowStage;
  sendIntent?: PremiumSendIntent;
  checkoutReturn?: boolean;
  createdAtMs: number;
};

const STORAGE_KEY = "claw_auth_continuation_v1";

export function createAuthContinuationContext(
  partial: Omit<AuthContinuationContextV1, "v" | "createdAtMs"> & { createdAtMs?: number },
): AuthContinuationContextV1 {
  return {
    v: 1,
    createdAtMs: partial.createdAtMs ?? Date.now(),
    agreementId: partial.agreementId?.trim() || undefined,
    sourcePath: partial.sourcePath,
    destinationPath: partial.destinationPath,
    workflowStage: partial.workflowStage,
    sendIntent: partial.sendIntent,
    checkoutReturn: partial.checkoutReturn,
  };
}

export function writeAuthContinuationContext(ctx: AuthContinuationContextV1): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore quota */
  }
}

export function readAuthContinuationContext(): AuthContinuationContextV1 | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthContinuationContextV1;
    if (parsed?.v !== 1) return null;
    if (!parsed.sourcePath || !parsed.destinationPath) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAuthContinuationContext(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function captureContinuationFromLocation(args?: {
  agreementId?: string | null;
  workflowStage?: AuthWorkflowStage;
  destinationPath?: string;
}): AuthContinuationContextV1 {
  const path =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : "/app/create";
  const ctx = createAuthContinuationContext({
    agreementId: args?.agreementId ?? undefined,
    sourcePath: path,
    destinationPath: args?.destinationPath ?? path,
    workflowStage: args?.workflowStage ?? "unknown",
  });
  writeAuthContinuationContext(ctx);
  return ctx;
}
