import { resolveGuidedQuestionTarget } from "./guidedRevisionAnchors";

/** Plain-English preview of what a guided answer will implement on bulk regeneration. */
export function resolveImplementationPreview(
  variableId: string,
  displayAnswer: string,
  instructionAnswer?: string,
): string {
  const answer = (instructionAnswer || displayAnswer || "").trim();
  const label = (displayAnswer || "").trim();
  const target = resolveGuidedQuestionTarget(variableId);
  const section = target.sectionNumber
    ? `Section ${target.sectionNumber} — ${target.sectionLabel}`
    : target.sectionLabel;

  if (/ip_/.test(variableId)) {
    return `Adds ownership and work-product language to ${section} reflecting: ${label || answer}.`;
  }
  if (variableId === "saas_sla" || variableId === "support_obligations") {
    return `Adds support/SLA expectations to ${section} reflecting: ${label || answer}.`;
  }
  if (/payment|fee|phase/.test(variableId)) {
    return `Adds fee and payment language to ${section} (and Schedule A if needed) reflecting: ${label || answer}.`;
  }
  if (variableId === "renewal_notice" || /terminat/.test(variableId)) {
    return `Clarifies term and termination in ${section} reflecting: ${label || answer}.`;
  }
  if (variableId === "security_obligations" || variableId === "nda_survival") {
    return `Adds confidentiality duties in ${section} reflecting: ${label || answer}.`;
  }
  return `Updates ${section} to reflect: ${label || answer}.`;
}
