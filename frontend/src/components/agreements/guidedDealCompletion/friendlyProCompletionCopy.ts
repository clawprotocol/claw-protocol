import {
  GUIDED_NEUTRAL_REVIEW_COPY,
  GUIDED_NEUTRAL_REVIEW_TITLE,
} from "./canRenderGuidedQuestions";
import type { GuidedCompletionRenderState } from "./resolveGuidedCompletionRenderState";
import type { GuidedCompletionSession } from "./types";
import { guidedSessionIntro, importantVariableCount } from "./guidedCompletionEngine";

/** User-facing copy — never expose internal QA / model critique language. */
const INTERNAL_QA_RE =
  /\b(?:should\s+read\s+like|employment\s+contractor\s+document|model\s+critique|generation\s+failure|drafting\s+criticism|strict\s+pipeline|validation\s+reasons?)\b/i;

export const GUIDED_COMPLETION_HEADING = "Complete your agreement";
export const GUIDED_COMPLETION_SUBHEADING =
  "Finish these quick questions — LawDog will apply them in one clean update.";
export const GUIDED_QUESTION_FOOTER_COPY =
  "Finish these quick questions — LawDog will apply them in one clean update.";

export const GUIDED_READY_STATE_HEADLINE = "Your updated Pro agreement is ready.";
export const GUIDED_READY_STATE_SUBCOPY =
  "Review the improved agreement before sharing it for review or signature.";
export const GUIDED_READY_STATE_BODY =
  "Your answers were applied in one authoritative update to the full Pro agreement.";
export const GUIDED_READY_STATE_CTA = "Review updated agreement";

export const GUIDED_CUSTOM_INSTRUCTION_PLACEHOLDER =
  "Add anything important LawDog should know — e.g., payment details, excluded prospects, notice addresses, governing law, or special deal terms.";

export function sanitizeProUserMessage(message: string | null | undefined): string | null {
  const m = (message || "").trim();
  if (!m) return null;
  if (INTERNAL_QA_RE.test(m)) return null;
  if (m.length > 400) return null;
  return m;
}

export function friendlyLowConfidenceCopy(
  session: GuidedCompletionSession | null,
  renderState: Pick<GuidedCompletionRenderState, "canRenderGuidedQuestions"> | boolean = false,
): {
  title: string;
  body: string;
} {
  const canRender =
    typeof renderState === "boolean" ? renderState : renderState.canRenderGuidedQuestions;
  if (!canRender) {
    return {
      title: GUIDED_NEUTRAL_REVIEW_TITLE,
      body: GUIDED_NEUTRAL_REVIEW_COPY,
    };
  }
  const intro = guidedSessionIntro(session!);
  const n = importantVariableCount(session!);
  return {
    title: "We're almost done.",
    body:
      n > 0
        ? `We need ${n} more business decision${n === 1 ? "" : "s"} to finish your agreement. ${intro.subline}`
        : intro.subline,
  };
}

export function shouldPreferGuidedCompletionOverRetry(args: {
  hasUsableBody: boolean;
  structuralCatastrophic?: boolean;
  variableCount: number;
  materialGapCount?: number;
}): boolean {
  if (args.structuralCatastrophic) return false;
  if (!args.hasUsableBody) return false;
  if (args.variableCount > 0) return true;
  return (args.materialGapCount ?? 0) > 0;
}
