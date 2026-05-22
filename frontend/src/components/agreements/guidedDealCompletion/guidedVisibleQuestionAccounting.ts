/**
 * Canonical visible-question accounting for guided Pro collection UX.
 * Single source of truth for progress text, question indices, and completion.
 */

import type { GuidedCompletionSession } from "./types";
import { variableHasSelectableAnswerPath } from "./shouldRenderGuidedCompletionPanel";
import { getCurrentVariable } from "./guidedCompletionEngine";
import { resolveGuidedQuestionConfig } from "./guidedQuestionConfig";

export type GuidedVisibleQuestion = {
  id: string;
  visibleIndex: number;
  label: string;
  areaLabel: string;
};

export type GuidedVisibleQuestionAccounting = {
  visibleQuestions: GuidedVisibleQuestion[];
  visibleQuestionCount: number;
  answeredVisibleQuestionCount: number;
  skippedVisibleQuestionCount: number;
  resolvedVisibleQuestionCount: number;
  currentVisibleIndex: number;
  currentVisibleQuestion: GuidedVisibleQuestion | null;
  progressPercent: number;
  isCollectionComplete: boolean;
};

function isVisibleQueueItem(session: GuidedCompletionSession, id: string): boolean {
  const v = session.variables.find((x) => x.id === id);
  if (!v) return false;
  return variableHasSelectableAnswerPath(v) && v.question.trim().length > 8;
}

/** Build ordered list of questions the user actually sees in the panel. */
export function buildVisibleQuestionList(session: GuidedCompletionSession): GuidedVisibleQuestion[] {
  const out: GuidedVisibleQuestion[] = [];
  let idx = 0;
  for (const id of session.queue) {
    if (!isVisibleQueueItem(session, id)) continue;
    idx += 1;
    const v = session.variables.find((x) => x.id === id);
    const cfg = resolveGuidedQuestionConfig(id);
    out.push({
      id,
      visibleIndex: idx,
      label: v?.label ?? cfg.targetSectionLabel,
      areaLabel: cfg.finalAppliedAreaLabel,
    });
  }
  return out;
}

export function computeGuidedVisibleQuestionAccounting(
  session: GuidedCompletionSession,
): GuidedVisibleQuestionAccounting {
  const visibleQuestions = buildVisibleQuestionList(session);
  const visibleQuestionCount = visibleQuestions.length;
  let answeredVisibleQuestionCount = 0;
  let skippedVisibleQuestionCount = 0;
  for (const q of visibleQuestions) {
    if ((session.answered[q.id] || "").trim()) answeredVisibleQuestionCount += 1;
    else if (session.skipped.has(q.id)) skippedVisibleQuestionCount += 1;
  }
  const resolvedVisibleQuestionCount = answeredVisibleQuestionCount + skippedVisibleQuestionCount;
  const currentVar = getCurrentVariable(session);
  const currentVisibleQuestion =
    currentVar && isVisibleQueueItem(session, currentVar.id)
      ? visibleQuestions.find((q) => q.id === currentVar.id) ?? null
      : null;
  const currentVisibleIndex = currentVisibleQuestion?.visibleIndex ?? 0;
  const progressPercent =
    visibleQuestionCount > 0
      ? Math.min(100, Math.round((resolvedVisibleQuestionCount / visibleQuestionCount) * 100))
      : 0;
  const isCollectionComplete =
    visibleQuestionCount > 0 && resolvedVisibleQuestionCount >= visibleQuestionCount;
  return {
    visibleQuestions,
    visibleQuestionCount,
    answeredVisibleQuestionCount,
    skippedVisibleQuestionCount,
    resolvedVisibleQuestionCount,
    currentVisibleIndex,
    currentVisibleQuestion,
    progressPercent,
    isCollectionComplete,
  };
}

export function formatGuidedProgressLabel(accounting: GuidedVisibleQuestionAccounting): string {
  const { resolvedVisibleQuestionCount, visibleQuestionCount } = accounting;
  if (visibleQuestionCount <= 0) return "0 questions";
  return `${resolvedVisibleQuestionCount} of ${visibleQuestionCount} completed`;
}

export function formatGuidedQuestionHeader(
  accounting: GuidedVisibleQuestionAccounting,
  questionId: string,
): string {
  const q = accounting.visibleQuestions.find((x) => x.id === questionId);
  if (!q || accounting.visibleQuestionCount <= 0) return "Question";
  return `Question ${q.visibleIndex} of ${accounting.visibleQuestionCount}`;
}
