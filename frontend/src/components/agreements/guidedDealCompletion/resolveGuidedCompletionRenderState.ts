/**
 * Single resolver for guided-completion truthfulness across all Pro surfaces.
 * NEVER show Needs details / Complete your agreement copy unless a question panel is mounted.
 */

import type { MaterialMissingItem } from "../proAgreementCompleteness/types";
import type { FinalizeReadiness } from "../finalizeReadinessModel";
import { buildGuidedSessionFromAgreement, getCurrentVariable } from "./guidedCompletionEngine";
import { variableHasSelectableAnswerPath } from "./shouldRenderGuidedCompletionPanel";
import type { DealVariable, GuidedCompletionSession } from "./types";

export type GuidedPanelMountedSurface =
  | "document_editor"
  | "recovery_banner"
  | "finalize_panel"
  | null;

export type GuidedReadinessLabel = "needs_details" | "ready_to_review" | "ready_to_send";

export type GuidedCompletionRenderState = {
  canRenderGuidedQuestions: boolean;
  shouldShowNeedsDetails: boolean;
  shouldShowCompleteAgreementHeading: boolean;
  shouldShowUseCompleteBelowCopy: boolean;
  readinessLabel: GuidedReadinessLabel;
  reason: string;
  unresolvedRenderableCount: number;
  currentVariableId: string | null;
  currentVariableHasPills: boolean;
  currentVariableAllowsCustom: boolean;
  panelMountedSurface: GuidedPanelMountedSurface;
  /** Session has at least one unanswered, selectable question (panel may still be unmounted). */
  sessionHasRenderableQueue: boolean;
};

export type ResolveGuidedCompletionRenderStateArgs = {
  bodyText?: string;
  intakeText?: string | null;
  materialMissingItems?: readonly MaterialMissingItem[];
  guidedSession?: GuidedCompletionSession | null;
  currentVariable?: DealVariable | null;
  panelMountedSurface: GuidedPanelMountedSurface;
  draftState?: string;
  bodyUsable?: boolean;
  rawReadiness?: FinalizeReadiness;
  /** When false, guided questions must not mount (e.g. paid Pro showing starter clone / retry only). */
  paidProAuthoritativeCorpusReady?: boolean;
};

export function countUnresolvedRenderableVariables(session: GuidedCompletionSession | null | undefined): number {
  if (!session?.queue.length) return 0;
  let n = 0;
  for (const id of session.queue) {
    if (session.answered[id] || session.skipped.has(id)) continue;
    const v = session.variables.find((x) => x.id === id);
    if (v && variableHasSelectableAnswerPath(v) && v.question.trim().length > 8) n += 1;
  }
  return n;
}

function variableAllowsCustom(variable: DealVariable | null | undefined): boolean {
  if (!variable) return false;
  if (variable.uiControlType !== "pills") return true;
  return variable.suggestedDefaults.some((p) => p.id === "custom");
}

function mapReadinessLabel(
  raw: FinalizeReadiness | undefined,
  canRender: boolean,
): GuidedReadinessLabel {
  if (!canRender) {
    if (raw === "ready_for_signature") return "ready_to_send";
    return "ready_to_review";
  }
  if (raw === "needs_details") return "needs_details";
  if (raw === "ready_for_signature") return "ready_to_send";
  return "ready_to_review";
}

/** Re-apply finalize readiness labels onto a parent-computed render state. */
export function applyRawReadinessToGuidedRenderState(
  state: GuidedCompletionRenderState,
  rawReadiness?: FinalizeReadiness,
): GuidedCompletionRenderState {
  const readinessLabel = mapReadinessLabel(rawReadiness, state.canRenderGuidedQuestions);
  return {
    ...state,
    readinessLabel,
    shouldShowNeedsDetails: state.canRenderGuidedQuestions && readinessLabel === "needs_details",
    shouldShowCompleteAgreementHeading:
      state.canRenderGuidedQuestions && state.panelMountedSurface !== "document_editor",
    shouldShowUseCompleteBelowCopy:
      state.sessionHasRenderableQueue &&
      !state.canRenderGuidedQuestions &&
      state.panelMountedSurface == null,
  };
}

export function resolveGuidedCompletionRenderState(
  args: ResolveGuidedCompletionRenderStateArgs,
): GuidedCompletionRenderState {
  const bodyText = (args.bodyText || "").trim();
  const intakeText = (args.intakeText || "").trim();
  const bodyUsable = args.bodyUsable ?? bodyText.length >= 500;

  const session =
    args.guidedSession ??
    (bodyText.length >= 200
      ? buildGuidedSessionFromAgreement({
          intakeRaw: intakeText || null,
          body: bodyText,
          materialItems: args.materialMissingItems,
        })
      : null);

  const unresolvedRenderableCount = countUnresolvedRenderableVariables(session);
  const current = args.currentVariable ?? (session ? getCurrentVariable(session) : null);
  const currentRenderable =
    Boolean(current) &&
    variableHasSelectableAnswerPath(current!) &&
    current!.question.trim().length > 8;

  const sessionHasRenderableQueue = unresolvedRenderableCount > 0;
  const panelMounted = args.panelMountedSurface != null;

  let reason = "neutral_review";
  let canRenderGuidedQuestions = false;

  if (args.paidProAuthoritativeCorpusReady === false) {
    reason = "paid_pro_authoritative_corpus_missing";
  } else if (!bodyUsable) {
    reason = "body_not_usable";
  } else if (!session || session.queue.length === 0) {
    reason = "empty_guided_queue";
  } else if (unresolvedRenderableCount === 0) {
    reason = "no_unresolved_renderable_variables";
  } else if (!currentRenderable) {
    reason = "current_variable_not_renderable";
  } else if (!panelMounted) {
    reason = "guided_panel_not_mounted_on_surface";
  } else {
    canRenderGuidedQuestions = true;
    reason = "renderable_question_mounted";
  }

  const readinessLabel = mapReadinessLabel(args.rawReadiness, canRenderGuidedQuestions);
  const shouldShowNeedsDetails = canRenderGuidedQuestions && readinessLabel === "needs_details";
  /** Heading lives on GuidedDealCompletionPanel when mounted in the document editor — avoid duplicate in Finalize. */
  const shouldShowCompleteAgreementHeading =
    canRenderGuidedQuestions && args.panelMountedSurface !== "document_editor";
  /** Pointer copy only when questions exist but the panel is not mounted on any surface (e.g. Finalize-only). */
  const shouldShowUseCompleteBelowCopy =
    sessionHasRenderableQueue && !panelMounted && canRenderGuidedQuestions === false;

  const currentVariableHasPills =
    current?.uiControlType === "pills" &&
    (current.suggestedDefaults.filter((p) => p.id !== "recommend").length > 0);

  return {
    canRenderGuidedQuestions,
    shouldShowNeedsDetails,
    shouldShowCompleteAgreementHeading,
    shouldShowUseCompleteBelowCopy,
    readinessLabel,
    reason,
    unresolvedRenderableCount,
    currentVariableId: current?.id ?? null,
    currentVariableHasPills,
    currentVariableAllowsCustom: variableAllowsCustom(current),
    panelMountedSurface: args.panelMountedSurface,
    sessionHasRenderableQueue,
  };
}

export type GuidedRenderStateLogPayload = {
  canRenderGuidedQuestions: boolean;
  shouldShowNeedsDetails: boolean;
  unresolvedRenderableCount: number;
  currentVariableId: string | null;
  currentVariableHasPills: boolean;
  currentVariableAllowsCustom: boolean;
  panelMountedSurface: GuidedPanelMountedSurface;
  reason: string;
  sessionHasRenderableQueue?: boolean;
  draftState?: string;
};

export function logGuidedRenderState(state: GuidedCompletionRenderState, extra?: { draftState?: string }): void {
  if (!import.meta.env.DEV) return;
  const payload: GuidedRenderStateLogPayload = {
    canRenderGuidedQuestions: state.canRenderGuidedQuestions,
    shouldShowNeedsDetails: state.shouldShowNeedsDetails,
    unresolvedRenderableCount: state.unresolvedRenderableCount,
    currentVariableId: state.currentVariableId,
    currentVariableHasPills: state.currentVariableHasPills,
    currentVariableAllowsCustom: state.currentVariableAllowsCustom,
    panelMountedSurface: state.panelMountedSurface,
    reason: state.reason,
    sessionHasRenderableQueue: state.sessionHasRenderableQueue,
    draftState: extra?.draftState,
  };
  console.info("[guided-render-state]", payload);
}

export function warnGuidedInvariantViolation(
  state: GuidedCompletionRenderState,
  context: string,
  flags: {
    showedNeedsDetails?: boolean;
    showedCompleteHeading?: boolean;
    showedUseCompleteBelow?: boolean;
    showedTightenBelow?: boolean;
  },
): void {
  if (!import.meta.env.DEV) return;
  if (state.canRenderGuidedQuestions) return;
  const violated =
    flags.showedNeedsDetails ||
    flags.showedCompleteHeading ||
    flags.showedUseCompleteBelow ||
    flags.showedTightenBelow;
  if (!violated) return;
  console.warn("[guided-invariant-violation]", {
    context,
    reason: state.reason,
    panelMountedSurface: state.panelMountedSurface,
    ...flags,
  });
}

/** @deprecated Prefer resolveGuidedCompletionRenderState */
export function computeCanRenderGuidedQuestions(args: {
  bodyUsable: boolean;
  session: GuidedCompletionSession | null | undefined;
  guidedPanelMounted?: boolean;
}): boolean {
  return resolveGuidedCompletionRenderState({
    bodyUsable: args.bodyUsable,
    guidedSession: args.session,
    panelMountedSurface: args.guidedPanelMounted === false ? null : "document_editor",
  }).canRenderGuidedQuestions;
}
