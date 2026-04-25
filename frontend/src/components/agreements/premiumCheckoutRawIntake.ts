import type { ParsedDraftShape } from "./intakeSmartDefaults";

/**
 * When the live intake buffer is cleared after handoff to review, still build a
 * non-empty raw string for premium checkout / completion from structured draft fields.
 */
export function buildReviewCoercionRawIntakeFromDraft(d: ParsedDraftShape | null, intake: string): string {
  const t = intake.trim();
  if (t.length >= 8) return t;
  if (!d) return t;
  return [
    d.title,
    d.purpose,
    d.payment_terms,
    ...(d.parties || []).map((p) => p.name),
    d.duration ?? "",
    d.due_date ?? "",
    d.effective_date ?? "",
    d.jurisdiction,
    d.termination_summary ?? "",
    d.additional_terms ?? "",
    d.llc_company_name ?? "",
    d.management_structure ?? "",
    d.members_ownership_summary ?? "",
    d.capital_contributions_summary ?? "",
    d.distributions_summary ?? "",
    d.transfer_restrictions_summary ?? "",
    d.dissolution_summary ?? "",
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
