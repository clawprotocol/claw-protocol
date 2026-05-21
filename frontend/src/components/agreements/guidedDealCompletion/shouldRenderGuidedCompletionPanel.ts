import type { MaterialMissingItem } from "../proAgreementCompleteness/types";
import { getCurrentVariable } from "./guidedCompletionEngine";
import type { GuidedCompletionSession } from "./types";

export type ShouldRenderGuidedCompletionPanelArgs = {
  bodyUsable: boolean;
  session: GuidedCompletionSession | null | undefined;
  materialItems?: readonly MaterialMissingItem[];
  /** Optional — used only for future intake-only pre-checks; session must already include synthesized variables. */
  intakeRaw?: string | null;
  body?: string;
};

/** True only when the guided panel can show a real, actionable question. */
export function shouldRenderGuidedCompletionPanel(args: ShouldRenderGuidedCompletionPanelArgs): boolean {
  if (!args.bodyUsable) return false;
  const session = args.session;
  if (!session || session.queue.length === 0) return false;

  const hasUnresolved = session.queue.some(
    (id) => !session.answered[id] && !session.skipped.has(id),
  );
  if (!hasUnresolved) return false;

  const current = getCurrentVariable(session);
  if (!current) return false;

  const hasRenderableControl =
    current.suggestedDefaults.some((p) => p.id !== "custom" || p.label.length > 0) || current.uiControlType === "pills";
  return hasRenderableControl && current.question.trim().length > 8;
}

/** When false, callers must not show Needs-details / tighten-items / empty guided wrapper copy. */
export function shouldShowGuidedNeedsDetailsMessaging(panelRenderable: boolean): boolean {
  return panelRenderable;
}
