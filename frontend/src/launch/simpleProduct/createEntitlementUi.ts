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

/** @deprecated Genesis buyer allowance retired — never render status copy. */
export function formatGenesisAllowanceStatusCopy(_args: {
  agreementsRemaining: number | null | undefined;
  agreementAllowance: number | null | undefined;
  periodEndsAt: string | null | undefined;
}): string | null {
  return null;
}

export function formatProAllowanceStatusCopy(args: {
  agreementsRemaining: number | null | undefined;
  agreementAllowance: number | null | undefined;
  periodEndsAt: string | null | undefined;
}): string | null {
  if (typeof args.agreementsRemaining !== "number" || typeof args.agreementAllowance !== "number") {
    return null;
  }
  return `Pro access: ${args.agreementsRemaining} of ${args.agreementAllowance} successfully finalized premium agreements remaining this month. Resets ${formatPeriodEndsLabel(args.periodEndsAt)}.`;
}

export const CREATE_ACCESS_CHOICE_HEADING = "Continue with LawDog";

export const CREATE_ACCESS_CHOICE_BODY =
  "LawDog Pro ($49/month) unlocks saved agreement workflows — premium drafting, invite review, prepare signatures, and keep a proof record. Guest drafts are temporary samples only. Genesis is an affiliate program, not a buyer plan.";
