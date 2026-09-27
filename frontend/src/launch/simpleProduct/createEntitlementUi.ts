/**
 * Create-page entitlement UI decisions — server commercial state is the sole authority.
 * Keeps authenticated users from seeing the editor before access is resolved.
 */

import { formatPeriodEndsLabel } from "../../access/commercialEntitlement";
import type { WorkspaceCreateAccessVerdict } from "../../access/authenticatedWorkspaceAccessPolicy";

/**
 * TOKEN_REFRESHED / entitlement re-probe used to flip commercialEntitlementReady
 * false, unmount AgreementBuilderIntake, and dual-fire home-create-submit while
 * premium-full-draft was in OPTIONS. Keep the editor mounted for a live homepage
 * dump, an already-entitled Pro workspace, an already-painted editor, or an
 * in-flight entitled rewrite.
 *
 * Not a dump-intent latch: first generate is never skipped.
 */
export function shouldKeepCreateEditorMountedAcrossAuthRefresh(args: {
  homeHeroAutoGenerate: boolean;
  editorHasBeenShown: boolean;
  entitledRewriteInFlight: boolean;
  /** Sync workspace / subscription cache already says paid Pro — start mounted. */
  alreadyEntitledPro?: boolean;
}): boolean {
  return Boolean(
    args.alreadyEntitledPro ||
      args.homeHeroAutoGenerate ||
      args.editorHasBeenShown ||
      args.entitledRewriteInFlight,
  );
}

/**
 * `{!hideAgreementEditor ? <ABI key={intakeKey}>}` remounts on any hide flip.
 * Already-entitled Pro / live dump / painted editor must stay mounted so
 * entitlement ticks overlay chrome instead of unmounting mid-pfd.
 */
export function shouldHideAgreementEditor(args: {
  editorGatedUntilEntitlement: boolean;
  showAccessChoiceScreen: boolean;
  entitlementProbeBlocked: boolean;
  awaitingAuthWorkspace: boolean;
  keepEditorMounted: boolean;
}): boolean {
  if (args.keepEditorMounted) return false;
  return (
    args.editorGatedUntilEntitlement ||
    args.showAccessChoiceScreen ||
    args.entitlementProbeBlocked ||
    args.awaitingAuthWorkspace
  );
}

/**
 * React key for AgreementBuilderIntake. Entitlement / handoff / commercial-ready
 * ticks must not change this once a homepage or entitled dump has mounted.
 * Template / paste-only are user-initiated remounts (not entitlement ticks).
 */
export function resolveStableCreateIntakeMountKey(args: {
  usingTemplate: boolean;
  pasteOnly: boolean;
  heroHandoff: { text: string; voiceFinalize?: boolean } | null | undefined;
  alreadyEntitledPro?: boolean;
  homeHeroAutoGenerate?: boolean;
}): string {
  if (args.usingTemplate) return "tmpl";
  if (args.pasteOnly) return "paste";
  if (args.alreadyEntitledPro || args.homeHeroAutoGenerate || args.heroHandoff) {
    return "create-intake-stable";
  }
  return "free";
}

/** Entitlement-ready / handoff overlay must not change the ABI React key. */
export function shouldChangeCreateIntakeMountKeyOnEntitlementTick(args: {
  previousKey: string;
  nextKey: string;
  keepEditorMounted: boolean;
}): boolean {
  if (args.keepEditorMounted) return false;
  return args.previousKey !== args.nextKey;
}

/** Token/org change must not hide a live dump editor (no remount, no second submit). */
export function shouldResetCommercialEntitlementReadyOnAuthRefresh(args: {
  keepEditorMounted: boolean;
}): boolean {
  return !args.keepEditorMounted;
}

/** Do not replace the create page with the auth-workspace settling shell mid-dump. */
export function shouldReplaceCreatePageWithAuthWorkspaceSettling(args: {
  awaitingAuthWorkspace: boolean;
  keepEditorMounted: boolean;
}): boolean {
  return args.awaitingAuthWorkspace && !args.keepEditorMounted;
}

export function shouldGateCreateEditorUntilEntitlementReady(args: {
  isAuthenticated: boolean;
  commercialEntitlementReady: boolean;
  isResumingOwnedAgreement: boolean;
  hasCheckoutPendingMarker: boolean;
  /** Live homepage dump / painted editor / in-flight rewrite / already-paid Pro — do not unmount. */
  keepEditorMounted?: boolean;
}): boolean {
  if (args.keepEditorMounted) return false;
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
