import type { GuidedCompletionSession } from "./types";
import { getCurrentVariable } from "./guidedCompletionEngine";
import { validateGuidedPatchPlacement } from "./guidedRevisionAnchors";
import type { GuidedRevisionTarget } from "./guidedRevisionAnchors";
import type { GuidedAppliedChange } from "./guidedChangeTypes";
import { resolveImplementationPreview } from "./guidedImplementationPreview";
import { resolveGuidedQuestionConfig } from "./guidedQuestionConfig";
import {
  applyGuidedPostApplyLightPolish,
  validateGuidedBulkRegenerationLength,
  validateGuidedPostApplyQuality,
  logGuidedPostApplyQuality,
} from "./guidedPostApplyQuality";

export {
  buildConsolidatedGuidedRegenerationPrompt,
  materialRewriteHintForGuidedAnswer,
  applyGuidedPostApplyLightPolish,
  validateGuidedBulkRegenerationLength,
  validateGuidedPostApplyQuality,
  logGuidedPostApplyQuality,
} from "./guidedPostApplyQuality";

export const GUIDED_BULK_FAIL_USER_MESSAGE =
  "We couldn't cleanly apply all answers. Please try again or edit manually.";

const COMBINED_FORBIDDEN_TARGET: GuidedRevisionTarget = {
  questionKey: "bulk",
  sectionNumber: null,
  sectionLabel: "Full agreement",
  instructionSectionLine: "the full agreement",
  headingPatterns: [/^\s*\d+\.\s+/i],
  forbiddenBeforeSection1: [
    /\b(?:uptime|sla|service\s+level)\b/i,
    /\b(?:intellectual\s+property|work\s+product|ownership\s+of\s+deliverables)\b/i,
    /\b(?:total\s+fee|invoic(?:e|ing)|net\s+\d+)\b/i,
    /\bbuild\s+and\b/i,
    /\bmaintain\s+such\s+systems\b/i,
  ],
};

/** Validate full-document output after bulk guided regeneration (length + quality when session provided). */
export function validateGuidedBulkRegeneration(
  beforeText: string,
  afterText: string,
  session?: GuidedCompletionSession | null,
) {
  const polished = applyGuidedPostApplyLightPolish(beforeText, afterText);
  const length = validateGuidedBulkRegenerationLength(beforeText, polished);
  if (!length.ok) return length;
  if (session) {
    const quality = validateGuidedPostApplyQuality(beforeText, polished, session);
    logGuidedPostApplyQuality(quality);
    return { ok: quality.ok, reasons: quality.reasons };
  }
  return length;
}

/** @deprecated Surgical placement rules — use only for per-answer patch refine, not bulk regen. */
export function validateGuidedBulkRegenerationStrictPlacement(beforeText: string, afterText: string) {
  return validateGuidedPatchPlacement(beforeText, afterText, COMBINED_FORBIDDEN_TARGET);
}

export function buildAppliedChangesFromSession(session: GuidedCompletionSession): GuidedAppliedChange[] {
  const out: GuidedAppliedChange[] = [];
  for (const id of session.queue) {
    const answer = (session.answered[id] || "").trim();
    if (!answer) continue;
    const meta = session.answeredMeta?.[id];
    const cfg = resolveGuidedQuestionConfig(id);
    const sectionLabel = meta?.targetSectionLabel ?? cfg.targetSectionLabel;
    out.push({
      questionKey: id,
      answerLabel: answer,
      recommendationReason: meta?.recommendationReason ?? null,
      targetSectionLabel: sectionLabel,
      summary: meta?.implementationPreview ?? resolveImplementationPreview(id, answer),
      anchorFound: true,
      changedSnippet: "",
      timestamp: session.answeredAt?.[id] ?? Date.now(),
    });
  }
  return out;
}

export function logGuidedAllAnswersReady(session: GuidedCompletionSession): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[guided-all-answers-ready]", {
    answered: Object.keys(session.answered).length,
    total: session.frozenTotalQuestions ?? session.queue.length,
  });
}

export function logGuidedBulkRegenerationStart(): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[guided-bulk-regeneration-start]");
}

export function logGuidedBulkRegenerationSuccess(len: number): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[guided-bulk-regeneration-success]", { len });
}

export function logGuidedBulkRegenerationFailed(reasons: string[]): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[guided-bulk-regeneration-failed]", { reasons });
}

export function sessionReadyForBulkApply(session: GuidedCompletionSession): boolean {
  return getCurrentVariable(session) === null && Object.keys(session.answered).length > 0;
}
