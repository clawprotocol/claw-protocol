/** Prompt area copy for free `/app/create` starter intake (stage-A). */
export const SIMPLE_CREATE_PROMPT_HEADING = "Describe your agreement.";
export const SIMPLE_CREATE_PROMPT_SUPPORT =
  "Type or dictate what you need. LawDog will turn it into a starter draft you can review before anything moves.";
export const SIMPLE_CREATE_PROMPT_PLACEHOLDER = "Example: Create a services agreement between…";

/** Starter template labels removed from `/app/create` — guard tests and copy audits. */
export const REMOVED_STARTER_TEMPLATE_BUBBLE_LABELS = [
  "Simple NDA between two parties",
  "Independent contractor agreement",
  "Consulting agreement with monthly retainer",
] as const;

export type StarterCreateSubmitSource = "textarea_current_value" | "intake_combined";

/**
 * Resolve text for Create draft on fresh simple create: current textarea wins over any stale baseline.
 */
export function resolveStarterCreateSubmitText(args: {
  textareaCurrentValue: string;
  intakeStepBuffer: string;
  intakeBaselineCommitted: string;
  freshSimpleCreateUx: boolean;
}): { text: string; source: StarterCreateSubmitSource } {
  const dom = args.textareaCurrentValue.trim();
  const buffer = args.intakeStepBuffer.trim();
  const current = dom.length > 0 ? dom : buffer;

  if (args.freshSimpleCreateUx && current.length > 0) {
    return { text: current, source: "textarea_current_value" };
  }

  const baseline = args.intakeBaselineCommitted.trim();
  if (!baseline) {
    return { text: current, source: current.length > 0 ? "textarea_current_value" : "intake_combined" };
  }
  if (!current) {
    return { text: baseline, source: "intake_combined" };
  }
  if (current === baseline || current.startsWith(baseline)) {
    return { text: current, source: "textarea_current_value" };
  }
  return { text: `${baseline}\n\n${current}`, source: "intake_combined" };
}

export function logStarterCreateSubmit(text: string, source: StarterCreateSubmitSource): void {
  console.info("[starter-create-submit]", {
    inputLen: text.length,
    source,
    hasSelectedTemplate: false,
  });
}
