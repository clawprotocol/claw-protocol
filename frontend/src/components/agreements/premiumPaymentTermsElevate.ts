import { extractIntakePayment, formatPaymentTermsLine, type IntakePaymentField } from "./intakeCurrencyParse";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { isWeakStarterPaymentTermsForDisplay } from "./paymentTermsDisplay";

const PAYMENT_ECONOMICS_SIGNAL =
  /\$|payment|compensation|fee|fees|salary|retainer|invoice|milestone|equity|bonus|royalt|commission|reimburs|net\s*\d|\/month|\/year/i;

const GENERIC_PAYMENT_RE =
  /\b(to\s+be\s+agreed|to\s+be\s+determined|to\s+be\s+specified|payment\s+schedule\s+to\s+be\s+agreed|tbd)\b/i;

type DeterministicCompensationParse = {
  hasExplicitEconomics: boolean;
  hasVariableCompModel: boolean;
  percentage: string | null;
  trigger: string | null;
  exclusions: string[];
  payoutTiming: string | null;
  clawback: string | null;
};

function firstMatch(raw: string, re: RegExp): string | null {
  const m = raw.match(re);
  if (!m) return null;
  return (m[1] || m[0] || "").trim() || null;
}

export function parseDeterministicCompensation(rawText: string): DeterministicCompensationParse {
  const raw = (rawText || "").replace(/\s+/g, " ").trim();
  const low = raw.toLowerCase();
  const percentage = firstMatch(raw, /(\d{1,2}(?:\.\d{1,2})?\s*%)/i);
  const trigger =
    firstMatch(raw, /\b(on|upon)\s+(closed\s+(?:jobs?|deals?)|sourced\s+(?:jobs?|deals?)|collected\s+revenue)\b/i) ||
    (/\bclosed\s+(?:jobs?|deals?)\b/i.test(raw) ? "on closed sourced jobs" : null);
  const payoutTiming =
    firstMatch(raw, /\bpaid\s+(after\s+[^.;,\n]+)\b/i) ||
    firstMatch(raw, /\bafter\s+(deposit\s+clears?|funds?\s+(?:are\s+)?collected)\b/i);
  const exclusions: string[] = [];
  if (/\bno\s+commission\s+on\s+house\s+accounts?\b/i.test(low)) exclusions.push("No commission is due on house accounts.");
  if (/\bno\s+commission\s+on\s+existing\s+clients?\b/i.test(low))
    exclusions.push("No commission is due on existing clients/accounts.");
  if (/\bexclude(?:s|d)?\s+house\s+accounts?\b/i.test(low) && !exclusions.some((x) => /house accounts/i.test(x))) {
    exclusions.push("House accounts are excluded from commission calculations.");
  }
  const clawback =
    firstMatch(raw, /\b(clawback[^.;\n]*|refund\s+offsets?[^.;\n]*|chargebacks?[^.;\n]*)\b/i) ||
    (/\bclawback|refund|chargeback|reversal\b/i.test(low)
      ? "Commission payouts are subject to clawback/offset for refunds, reversals, or chargebacks."
      : null);
  const hasExplicitEconomics =
    Boolean(percentage) ||
    /\b(commission|referral\s+fee|rev(?:enue)?\s*share|profit\s+split|sales\s+split)\b/i.test(low) ||
    /\b(no\s+commission\s+on\s+(?:house\s+accounts?|existing\s+clients?))\b/i.test(low) ||
    Boolean(payoutTiming) ||
    Boolean(clawback);
  const hasVariableCompModel = /\b(commission|referral\s+fee|rev(?:enue)?\s*share|profit\s+split|sales\s+split)\b/i.test(low);
  return { hasExplicitEconomics, hasVariableCompModel, percentage, trigger, exclusions, payoutTiming, clawback };
}

function buildReferralCompensationBlock(parsed: DeterministicCompensationParse): string | null {
  if (!parsed.hasExplicitEconomics || !parsed.hasVariableCompModel) return null;
  const lines: string[] = ["Referral compensation schedule:"];
  if (parsed.percentage) {
    lines.push(
      `1. Commission rate: ${parsed.percentage} referral commission applies to attributable sourced opportunities.`,
    );
  } else {
    lines.push("1. Commission rate: referral commission applies as stated in the Parties' commercial terms.");
  }
  lines.push(`2. Trigger: ${parsed.trigger || "earned only on attributable sourced opportunities that close."}`);
  lines.push("Variable model: this schedule also governs revenue-share or split mechanics when those terms are used in the intake.");
  if (parsed.exclusions.length) {
    lines.push(`3. Exclusions: ${parsed.exclusions.join(" ")}`);
  } else {
    lines.push("3. Exclusions: house accounts and existing clients are excluded only if expressly stated in this Agreement.");
  }
  lines.push(`4. Payout timing: ${parsed.payoutTiming || "payable after cleared customer funds are collected."}`);
  if (parsed.clawback) lines.push(`5. Clawback/offsets: ${parsed.clawback}`);
  return lines.join("\n");
}

function synthesizeCommercialPaymentSignals(raw: string, hint: IntakePaymentField): string[] {
  const low = raw.toLowerCase();
  const parts: string[] = [];
  const line = formatPaymentTermsLine(hint);
  if (line) parts.push(`Base compensation: ${line}`);

  if (/\bcommission\b|rev(?:enue)?\s+share|%\s*(?:of\s+)?(?:gross|net|revenue|sales)/i.test(raw)) {
    const m = raw.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/);
    parts.push(
      m
        ? `Commissions / variable consideration: ${m[1]}% as further described in a written schedule (true-up, reporting, and payment timing to be finalized).`
        : "Commissions / variable consideration: percentage or revenue-share mechanics to be finalized in a short written schedule.",
    );
  }
  if (/\bretainer\b/i.test(low)) {
    parts.push(
      "Retainer: any retainer applies against delivered work; draw-down, replenishment, and unused balances (if any) follow an agreed fee letter or schedule.",
    );
  }
  if (/\bclawback|refunded\s+deals|refund\s+window|chargeback/i.test(raw)) {
    parts.push(
      "Clawbacks / true-down: the Parties may offset or recover variable compensation on refunds, clawbacks, or chargebacks as described in a written schedule (measurement period, notice, and dispute mechanics).",
    );
  }
  if (/\bmilestone|phase\s+payment|upon\s+deliver|installment/i.test(low)) {
    parts.push(
      "Milestones: installment payments (if any) are tied to acceptance of defined deliverables and may be invoiced on the cadence the Parties confirm in writing.",
    );
  }
  if (/\breimburs|pre-?approved\s+expenses|billable\s+expenses|costs\s+plus\s+fees/i.test(low)) {
    parts.push(
      "Expenses: documented, pre-approved out-of-pocket expenses may be reimbursed at cost unless the Parties agree on a fixed fee inclusive structure.",
    );
  }
  if (/\brevenue\s+share|rev\s*share|profit\s+split|sales\s+split|gross\s+receipts\s+share/i.test(low)) {
    parts.push(
      "Revenue share: variable compensation tied to revenue or receipts should be stated in a short schedule (definition of revenue, reporting cadence, and true-up).",
    );
  }
  if (/\bsubscription|recurring\s+billing|mrr|saas|membership\s+fee|auto-?renew/i.test(low)) {
    parts.push(
      "Subscriptions: recurring fees, renewal, and cancellation mechanics should match the product or service described (attach pricing page or schedule if needed).",
    );
  }
  if (/\bpayout|escrow|stripe\s+connect|marketplace\s+fee|platform\s+fee|pass-?through/i.test(low)) {
    parts.push(
      "Payouts / platform: pass-through, escrow, or third-party processor mechanics should be confirmed in writing (timing, fees, and chargebacks).",
    );
  }
  return parts;
}

function enrichThinPremiumPaymentTermsParagraph(draft: ParsedDraftShape): ParsedDraftShape {
  const payField = (draft.payment_terms || "").trim();
  if (!payField || payField.length > 280) return draft;
  if (/\bStated compensation anchors\b/i.test(payField)) return draft;
  if (payField.split(/\s+/).length > 28) return draft;
  if (
    /\binvoic|milestone|retainer|fee\s+letter|cadence|net\s*\d|late\s+fee|schedule attached|tax treatment|acceptance gates|bona fide dispute\b/i.test(
      payField,
    )
  ) {
    return draft;
  }
  if (!/\$|€|£|\d+\s*%/.test(payField)) return draft;
  const structured = `Stated compensation anchors: ${payField}

Commercial mechanics: amounts are in U.S. dollars unless stated otherwise. The Parties will confirm invoicing rhythm (for example, net-30), accepted payment methods, tax documentation, and any late-payment charge in a short fee letter or schedule attached before execution. Where milestones or acceptance gates apply, releases align with written acceptance criteria. Amounts in bona fide dispute may be withheld only for the disputed portion pending good-faith resolution.`;
  return { ...draft, payment_terms: structured };
}

/**
 * When premium parse leaves `payment_terms` thin or fragmentary but intake has economics,
 * synthesize professional language so post-payment review reads as upgraded.
 */
export function elevatePremiumPaymentTermsFromIntake(draft: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  const payField = (draft.payment_terms || "").trim();
  const corpus = `${rawIntake}\n${draft.purpose || ""}\n${payField}`.trim();
  const hint = extractIntakePayment(corpus);
  const compensation = parseDeterministicCompensation(rawIntake);
  const referralBlock = buildReferralCompensationBlock(compensation);
  const weak = !payField || isWeakStarterPaymentTermsForDisplay(payField);
  /** Starter-style “$10,000” survives merge but must not block elevation when raw describes retainers/commission/etc. */
  const thinDollarAnchorOnly =
    payField.length > 0 &&
    payField.length < 56 &&
    /\$\s*\d/.test(payField) &&
    !/\b(retainer|commission|milestone|invoic|clawback|reimburs|net\s*\d|cadence|schedule)\b/i.test(payField);
  const rawHasEconomicsSignals = PAYMENT_ECONOMICS_SIGNAL.test(rawIntake);
  const weakOrThinVersusRaw = weak || (thinDollarAnchorOnly && rawHasEconomicsSignals);
  const signals = synthesizeCommercialPaymentSignals(corpus, hint);

  let next: ParsedDraftShape = draft;

  if (
    compensation.hasExplicitEconomics &&
    (weakOrThinVersusRaw || GENERIC_PAYMENT_RE.test(payField) || !/\bcommission|referral|split|share|%\b/i.test(payField))
  ) {
    const pieces: string[] = [];
    if (hint.valid) {
      const line = formatPaymentTermsLine(hint);
      if (line) pieces.push(`Base compensation: ${line}`);
    }
    if (referralBlock) pieces.push(referralBlock);
    if (compensation.payoutTiming && !pieces.some((p) => /\bpayout timing\b/i.test(p))) {
      pieces.push(`Payout timing: ${compensation.payoutTiming}.`);
    }
    next = {
      ...draft,
      payment_terms: pieces.join("\n\n"),
    };
    return enrichThinPremiumPaymentTermsParagraph(next);
  }

  if (weakOrThinVersusRaw && signals.length) {
    next = {
      ...draft,
      payment_terms: `${signals.join(" ")} Invoicing, taxes, and payment mechanics follow the Parties’ written policies unless expressly amended in this Agreement.`,
    };
  } else if (!weakOrThinVersusRaw) {
    next = draft;
  } else {
    const line = formatPaymentTermsLine(hint);
    if (line) {
      next = {
        ...draft,
        payment_terms: `Compensation: ${line}. Invoicing, expenses, and taxes shall follow the Parties’ written policies unless expressly amended in this Agreement.`,
      };
    } else if (!hint.valid && PAYMENT_ECONOMICS_SIGNAL.test(corpus)) {
      next = {
        ...draft,
        payment_terms:
          "Compensation shall be specified in writing by the Parties (including rates, retainers, commissions, milestones, reimbursements, and invoicing cadence) and incorporated into this Agreement or an attached schedule.",
      };
    }
  }

  return enrichThinPremiumPaymentTermsParagraph(next);
}
