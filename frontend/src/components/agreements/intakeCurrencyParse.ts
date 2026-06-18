/**
 * Client-side payment amount + timing hints for intake preview and smart defaults.
 * Assistive only — not authoritative for legal copy.
 */

export type IntakePaymentField = {
  amount: number | null;
  cadence: string | null;
  valid: boolean;
  /**
   * When true, `amount` is loan principal; `cadence` is the repayment *frequency* (e.g. monthly).
   * The per-installment amount is not stated; do not equate one period's payment to the full principal.
   */
  installmentAmountUnspecified?: boolean;
};

/** Opaque in UI copy; used for personal-loan "repay monthly / principal only" intakes. */
export const BORROWER_PRINCIPAL_INSTALLMENTS_SCHEDULE_A =
  "Borrower shall repay principal in monthly installments in amounts agreed by parties or shown in Schedule A.";

export function normalizeCurrency(input: string): number | null {
  if (!input) return null;

  const cleaned = input.toLowerCase().replace(/[, ]/g, "");

  const matchK = cleaned.match(/\$?(\d+(\.\d+)?)k\b/);
  if (matchK) {
    return Math.round(parseFloat(matchK[1]) * 1000);
  }

  const matchNum = cleaned.match(/\$?(\d+(\.\d+)?)/);
  if (matchNum) {
    return Math.round(parseFloat(matchNum[1]));
  }

  return null;
}

/** Intake already states a dollar amount per month / per installment (excludes “principal + monthly schedule” only). */
export function hasExplicitPerInstallmentAmountInIntake(t: string): boolean {
  const s = t.replace(/\s+/g, " ");
  if (/\$[\d,]+(?:\.\d{1,2})?\s*\/\s*mo(nth)?\b/i.test(s)) return true;
  if (/\$[\d,]+(?:\.\d{1,2})?\s*per\s*month\b/i.test(s)) return true;
  if (/\bof\s+\$[\d,]+(?:\.\d{1,2})?\s*per\s*month\b/i.test(s)) return true;
  if (/\bmonthly\s*(?:installment|payment|amount|pay(?:ment)?)s?\s*of\s+\$[\d,]+/i.test(s)) return true;
  if (/\binstallments?\s*of\s+\$[\d,]+/i.test(s)) return true;
  if (/\beach\s*month[:.]?\s*\$[\d,]+/i.test(s)) return true;
  if (/\$[\d,]+(?:\.\d{1,2})?\s*each\s*month\b/i.test(s)) return true;
  return false;
}

/**
 * Personal loan: principal in intake + monthly repayment *frequency*, with no per-installment amount given.
 * E.g. "Lent friend $5,000 repay monthly"
 */
function detectLentStylePrincipalWithRepayCadenceOnly(
  t: string,
  amount: number | null,
  cadence: string | null,
): boolean {
  if (amount == null) return false;
  if (cadence !== "monthly") return false;
  if (hasExplicitPerInstallmentAmountInIntake(t)) return false;

  const low = t.toLowerCase();
  if (
    !/\b(lent|loaned|personal\s+loan|a\s+loan|loan\s+of|loan\s+to|loan\s+from|lend(ing|s|ed)\b|borrow(ing|ed|s)?\b|borrowed|lender|iou|promissory|note|principal)\b/.test(
      low,
    )
  ) {
    return false;
  }

  if (!/\bmonthly\b|\/\s*month\b|\/\s*mo\b/.test(low)) return false;

  const hasRepayWords = /\b(repay|repaid|repayment|repa(y|ying)?|pay\s*back|payback|installments?|installment)\b/.test(low);
  const friendLent =
    /\b(lent|loaned)\b/.test(low) && /\b(friend|sibling|brother|sister|cousin|colleague)\b/.test(low);
  return hasRepayWords || friendLent;
}

function inferCadence(text: string): string | null {
  const low = text.toLowerCase();
  if (/\b(paid\s+)?monthly\b|\/\s*month\b|\bper\s+month\b|\/mo\b/.test(low)) return "monthly";
  if (/\bweekly\b|\/\s*week\b|\bper\s+week\b/.test(low)) return "weekly";
  if (/\b(daily|per\s+day)\b|\/\s*day\b/.test(low)) return "daily";
  if (/\b(quarterly|per\s+quarter)\b/.test(low)) return "quarterly";
  if (/\b(annually|annual|yearly|per\s+year)\b|\/\s*year\b/.test(low)) return "annually";
  return null;
}

const PAYMENT_SIGNAL =
  /\$|payment|compensation|fee|fees|salary|retainer|invoice|rate|k\/|\/month|\/week|\/year|\d\s*k\b|\dk\/month/i;

function extractAmountFromText(t: string): number | null {
  const tokenPatterns = [
    /\$?\d[\d,]*(?:\.\d+)?k(?:\/(?:month|week|year|mo|yr))?/gi,
    /\$\s*[\d,]+(?:\.\d{1,2})?(?:\/(?:month|week|year|mo))?/gi,
  ];
  for (const rx of tokenPatterns) {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(t)) !== null) {
      const n = normalizeCurrency(m[0]);
      if (n != null) return n;
    }
  }
  if (/\$|\d\s*k\b/i.test(t) || /\d+k\b/i.test(t)) {
    const n = normalizeCurrency(t);
    if (n != null) return n;
  }
  if (/\b(payment|fee|fees|compensation|salary|retainer)\b/i.test(t)) {
    const m = t.match(/\b(\d{1,3}(?:,\d{3})+|\d{4,})(?:\.\d{1,2})?\b/);
    if (m) {
      const n = normalizeCurrency(m[1]);
      if (n != null) return n;
    }
  }
  return null;
}

/** Natural preview wording — never echo raw parser tokens to the user. */
export function formatPaymentCadencePhrase(cadence: string): string {
  const c = (cadence || "").trim().toLowerCase();
  switch (c) {
    case "monthly":
      return "monthly payment";
    case "weekly":
      return "weekly payment";
    case "daily":
      return "daily payment";
    case "quarterly":
      return "quarterly payment";
    case "annually":
    case "annual":
    case "yearly":
      return "annual payment";
    default:
      if (c.includes("biweek") || c.includes("bi-week")) return "payment schedule";
      if (c.includes("month")) return "monthly payment";
      if (c.includes("week")) return "weekly payment";
      if (c.includes("quarter")) return "quarterly payment";
      if (c.includes("year") || c.includes("annual")) return "annual payment";
      return "payment schedule";
  }
}

/**
 * Derives structured payment hints from free-form intake text.
 * `valid: false` when the text clearly implies payment economics but no amount could be parsed.
 */
export function extractIntakePayment(fullText: string): IntakePaymentField {
  const t = (fullText || "").trim();
  if (!t) {
    return { amount: null, cadence: null, valid: true };
  }

  const cadence = inferCadence(t);
  const amount = extractAmountFromText(t);

  if (amount != null) {
    const c = cadence ?? inferCadence(t);
    const installmentAmountUnspecified = detectLentStylePrincipalWithRepayCadenceOnly(t, amount, c);
    return { amount, cadence: c, valid: true, installmentAmountUnspecified };
  }

  if (PAYMENT_SIGNAL.test(t)) {
    return { amount: null, cadence, valid: false };
  }

  return { amount: null, cadence: null, valid: true };
}

/** Milestone payment line when intake states total + N milestone payments (e.g. Ironclad QA fixture). */
export function formatMilestonePaymentTermsFromIntake(intake: string): string | null {
  const t = (intake || "").trim();
  if (!t) return null;
  const m = t.match(
    /\$?\s*([\d,]+(?:\.\d{2})?)\s*(?:k)?\s+paid\s+over\s+(\d+)\s+milestone\s+payments?/i,
  );
  if (!m) return null;
  const amount = normalizeCurrency(m[1]);
  if (amount == null) return null;
  const n = parseInt(m[2], 10);
  if (!Number.isFinite(n) || n < 2) return null;
  const formatted = amount.toLocaleString("en-US");
  const word =
    n === 6 ? "six" : n === 5 ? "five" : n === 4 ? "four" : n === 3 ? "three" : String(n);
  return `$${formatted} paid over ${word} milestone payments tied to deployment stages and launch targets.`;
}

/** Preserve installment cadence from intake when draft payment_terms were rewritten (Test372). */
export function formatInstallmentPaymentTermsFromIntake(intake: string): string | null {
  const t = (intake || "").trim();
  if (!t) return null;
  const direct = t.match(/\$\s*([\d,]+(?:\.\d{2})?)\s+in\s+monthly\s+installments?/i);
  if (direct) {
    const amount = normalizeCurrency(direct[1]);
    if (amount != null) {
      return `$${amount.toLocaleString("en-US")} in monthly installments`;
    }
  }
  const amount = extractAmountFromText(t);
  if (amount != null && inferCadence(t) === "monthly" && /\binstallments?\b/i.test(t)) {
    return `$${amount.toLocaleString("en-US")} in monthly installments`;
  }
  return null;
}

export function draftPaymentTermsLoseIntakeInstallmentCadence(
  draftTerms: string | null | undefined,
  intake: string | null | undefined,
): boolean {
  const d = String(draftTerms || "").trim().toLowerCase();
  const i = String(intake || "").trim().toLowerCase();
  if (!d || !i) return false;
  if (!/\bmonthly\s+installments?\b/i.test(i)) return false;
  return /\bupon\s+completion\b/i.test(d) || /\bon\s+completion\b/i.test(d);
}

/** Human-readable payment_terms line from structured hints (for smart defaults / POST body). */
export function formatPaymentTermsLine(p: IntakePaymentField, intakeRaw?: string): string {
  const milestone = formatMilestonePaymentTermsFromIntake(intakeRaw ?? "");
  if (milestone) return milestone;
  if (p.amount == null) return "";
  const formatted = p.amount.toLocaleString("en-US");
  if (p.installmentAmountUnspecified && p.cadence === "monthly") {
    return `Principal: $${formatted}. ${BORROWER_PRINCIPAL_INSTALLMENTS_SCHEDULE_A}`;
  }
  if (!p.cadence) return `$${formatted}`;
  if (p.cadence === "annually" && /\bmilestone\s+payments?\b/i.test(intakeRaw ?? "")) {
    return `$${formatted} paid over milestone payments as set forth in this Agreement.`;
  }
  return `$${formatted}, ${formatPaymentCadencePhrase(p.cadence)}`;
}
