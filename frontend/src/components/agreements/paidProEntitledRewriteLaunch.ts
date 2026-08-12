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

export const ENTITLED_REWRITE_FAILURE_CUSTOMER_COPY =
  "LawDog could not finish this request. Your notes and last saved agreement are unchanged. Retry when you are ready.";

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
  /** Return to intake — never leave generating_draft armed, and never paint empty review as success. */
  displayPhase: "intake";
  createUiStage: typeof CreateUiStage.INPUT;
  clearPipelineRefs: true;
  clearLocalDraft: true;
  terminalReason: PaidProGenerationTerminalReason;
  terminalOutcome: PaidProGenerationTerminalOutcome;
};

export function planEntitledRewriteGenerationFailureTerminal(args: {
  reason: PaidProGenerationTerminalReason;
  /** @deprecated Ignored — dashboard and non-dashboard share the same recovery phases. */
  dashboardRoute?: boolean;
  customMessage?: string | null;
}): EntitledRewriteGenerationFailureTerminalPlan {
  const retryCopy = args.customMessage?.trim() || ENTITLED_REWRITE_FAILURE_CUSTOMER_COPY;
  return {
    proFullDraftQualityRetry: false,
    premiumPersistedFlowActive: false,
    premiumSendPathUnlocked: false,
    premiumPostCheckoutPhase: null,
    premiumPipelineUserMessage: null,
    hardError: retryCopy,
    proFullDraftCustomGateMessage: retryCopy,
    agreementDocumentPlain: "",
    createFlowPhase: "capturing_input",
    displayPhase: "intake",
    createUiStage: CreateUiStage.INPUT,
    clearPipelineRefs: true,
    clearLocalDraft: true,
    terminalReason: args.reason,
    terminalOutcome: "retry_recoverable",
  };
}

export const ENTITLED_REWRITE_LAUNCH_HELPER = "resolveEntitledRewriteLaunchContext";
export const ENTITLED_REWRITE_DRAFT_SNAPSHOT_HELPER = "syncEntitledRewriteDraftSnapshot";
