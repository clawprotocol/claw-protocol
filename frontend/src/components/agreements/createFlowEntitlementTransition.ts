/**
 * Create-flow entitlement transition during homepage dump generate.
 *
 * Live #239 (both FAILs): home-create-submit×2 → create-flow-entitlement-transition
 * → guided-state-transition → entitled_rewrite_start → duplicate_payload_rejected×2
 * → [CLAW] premium request start → OPTIONS-only (no POST, no Review corpus).
 *
 * Homepage always latches free_starter. Parse then awaited
 * fetchWorkspaceProEntitlement() and ensurePaidCreateEntitlementResolvedForSubmit
 * (a second await). Those yields let TOKEN_REFRESHED / commercial entitlement
 * re-probe remount create, dual-fire home-create-submit, and abort the first
 * pfd after OPTIONS.
 *
 * Invariant: once a homepage dump generate is underway, entitlement resolution
 * is synchronous overlay only. Late network results may flip the paid_pro shell;
 * they must not remount, re-submit, or abort in-flight pfd.
 *
 * Not a dump-intent latch (#233 shouldSkip / #238 shouldJoin). First generate
 * always starts.
 */

import type { AccessTier } from "../../access/types";
import { readCachedWorkspaceProEntitlement } from "../../agreement/agreementProFunnelGate";
import { tierAllowsAdvancedFullDraftReveal } from "./agreementAdvancedDraftAccess";
import { resolveProvisionalWorkspaceProEntitledForCreate } from "./paidCreateFlowEntitlementProbe";
import { resolveCreateFlowWorkspaceProEntitled } from "./paidCreateFlowWorkspaceEntitlementProbe";
import { isEntitledPremiumRewriteProcessInFlight } from "./paidProPremiumGenerationCallAudit";

export function resolveCreateFlowEntitlementSyncForSubmit(input: {
  workspaceProEntitledState?: boolean;
  tier?: AccessTier | null;
}): boolean {
  if (input.workspaceProEntitledState) return true;
  if (input.tier && tierAllowsAdvancedFullDraftReveal(input.tier)) return true;
  if (resolveCreateFlowWorkspaceProEntitled()) return true;
  if (resolveProvisionalWorkspaceProEntitledForCreate()) return true;
  return readCachedWorkspaceProEntitlement();
}

/** Home dump / in-flight generate must not await a network entitlement probe. */
export function shouldAwaitNetworkEntitlementOnCreateSubmit(args: {
  fromHomeHandoff: boolean;
  generateInFlight?: boolean;
}): boolean {
  if (args.fromHomeHandoff) return false;
  if (args.generateInFlight ?? isEntitledPremiumRewriteProcessInFlight()) return false;
  return true;
}

/**
 * Entitlement flip (free_starter → paid_pro) must not start a second rewrite
 * when parse already committed generate or #231 owns the flight.
 */
export function shouldStartRewriteFromEntitlementTransition(args: {
  generateInFlight?: boolean;
  paidGenerateAlreadyCommitted: boolean;
}): boolean {
  if (args.generateInFlight ?? isEntitledPremiumRewriteProcessInFlight()) return false;
  if (args.paidGenerateAlreadyCommitted) return false;
  return true;
}

/**
 * Already-paid Pro homepage / create dump: start the paid_pro shell from sync
 * cache. Do not enter a remount window that dual-fires home-create-submit.
 */
export function shouldStartCreateFromPaidProShell(args: {
  workspaceAlreadyEntitled: boolean;
}): boolean {
  return Boolean(args.workspaceAlreadyEntitled);
}

/**
 * Entitlement / handoff overlay may update chrome. It must not remount ABI
 * (hide flip or React key change) while a homepage dump or first pfd is live.
 */
export function shouldRemountAgreementBuilderIntakeOnEntitlementTick(args: {
  keepEditorMounted: boolean;
  hideAgreementEditor: boolean;
  previousIntakeKey: string;
  nextIntakeKey: string;
}): boolean {
  if (args.keepEditorMounted) return false;
  // `{!hideAgreementEditor ? <ABI key=…>}` — hide=true unmounts ABI (AbortSignal).
  if (args.hideAgreementEditor) return true;
  return args.previousIntakeKey !== args.nextIntakeKey;
}
