/**
 * Create-page entitlement UI decisions — server commercial state is the sole authority.
 * Keeps authenticated users from seeing the editor before access is resolved.
 */

import { formatPeriodEndsLabel } from "../../access/commercialEntitlement";
import type { WorkspaceCreateAccessVerdict } from "../../access/authenticatedWorkspaceAccessPolicy";

export function shouldGateCreateEditorUntilEntitlementReady(args: {
  isAuthenticated: boolean;
  commercialEntitlementReady: boolean;
  isResumingOwnedAgreement: boolean;
  hasCheckoutPendingMarker: boolean;
}): boolean {
  if (!args.isAuthenticated) return false;
  if (args.isResumingOwnedAgreement || args.hasCheckoutPendingMarker) return false;
  return !args.commercialEntitlementReady;
}

export function shouldShowCreateAccessChoiceScreen(
  verdict: Pick<WorkspaceCreateAccessVerdict, "allowed" | "showAccessChoiceScreen">,
): boolean {
  return !verdict.allowed && Boolean(verdict.showAccessChoiceScreen);
}

/** Guest may use the editor before conversion; paywall only after the draft is ready / exhausted. */
export function guestMayCreateWithoutPaywall(args: {
  commercialEntitlementReady: boolean;
  state: string | null | undefined;
  canSaveGuestDraft: boolean;
}): boolean {
  if (!args.commercialEntitlementReady) return true;
  if (args.state !== "guest") return false;
  return args.canSaveGuestDraft;
}

export function formatGenesisAllowanceStatusCopy(args: {
  agreementsRemaining: number | null | undefined;
  agreementAllowance: number | null | undefined;
  periodEndsAt: string | null | undefined;
}): string | null {
  if (typeof args.agreementsRemaining !== "number" || typeof args.agreementAllowance !== "number") {
    return null;
  }
  return `Genesis Dog access: ${args.agreementsRemaining} of ${args.agreementAllowance} new agreements remaining this month. Resets ${formatPeriodEndsLabel(args.periodEndsAt)}.`;
}

export function formatProAllowanceStatusCopy(args: {
  agreementsRemaining: number | null | undefined;
  agreementAllowance: number | null | undefined;
  periodEndsAt: string | null | undefined;
}): string | null {
  if (typeof args.agreementsRemaining !== "number" || typeof args.agreementAllowance !== "number") {
    return null;
  }
  return `Pro access: ${args.agreementsRemaining} of ${args.agreementAllowance} new agreements remaining this billing period. Renews ${formatPeriodEndsLabel(args.periodEndsAt)}.`;
}

export const CREATE_ACCESS_CHOICE_HEADING = "Continue with LawDog";

export const CREATE_ACCESS_CHOICE_BODY =
  "Genesis Dog access is administrator-granted and lets you save a limited number of agreements each month. Pro enables saved agreement workflows — invite review, prepare signatures, and keep a proof record.";
