/** Server `revision_validation.issues` codes → short user-facing lines (no raw codes in UI). */
const REVISION_VALIDATION_ISSUE_LABELS: Record<string, string> = {
  missing_cure_period: "Cure period may not have been added.",
  missing_non_disparagement: "Non-disparagement language may be missing.",
  timeline_not_updated: "Timeline may not reflect the requested change.",
  /** Legacy server code — treat like timeline. */
  missing_timeline_45_days: "Timeline may not reflect the requested change.",
  jurisdiction_dropped: "Governing law may have been removed.",
  payment_terms_dropped: "Payment terms may have been removed.",
};

export function humanizeRevisionValidationIssues(issues: readonly string[]): string[] {
  return issues.map((code) => REVISION_VALIDATION_ISSUE_LABELS[code] ?? code);
}
