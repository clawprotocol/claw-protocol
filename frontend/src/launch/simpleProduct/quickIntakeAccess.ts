/**
 * Quick PDF access is decided from authenticated identity + server entitlement.
 * A stale React paid/free tier is not an input.
 */
import type { CommercialEntitlementDecision } from "../../access/commercialEntitlement";

export type QuickPdfAccessKind =
  | "loading"
  | "signed_out"
  | "auth_failure"
  | "probe_failure"
  | "upgrade_required"
  | "expired"
  | "paid";

export type QuickPdfAccess = {
  kind: QuickPdfAccessKind;
  canUpload: boolean;
};

export function decideQuickPdfAccess(args: {
  authLoading: boolean;
  authResolved: boolean;
  isAuthenticated: boolean;
  entitlement: CommercialEntitlementDecision | null;
  entitlementSettled: boolean;
  staleLoadingTooLong: boolean;
}): QuickPdfAccess {
  if (!args.authResolved && args.authLoading && !args.staleLoadingTooLong) {
    return { kind: "loading", canUpload: false };
  }
  if (!args.isAuthenticated) {
    if (args.authLoading && !args.staleLoadingTooLong) {
      return { kind: "loading", canUpload: false };
    }
    return { kind: "signed_out", canUpload: false };
  }
  if (!args.entitlementSettled && !args.staleLoadingTooLong) {
    return { kind: "loading", canUpload: false };
  }
  const ent = args.entitlement;
  if (!ent) {
    return { kind: args.staleLoadingTooLong ? "probe_failure" : "loading", canUpload: false };
  }
  if (ent.authFailure) return { kind: "auth_failure", canUpload: false };
  if (ent.probeFailure) return { kind: "probe_failure", canUpload: false };
  if (ent.state === "pro" && ent.canCreatePersistedAgreement && ent.entitlement === "paid_pro") {
    if (ent.proAllowance && ent.proAllowance.active && !ent.proAllowance.allowed) {
      return { kind: "expired", canUpload: false };
    }
    return { kind: "paid", canUpload: true };
  }
  if (ent.upgradeRequired || ent.state === "guest" || ent.state === "none" || ent.entitlement === "free") {
    if (ent.proAllowance && ent.proAllowance.active === false && ent.periodEndsAt) {
      return { kind: "expired", canUpload: false };
    }
    return { kind: "upgrade_required", canUpload: false };
  }
  return { kind: "upgrade_required", canUpload: false };
}

export function microphoneCaptureAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function")
  );
}
