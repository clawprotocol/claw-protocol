import type { PremiumCompletionSnapshot } from "./premiumCompletionStorage";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";

export type PremiumAuthoritativeVisibleSurfaceLog = {
  bodyLen: number;
  pipelineSource: string;
  /** 30s soft progress (extended modal copy) was showing — not a hard failopen. */
  extendedWaitWasActive?: boolean;
  /** Hard modal failopen (e.g. 120s ceiling) had already fired — late success overrides. */
  hardFailopenWasActive?: boolean;
  /** @deprecated use extendedWaitWasActive / hardFailopenWasActive */
  softTimeoutHadFired?: boolean;
  /** Values captured where possible (may be stale if not synced). */
  previousPostCheckoutPhase?: string | null;
  previousRecoveryFlags?: {
    proFullDraftQualityRetry?: boolean;
    proUpgradeUseStarterView?: boolean;
    hardErrorPresent?: boolean;
  };
  createUiStage?: string;
  displayPhase?: string;
};

/**
 * DEV lines:
 * [premium-authoritative-visible-surface] before | after
 * [premium-failopen-overridden-by-success]
 */
export function logPremiumAuthoritativeVisibleSurface(
  phase: "before" | "after",
  payload: PremiumAuthoritativeVisibleSurfaceLog,
): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info(`[premium-authoritative-visible-surface] ${phase}`, {
    t: new Date().toISOString(),
    ...payload,
  });
}

export function logPremiumFailopenOverriddenBySuccess(payload: {
  bodyLen: number;
  pipelineSource: string;
}): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[premium-failopen-overridden-by-success]", {
    t: new Date().toISOString(),
    ...payload,
  });
}

export function logPremiumDuplicateRunBlocked(payload: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[premium-duplicate-run-blocked]", { t: new Date().toISOString(), ...payload });
}

/** In-flight premium ensure for the same intake fingerprint (blocks parallel effect double-starts). */
let premiumEnsureIntakeMutex: string | null = null;

export function tryBeginPremiumEnsureForIntake(intakeFingerprint: string): boolean {
  if (premiumEnsureIntakeMutex === intakeFingerprint) return false;
  premiumEnsureIntakeMutex = intakeFingerprint;
  return true;
}

export function endPremiumEnsureForIntake(intakeFingerprint: string): void {
  if (premiumEnsureIntakeMutex === intakeFingerprint) premiumEnsureIntakeMutex = null;
}

/** Vitest only — clears mutex between tests. */
export function resetPremiumEnsureMutexForTests(): void {
  premiumEnsureIntakeMutex = null;
}

export function shouldSkipPremiumEnsureBecauseSnapshotAlreadyAuthoritative(args: {
  intakeFingerprint: string;
  snapshot: PremiumCompletionSnapshot | null;
}): boolean {
  const s = args.snapshot;
  if (!s?.premiumAccepted) return false;
  const body = (s.premiumWinningBodyText || s.premiumReadonlyPlainText || "").trim();
  if (body.length < 500) return false;
  if (s.intakeTextFingerprint && s.intakeTextFingerprint !== args.intakeFingerprint) return false;
  if (!isAuthoritativePremiumPipelineRenderSource(s.premiumPipelineRenderSource)) return false;
  return true;
}
