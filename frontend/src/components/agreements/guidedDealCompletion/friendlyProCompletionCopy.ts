import type { GuidedCompletionSession } from "./types";
import { guidedSessionIntro, importantVariableCount } from "./guidedCompletionEngine";

/** User-facing copy — never expose internal QA / model critique language. */
const INTERNAL_QA_RE =
  /\b(?:should\s+read\s+like|employment\s+contractor\s+document|model\s+critique|generation\s+failure|drafting\s+criticism|strict\s+pipeline|validation\s+reasons?)\b/i;

export const GUIDED_COMPLETION_HEADING = "Complete your agreement";
export const GUIDED_COMPLETION_SUBHEADING =
  "Finish a few business decisions — we'll update your draft as you go.";

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
  panelRenderable = true,
): {
  title: string;
  body: string;
} {
  if (!panelRenderable) {
    return {
      title: "Ready to review.",
      body: "Ready to review — add any final edits below.",
    };
  }
  if (!session) {
    return {
      title: "We're almost done.",
      body: "We need a few more details to finish your agreement. Use Complete your agreement below.",
    };
  }
  const intro = guidedSessionIntro(session);
  const n = importantVariableCount(session);
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
