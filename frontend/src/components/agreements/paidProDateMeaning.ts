/** Distinguish agreement effective date, service/term start, invoice date, and signature date. */

export const UNCONFIRMED_EFFECTIVE_DATE_QUESTION =
  "Is the agreement effective date the same as the service start date, or a different date?";

const MONTH =
  "(?:January|February|March|April|May|June|July|August|September|October|November|December)";
const DATE_RE = new RegExp(`${MONTH}\\s+\\d{1,2},\\s+\\d{4}`, "gi");
const DATE_ONE_RE = new RegExp(`${MONTH}\\s+\\d{1,2},\\s+\\d{4}`, "i");
const UNRESOLVED_RE =
  /\b(?:tbd|unspecified|unknown|undecided|not sure|contradict(?:ed|s|ion)?|to be (?:agreed|confirmed|determined))\b/i;
const INVOICE_OR_PAYMENT_RE = /\b(?:invoice|invoiced|payment due|payable|net\s*[- ]?\d+)\b/i;
const SIGNATURE_RE = /\b(?:signed on|signature date|date signed)\b/i;

export type DateMeanings = {
  effectiveDate: string | null;
  serviceStart: string | null;
  invoiceDate: string | null;
  sameAsServiceStart: boolean;
  contradicted: boolean;
  unresolved: boolean;
  needsQuestion: boolean;
};

export function unconfirmedEffectiveDateQuestion(serviceStart?: string | null): string {
  const date = (serviceStart || "").trim();
  if (!date) return UNCONFIRMED_EFFECTIVE_DATE_QUESTION;
  return `Is the agreement effective date the same as the ${date} service start, or a different date?`;
}

export function isDateMeaningQuestion(question: string): boolean {
  return /^Is the agreement effective date the same as /.test((question || "").trim());
}

function statementsOf(text: string): string[] {
  const out: string[] = [];
  for (const block of (text || "").split(/[\n;]+/)) {
    for (const sent of block.split(/(?<=[.!?])\s+/)) {
      const piece = sent.trim();
      if (piece) out.push(piece);
    }
  }
  return out;
}

function normalizeDate(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function firstDate(text: string): string | null {
  const match = text.match(DATE_ONE_RE);
  return match ? normalizeDate(match[0]) : null;
}

function isPaymentOrSignatureStatement(sent: string): boolean {
  return INVOICE_OR_PAYMENT_RE.test(sent) || SIGNATURE_RE.test(sent);
}

function serviceStartFrom(text: string): string | null {
  let found: string | null = null;
  const startRe = new RegExp(
    `(?:starting|beginning|begins?(?:\\s+on)?|service start(?:s|ing)?(?:\\s+on)?)\\s+(${MONTH}\\s+\\d{1,2},\\s+\\d{4})`,
    "gi",
  );
  for (const match of text.matchAll(startRe)) {
    if (isPaymentOrSignatureStatement(match[0])) continue;
    found = normalizeDate(match[1] || "");
  }
  const termRe = new RegExp(
    `(?:term\\s+(?:starts?|begins?)|services?\\s+start)\\s+(?:is\\s+|on\\s+)?(${MONTH}\\s+\\d{1,2},\\s+\\d{4})`,
    "gi",
  );
  for (const match of text.matchAll(termRe)) {
    if (isPaymentOrSignatureStatement(match[0])) continue;
    found = normalizeDate(match[1] || "");
  }
  return found;
}

function invoiceDateFrom(text: string): string | null {
  let found: string | null = null;
  for (const sent of statementsOf(text)) {
    if (!INVOICE_OR_PAYMENT_RE.test(sent)) continue;
    const date = firstDate(sent);
    if (date) found = date;
  }
  return found;
}

function labeledEffectiveFrom(text: string): { date: string | null; sameAsStart: boolean; contradicted: boolean } {
  let date: string | null = null;
  let sameAsStart = false;
  let contradicted = false;
  for (const sent of statementsOf(text)) {
    if (isPaymentOrSignatureStatement(sent)) continue;
    if (
      /effective date.{0,100}(?:the )?same/i.test(sent) ||
      /same as.{0,60}service start/i.test(sent) ||
      /same as the .{0,40}service start/i.test(sent)
    ) {
      sameAsStart = true;
      const mentioned = firstDate(sent);
      if (mentioned) date = mentioned;
      continue;
    }
    const labeled = sent.match(
      new RegExp(
        `(?:effective(?:\\s+date)?\\s+(?:is\\s+|as of\\s+)|is\\s+effective(?:\\s+as of)?\\s+)(${MONTH}\\s+\\d{1,2},\\s+\\d{4})`,
        "i",
      ),
    );
    if (labeled?.[1]) {
      const next = normalizeDate(labeled[1]);
      if (date && date.toLowerCase() !== next.toLowerCase()) contradicted = true;
      date = next;
    }
  }
  return { date, sameAsStart, contradicted };
}

function definedEffectiveFromPaper(body: string): string | null {
  const defined = (body || "").match(
    new RegExp(
      `(?:as of|effective as of)\\s+(${MONTH}\\s+\\d{1,2},\\s+\\d{4})\\s+\\(\\s*the\\s+["']Effective Date["']\\s*\\)|` +
        `["']Effective Date["']\\s+is\\s+(${MONTH}\\s+\\d{1,2},\\s+\\d{4})`,
      "i",
    ),
  );
  if (!defined) return null;
  return normalizeDate(defined[1] || defined[2] || "");
}

export function extractDateMeanings(intake: string, userGapAnswers = "", body = ""): DateMeanings {
  const answers = userGapAnswers || "";
  const unresolved = UNRESOLVED_RE.test(answers);
  const serviceStart = serviceStartFrom(answers) || serviceStartFrom(intake) || serviceStartFrom(body);
  const invoiceDate = invoiceDateFrom(`${answers}\n${intake}`);
  const fromAnswers = labeledEffectiveFrom(answers);
  const fromIntake = labeledEffectiveFrom(intake);
  const fromPaper = definedEffectiveFromPaper(body);
  let effectiveDate = fromAnswers.date;
  let sameAsServiceStart = fromAnswers.sameAsStart;
  let contradicted = fromAnswers.contradicted;
  if (!effectiveDate && !sameAsServiceStart) {
    effectiveDate = fromIntake.date || fromPaper;
    sameAsServiceStart = fromIntake.sameAsStart;
    contradicted = fromIntake.contradicted;
  }
  if (sameAsServiceStart && serviceStart && !effectiveDate) {
    effectiveDate = serviceStart;
  }
  if (
    sameAsServiceStart &&
    serviceStart &&
    effectiveDate &&
    effectiveDate.toLowerCase() !== serviceStart.toLowerCase() &&
    fromAnswers.date
  ) {
    contradicted = true;
  }
  if (unresolved || contradicted) {
    effectiveDate = null;
    sameAsServiceStart = false;
  }
  const needsQuestion = !effectiveDate || unresolved || contradicted;
  return {
    effectiveDate,
    serviceStart,
    invoiceDate,
    sameAsServiceStart: Boolean(sameAsServiceStart && effectiveDate && serviceStart),
    contradicted,
    unresolved,
    needsQuestion,
  };
}

export function dateMeaningMaterialItem(args: {
  intakeRaw?: string | null;
  userGapAnswers?: string | null;
  body?: string | null;
}): {
  id: "date_meaning_effective";
  severity: "material";
  label: string;
  question: string;
  whyItMatters: string;
  suggestedAnswerFormat: string;
  affectsSections: string[];
  canProceedWithoutAnswer: true;
} | null {
  const meanings = extractDateMeanings(args.intakeRaw || "", args.userGapAnswers || "", args.body || "");
  if (!meanings.needsQuestion) return null;
  if (!meanings.serviceStart && !DATE_RE.test(args.intakeRaw || "") && !/(?:effective date|term|start)/i.test(args.intakeRaw || "")) {
    return null;
  }
  if (!meanings.serviceStart && !meanings.needsQuestion) return null;
  if (!meanings.serviceStart && !/(?:starting|beginning|effective date|term)/i.test(args.intakeRaw || "")) {
    return null;
  }
  return {
    id: "date_meaning_effective",
    severity: "material",
    label: "Agreement effective date",
    question: unconfirmedEffectiveDateQuestion(meanings.serviceStart),
    whyItMatters:
      "The agreement effective date, service start, invoice date, and signature date are different facts.",
    suggestedAnswerFormat: meanings.serviceStart
      ? `e.g. The agreement effective date is the same as the ${meanings.serviceStart} service start.`
      : "e.g. The agreement is effective September 15, 2026. Services start October 1, 2026.",
    affectsSections: ["Opening", "Term"],
    canProceedWithoutAnswer: true,
  };
}
