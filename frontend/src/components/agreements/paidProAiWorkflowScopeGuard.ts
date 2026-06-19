/**
 * Scope guard: AI workflow / acceptance-demo sections only when intake explicitly requests them.
 */

export function intakeRequestsAiWorkflowOrAcceptanceScope(blob: string): boolean {
  const text = (blob || "").trim();
  if (!text) return false;
  return /\b(?:acceptance\s+test(?:ing)?|demonstration\s+review|demo\s+review|configured\s+(?:ai\s+)?workflow|ai\s+workflow\s+setup|implementation\s+acceptance|acceptance\s+and\s+demonstration|workflow\s+setup\s+services|review\s+period)\b/i.test(
    text,
  );
}

export function intakeSignalsAiWorkflowDomain(blob: string): boolean {
  const text = (blob || "").trim();
  if (!text) return false;
  return /\b(?:ai|artificial intelligence|workflow|automation|setup|implementation|integration)\b/i.test(text);
}

/** True only when intake explicitly asks for AI workflow scope — not generic consulting/services. */
export function shouldApplyAiWorkflowServicesQualityFloor(blob: string): boolean {
  if (!intakeSignalsAiWorkflowDomain(blob)) return false;
  return intakeRequestsAiWorkflowOrAcceptanceScope(blob);
}
