/**
 * Dashboard / returning paid create — entitled rewrite launch and generation failure terminals.
 * Ensures local basic parse never hands a thin starter corpus to POST /premium-full-draft validation.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "./simpleProFinalReviewCorpus";
import type { PremiumCompletionResult } from "./premiumCompletionPipeline";
import {
  authoritativePremiumPipelineResultForUiApply,
  hasUsablePremiumBodyText,
} from "./premiumPostCheckoutApplyEligible";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import type {
  PaidProGenerationTerminalOutcome,
  PaidProGenerationTerminalReason,
} from "./paidProGenerationTerminalState";
import { CreateUiStage } from "./createUiStage";
import type { CreateFlowProductionPhase } from "./createFlowTypes";

const LOCAL_PARSE_PREMIUM_CORPUS_FIELDS = [
  "server_full_document_text",
  "premium_full_document_text",
  "premium_server_full_document_text",
  "premium_server_repair_document_text",
] as const;

function readDraftPremiumFieldLen(draft: ParsedDraftShape, key: string): number {
  return String((draft as Record<string, unknown>)[key] ?? "").trim().length;
}

/** Remove thin starter/local-parse premium corpus fields before entitled rewrite POST. */
export function stripLocalParsePremiumCorpusFromDraft(draft: ParsedDraftShape): ParsedDraftShape {
  let changed = false;
  const next = { ...draft } as Record<string, unknown>;
  for (const key of LOCAL_PARSE_PREMIUM_CORPUS_FIELDS) {
    const len = readDraftPremiumFieldLen(draft, key);
    if (len > 0 && len < PAID_PRO_AUTHORITY_MIN_LEN) {
      delete next[key];
      changed = true;
    }
  }
  return changed ? (next as ParsedDraftShape) : draft;
}

export function syncEntitledRewriteDraftSnapshot(
  draftSnapshotRef: { current: ParsedDraftShape | null },
  parsed: ParsedDraftShape,
): ParsedDraftShape {
  const cleaned = stripLocalParsePremiumCorpusFromDraft(parsed);
  draftSnapshotRef.current = cleaned;
  return cleaned;
}

export type EntitledRewriteLaunchContext =
  | { ok: true; gateDraft: ParsedDraftShape; rawIntake: string }
  | { ok: false; reason: "missing_gate_draft" | "missing_raw_intake" };

export function resolveEntitledRewriteLaunchContext(args: {
  gateDraftOverride?: ParsedDraftShape | null;
  draftSnapshot?: ParsedDraftShape | null;
  draftState?: ParsedDraftShape | null;
  resumeDraft?: ParsedDraftShape | null;
  rawIntakeOverride?: string | null;
  resolveRawIntake: (draft: ParsedDraftShape | null) => string;
}): EntitledRewriteLaunchContext {
  const gateDraft =
    args.gateDraftOverride ??
    args.draftSnapshot ??
    args.draftState ??
    args.resumeDraft ??
    null;
  if (!gateDraft) return { ok: false, reason: "missing_gate_draft" };
  const rawIntake = (args.rawIntakeOverride ?? args.resolveRawIntake(gateDraft)).trim();
  if (!rawIntake) return { ok: false, reason: "missing_raw_intake" };
  return {
    ok: true,
    gateDraft: stripLocalParsePremiumCorpusFromDraft(gateDraft),
    rawIntake,
  };
}

/** Entitled rewrite requires a completed premium corpus — not a thin local recovery body. */
export function shouldTreatEntitledRewritePipelineResultAsGenerationFailure(
  result: PremiumCompletionResult | null | undefined,
): boolean {
  if (!result) return true;
  if (!authoritativePremiumPipelineResultForUiApply(result)) return true;
  const winning = (result.winningPremiumBodyText || "").trim();
  if (!hasUsablePremiumBodyText(winning)) return true;
  if (winning.length < GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN) return true;
  if (!isAuthoritativePremiumPipelineRenderSource(result.premiumRenderSource)) return true;
  return false;
}

export const FAILED_CREATE_RECOVERY_TITLE = "LawDog couldn't create the agreement.";
export const FAILED_CREATE_RECOVERY_UNCHANGED = "Your information is unchanged.";
export const FAILED_CREATE_RECOVERY_PRIOR_UNCHANGED = "Your last saved agreement is unchanged.";

/** @deprecated Use FAILED_CREATE_RECOVERY_TITLE + FAILED_CREATE_RECOVERY_UNCHANGED. */
export const ENTITLED_REWRITE_FAILURE_CUSTOMER_COPY = `${FAILED_CREATE_RECOVERY_TITLE} ${FAILED_CREATE_RECOVERY_UNCHANGED}`;

export type FailedCreateRecoveryLatch = {
  notes: string;
  partyNames: string[];
  reason: string;
  at: number;
};

let failedCreateRecoveryLatch: FailedCreateRecoveryLatch | null = null;

export function latchFailedCreateRecovery(args: {
  notes?: string | null;
  partyNames?: readonly string[] | null;
  reason?: string | null;
}): FailedCreateRecoveryLatch {
  failedCreateRecoveryLatch = {
    notes: (args.notes || "").trim(),
    partyNames: (args.partyNames ?? []).map((n) => n.trim()).filter(Boolean),
    reason: (args.reason || "").trim(),
    at: Date.now(),
  };
  return failedCreateRecoveryLatch;
}

export function readFailedCreateRecoveryLatch(): FailedCreateRecoveryLatch | null {
  return failedCreateRecoveryLatch;
}

export function hasFailedCreateRecoveryLatch(): boolean {
  return failedCreateRecoveryLatch != null;
}

/** True until the user explicitly retries Create — later effects must not remount empty review. */
export function shouldHoldFailedCreateIntakeRecovery(): boolean {
  return failedCreateRecoveryLatch != null;
}

export function clearFailedCreateRecoveryLatch(): void {
  failedCreateRecoveryLatch = null;
}

const INTERNAL_FAILURE_REASON_RE =
  /stack|trace|exception|typescript|node_modules|paid-pro-sot|mislabeled_server|entitled_rewrite_|no_server_authority|status\s*[45]\d\d/i;

export function extractSafeFailedCreateReason(error: unknown): string | null {
  if (error == null) return null;
  let raw = "";
  if (typeof error === "string") raw = error;
  else if (error instanceof Error) raw = error.message;
  else if (typeof error === "object") {
    const rec = error as Record<string, unknown>;
    const detail = rec.detail;
    if (typeof detail === "string") raw = detail;
    else if (detail && typeof detail === "object") {
      const d = detail as Record<string, unknown>;
      if (typeof d.message === "string") raw = d.message;
    } else if (typeof rec.message === "string") raw = rec.message;
  }
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length < 8 || text.length > 280) return null;
  if (INTERNAL_FAILURE_REASON_RE.test(text)) return null;
  return text;
}

export function buildFailedCreateRecoveryCopy(args: {
  hasAuthoritativeAgreement?: boolean;
  safeReason?: string | null;
  customMessage?: string | null;
}): { title: string; body: string } {
  const custom = (args.customMessage || "").trim();
  if (custom) {
    return { title: FAILED_CREATE_RECOVERY_TITLE, body: custom };
  }
  const unchanged = args.hasAuthoritativeAgreement
    ? FAILED_CREATE_RECOVERY_PRIOR_UNCHANGED
    : FAILED_CREATE_RECOVERY_UNCHANGED;
  const reason = (args.safeReason || "").trim();
  return {
    title: FAILED_CREATE_RECOVERY_TITLE,
    body: reason ? `${unchanged} ${reason}` : unchanged,
  };
}

export type EntitledRewriteGenerationFailureTerminalPlan = {
  proFullDraftQualityRetry: false;
  premiumPersistedFlowActive: false;
  premiumSendPathUnlocked: false;
  premiumPostCheckoutPhase: null;
  premiumPipelineUserMessage: null;
  hardError: string;
  proFullDraftCustomGateMessage: string;
  agreementDocumentPlain: "";
  createFlowPhase: CreateFlowProductionPhase;
  displayPhase: "intake" | "review";
  createUiStage: typeof CreateUiStage.INPUT | typeof CreateUiStage.DRAFT;
  clearPipelineRefs: true;
  clearLocalDraft: boolean;
  holdIntakeRecovery: boolean;
  recoveryTitle: string;
  terminalReason: PaidProGenerationTerminalReason;
  terminalOutcome: PaidProGenerationTerminalOutcome;
};

export function planEntitledRewriteGenerationFailureTerminal(args: {
  reason: PaidProGenerationTerminalReason;
  /** @deprecated Ignored — dashboard and non-dashboard share the same recovery phases. */
  dashboardRoute?: boolean;
  customMessage?: string | null;
  hasAuthoritativeAgreement?: boolean;
  safeReason?: string | null;
  intakeNotes?: string | null;
  partyNames?: readonly string[] | null;
}): EntitledRewriteGenerationFailureTerminalPlan {
  const copy = buildFailedCreateRecoveryCopy({
    hasAuthoritativeAgreement: Boolean(args.hasAuthoritativeAgreement),
    safeReason: args.safeReason,
    customMessage: args.customMessage,
  });
  if (args.hasAuthoritativeAgreement) {
    return {
      proFullDraftQualityRetry: false,
      premiumPersistedFlowActive: false,
      premiumSendPathUnlocked: false,
      premiumPostCheckoutPhase: null,
      premiumPipelineUserMessage: null,
      hardError: copy.body,
      proFullDraftCustomGateMessage: copy.body,
      agreementDocumentPlain: "",
      createFlowPhase: "draft_ready_for_review",
      displayPhase: "review",
      createUiStage: CreateUiStage.DRAFT,
      clearPipelineRefs: true,
      clearLocalDraft: false,
      holdIntakeRecovery: false,
      recoveryTitle: copy.title,
      terminalReason: args.reason,
      terminalOutcome: "retry_recoverable",
    };
  }
  return {
    proFullDraftQualityRetry: false,
    premiumPersistedFlowActive: false,
    premiumSendPathUnlocked: false,
    premiumPostCheckoutPhase: null,
    premiumPipelineUserMessage: null,
    hardError: copy.body,
    proFullDraftCustomGateMessage: copy.body,
    agreementDocumentPlain: "",
    createFlowPhase: "capturing_input",
    displayPhase: "intake",
    createUiStage: CreateUiStage.INPUT,
    clearPipelineRefs: true,
    clearLocalDraft: true,
    holdIntakeRecovery: true,
    recoveryTitle: copy.title,
    terminalReason: args.reason,
    terminalOutcome: "retry_recoverable",
  };
}

/** Plan the failure terminal and latch intake recovery until the user explicitly retries. */
export function commitEntitledRewriteGenerationFailureTerminal(
  args: Parameters<typeof planEntitledRewriteGenerationFailureTerminal>[0],
): EntitledRewriteGenerationFailureTerminalPlan {
  const plan = planEntitledRewriteGenerationFailureTerminal(args);
  if (plan.holdIntakeRecovery) {
    latchFailedCreateRecovery({
      notes: args.intakeNotes,
      partyNames: args.partyNames,
      reason: plan.hardError,
    });
  }
  return plan;
}

export const ENTITLED_REWRITE_LAUNCH_HELPER = "resolveEntitledRewriteLaunchContext";
export const ENTITLED_REWRITE_DRAFT_SNAPSHOT_HELPER = "syncEntitledRewriteDraftSnapshot";
