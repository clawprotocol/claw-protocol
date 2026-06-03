/**
 * Paid Pro console log policy — diagnostics only; no corpus or UX changes.
 */

import { paidProPerfTraceEnabled, paidProVerboseQaLogsEnabled } from "./paidProPerfLogging";

export function paidProQaDiagnosticConsoleEnabled(): boolean {
  return paidProVerboseQaLogsEnabled() || paidProPerfTraceEnabled();
}

export function shouldLogPaidProPolishDiagnostic(payload: {
  applied?: boolean;
  replacedCount?: number;
  repairs?: readonly unknown[];
  effectiveDateAdded?: boolean;
  disputeWindowAdded?: boolean;
  uptimeTargetAdded?: boolean;
  survivalPolished?: boolean;
  attorneysFeesAdded?: boolean;
  operationalReplaced?: number;
  repetitionDiversified?: number;
  sectionPurityRelocated?: number;
  milestoneInserted?: boolean;
  hedgesReduced?: number;
}): boolean {
  if (paidProQaDiagnosticConsoleEnabled()) return true;
  if ((payload.repairs?.length ?? 0) > 0) return true;
  if (payload.applied) return true;
  if ((payload.replacedCount ?? 0) > 0) return true;
  if (
    payload.effectiveDateAdded ||
    payload.disputeWindowAdded ||
    payload.uptimeTargetAdded ||
    payload.survivalPolished ||
    payload.attorneysFeesAdded
  ) {
    return true;
  }
  if ((payload.operationalReplaced ?? 0) > 0) return true;
  if ((payload.repetitionDiversified ?? 0) > 0) return true;
  if ((payload.sectionPurityRelocated ?? 0) > 0) return true;
  if (payload.milestoneInserted) return true;
  if ((payload.hedgesReduced ?? 0) > 0) return true;
  return false;
}

export function shouldLogPlaceholderScanResult(payload: {
  fatalCount: number;
  repairedCount: number;
  ok: boolean;
}): boolean {
  if (paidProQaDiagnosticConsoleEnabled()) return true;
  return payload.fatalCount > 0 || payload.repairedCount > 0 || !payload.ok;
}

export function shouldLogPremiumStructureRepair(repairs: readonly unknown[]): boolean {
  if ((repairs?.length ?? 0) === 0) return false;
  return true;
}

export function shouldLogPremiumModalDiagnostic(): boolean {
  return paidProVerboseQaLogsEnabled();
}

export function shouldLogFullPreviewSourceDiagnostic(length: number): boolean {
  if (!paidProVerboseQaLogsEnabled()) return false;
  return length > 0;
}

export function shouldLogPremiumAdvisorySkipDiagnostic(): boolean {
  return paidProQaDiagnosticConsoleEnabled();
}
