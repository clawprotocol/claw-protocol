import type { DraftState } from "../../components/AgreementBuilderChat";

export type ValidationResult = {
  missingRequired: string[];
  warnings: string[];
};

function toText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function extractDuration(text: string): string | null {
  const m = text.match(/(?:for\s+)?(\d+)\s*(day|week|month|year)s?\b/i);
  if (!m) return null;
  return `${m[1]} ${m[2].toLowerCase()}${m[1] === "1" ? "" : "s"}`;
}

function extractAmount(text: string): string {
  return text.match(/\$[\d,]+(?:\.\d{1,2})?/)?.[0] || "";
}

function extractFrequency(text: string): string {
  const t = (text || "").toLowerCase();
  if (/\b(per|every)\s+week\b/.test(t) || /\bweekly\b/.test(t)) return "weekly";
  if (/\b(per|every)\s+month\b/.test(t) || /\bmonthly\b/.test(t)) return "monthly";
  if (/\b(per|every)\s+day\b/.test(t) || /\bdaily\b/.test(t)) return "daily";
  if (/\b(per|every)\s+year\b/.test(t) || /\bannually\b|\byearly\b/.test(t)) return "annually";
  return (text.match(/\b(monthly|weekly|daily|biweekly|quarterly|annually|flat|one-time)\b/i)?.[1] || "").toLowerCase();
}

function waiverMap(draft: DraftState): Record<string, boolean> {
  const meta = draft.metadata as { waivers?: Record<string, boolean> } | undefined;
  return meta?.waivers || {};
}

function isWaived(draft: DraftState, field: string): boolean {
  return Boolean(waiverMap(draft)[field]);
}

export function normalizeDraft(draft: DraftState): { draft: DraftState; warnings: string[] } {
  const next: DraftState = { ...draft };
  const warnings: string[] = [];
  next.parties = [...(draft.parties || [])];
  next.payment = next.payment || { amount: "", frequency: "", schedule: { text: "", daysWorked: [] } };
  if (typeof next.payment.schedule === "string") {
    next.payment.schedule = { text: next.payment.schedule, daysWorked: [] };
  }
  next.term = next.term || {};
  next.governingLaw = toText(next.governingLaw) || toText(next.jurisdiction) || null;

  const paymentTerms = toText(next.payment_terms);
  if (!toText(next.payment.amount) && paymentTerms) next.payment.amount = extractAmount(paymentTerms);
  if (!toText(next.payment.frequency) && paymentTerms) next.payment.frequency = extractFrequency(paymentTerms);
  if (!toText(next.payment.schedule.text) && paymentTerms) next.payment.schedule.text = paymentTerms;

  const derivedDuration = extractDuration(`${paymentTerms} ${toText(next.payment.schedule.text)}`);
  const explicitDuration = toText(next.term?.duration) || toText(next.term_duration);
  if (!explicitDuration && derivedDuration) {
    next.term = { ...(next.term || {}), duration: derivedDuration };
    next.term_duration = derivedDuration;
  } else if (explicitDuration && derivedDuration && explicitDuration.toLowerCase() !== derivedDuration.toLowerCase()) {
    warnings.push(`Term conflict: explicit "${explicitDuration}" vs payment-derived "${derivedDuration}".`);
  }
  if (toText(next.effective_date) && !toText(next.term?.startDate)) {
    next.term = { ...(next.term || {}), startDate: toText(next.effective_date) };
  }
  if (toText(next.context_summary) && !toText(next.purpose)) next.purpose = toText(next.context_summary);
  if (toText(next.key_terms) && !toText(next.scope)) next.scope = toText(next.key_terms);
  if (toText(next.termination_terms) && !toText(next.termination)) next.termination = toText(next.termination_terms);

  return { draft: next, warnings };
}

export function validateDraft(input: DraftState): ValidationResult {
  const { draft, warnings } = normalizeDraft(input);
  const missingRequired: string[] = [];
  if (!toText(draft.title) && !isWaived(draft, "title")) missingRequired.push("title");
  if (!toText(draft.jurisdiction) && !isWaived(draft, "jurisdiction")) missingRequired.push("jurisdiction");
  if (!toText(draft.governingLaw) && !isWaived(draft, "governingLaw")) missingRequired.push("governing law");

  const parties = draft.parties || [];
  if (parties.filter((p) => toText(p.name)).length < 2 && !isWaived(draft, "parties")) {
    missingRequired.push("at least two parties");
  }
  if (!toText(draft.payment?.amount) && !isWaived(draft, "payment.amount")) missingRequired.push("payment.amount");
  if (!toText(draft.payment?.frequency) && !isWaived(draft, "payment.frequency")) missingRequired.push("payment.frequency");
  if (!toText(draft.term?.duration) && !isWaived(draft, "term.duration")) missingRequired.push("term.duration");

  if (parties[0] && !toText(parties[0].contact) && !isWaived(draft, "partyA.contact")) missingRequired.push("party A contact");
  if (parties[1] && !toText(parties[1].contact) && !isWaived(draft, "partyB.contact")) missingRequired.push("party B contact");

  return { missingRequired, warnings };
}
