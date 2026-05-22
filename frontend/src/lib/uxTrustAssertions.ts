/**
 * Structured UX trust diagnostics for Pro → VS01 continuity.
 */

export function logUxTrustEvent(
  event:
    | "placeholder_regression"
    | "title_regression"
    | "authoritative_body_shrink"
    | "signer_metadata_empty"
    | "auto_placement_failure"
    | "vs01_prep_without_fields"
    | "guided_causality",
  payload: Record<string, unknown>,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const level = event === "placeholder_regression" || event === "authoritative_body_shrink" ? "warn" : "info";
  const line = { event, ...payload };
  if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn("[ux-trust]", line);
  } else {
    // eslint-disable-next-line no-console
    console.info("[ux-trust]", line);
  }
}
