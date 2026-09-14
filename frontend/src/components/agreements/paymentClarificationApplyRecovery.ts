/**
 * Restore Apply prerequisites after a dashboard session reset.
 *
 * Pending payment answers in sessionStorage are not enough. Intake and the
 * structured draft must come from live create state or authorized GET data for
 * the same agreement. Do not invent paper or mark a failed save as applied.
 */

import { extractDateMeanings } from "./paidProDateMeaning";
import { hasCompletionMeaning } from "./paidProCompletionCriteria";
import { extractPaymentFacts, paymentSectionText } from "./proAgreementCompleteness/revisionQuestionEngine";

export type PaymentApplyStructuredDraft = {
  title?: string | null;
  purpose?: string | null;
  payment_terms?: string | null;
  agreement_id?: string | null;
  id?: string | null;
};

export type PaymentApplyIntakeSource = "live" | "stored_payment" | "authorized_draft" | "none";
export type PaymentApplyStructuredSource =
  | "live"
  | "premium_snapshot"
  | "authorized_draft"
  | "none";

export function intakeFromAuthorizedDraft(
  draft: PaymentApplyStructuredDraft | null | undefined,
): string {
  if (!draft) return "";
  return (
    [draft.title, draft.purpose, draft.payment_terms].filter(Boolean).join("\n\n").trim() ||
    String(draft.purpose || "").trim()
  );
}

export function authorizedDraftMatchesAgreement(
  draft: PaymentApplyStructuredDraft | null | undefined,
  agreementId: string,
): boolean {
  const expected = String(agreementId || "").trim();
  if (!expected || !draft) return false;
  const actual = String(draft.agreement_id || draft.id || "").trim();
  return !actual || actual === expected;
}

export function resolvePaymentClarificationApplyPrerequisites<T>(args: {
  liveIntake?: string | null;
  storedPaymentIntake?: string | null;
  authorizedDraftIntake?: string | null;
  liveStructuredDraft?: T | null;
  premiumCompletionDraft?: T | null;
  authorizedStructuredDraft?: T | null;
}): {
  intakeText: string;
  structured: T | null;
  intakeSource: PaymentApplyIntakeSource;
  structuredSource: PaymentApplyStructuredSource;
} {
  const liveIntake = String(args.liveIntake || "").trim();
  const storedPaymentIntake = String(args.storedPaymentIntake || "").trim();
  const authorizedDraftIntake = String(args.authorizedDraftIntake || "").trim();
  const intakeText = liveIntake || storedPaymentIntake || authorizedDraftIntake;
  const intakeSource: PaymentApplyIntakeSource = liveIntake
    ? "live"
    : storedPaymentIntake
      ? "stored_payment"
      : authorizedDraftIntake
        ? "authorized_draft"
        : "none";

  const liveStructured = args.liveStructuredDraft ?? null;
  const premiumCompletionDraft = args.premiumCompletionDraft ?? null;
  const authorizedStructuredDraft = args.authorizedStructuredDraft ?? null;
  const structured = liveStructured || premiumCompletionDraft || authorizedStructuredDraft;
  const structuredSource: PaymentApplyStructuredSource = liveStructured
    ? "live"
    : premiumCompletionDraft
      ? "premium_snapshot"
      : authorizedStructuredDraft
        ? "authorized_draft"
        : "none";

  return { intakeText, structured, intakeSource, structuredSource };
}

export function paymentApplyPrerequisitesReady(args: {
  intakeText?: string | null;
  structured?: unknown | null;
}): boolean {
  return Boolean(String(args.intakeText || "").trim() && args.structured);
}

/**
 * After dashboard reset the workspace GET draft is a short structured shell.
 * If authorized intake is materially richer, re-parse that intake instead of
 * treating the shell as a complete Apply draft. Does not invent facts.
 */
export function shouldReparseStructuredDraftFromRecoveredIntake(args: {
  intakeText?: string | null;
  structured?: PaymentApplyStructuredDraft | null;
}): boolean {
  const intake = String(args.intakeText || "").trim();
  if (!intake) return false;
  if (!args.structured) return true;
  const structuredIntake = intakeFromAuthorizedDraft(args.structured);
  return intake.length >= structuredIntake.length + 40;
}

function appendPaymentSentence(section: string, sentence: string): string {
  const next = section.replace(/\s+$/g, "");
  const spacer = next && !/[.!?]$/.test(next) ? ". " : next ? " " : "";
  return `${next}${spacer}${sentence}`.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Patch Fees and Payment on already-authorized paper from confirmed answers.
 * Used after dashboard reset so Apply can persist without regenerating a full draft.
 */
export function applySuppliedPaymentFactsToAuthorizedPaper(
  documentText: string,
  intakeText: string,
  userGapAnswers: string,
): string {
  const doc = (documentText || "").replace(/\r\n/g, "\n");
  const section = paymentSectionText(doc);
  if (!section.trim()) return doc;
  const facts = extractPaymentFacts(intakeText, userGapAnswers);
  if (!facts.cadence && facts.deadlineDays == null) return doc;

  const compact = section.replace(/\s+/g, " ");
  let next = section;
  if (facts.cadence === "once") {
    next = next.replace(/\s*Consultant will invoice the fixed fee monthly\.?/gi, "");
    next = next.replace(/\s*Consultant will invoice the fixed fee weekly\.?/gi, "");
    if (facts.invoiceDate && !compact.includes(facts.invoiceDate.replace(/\s+/g, " "))) {
      const alreadyOnce = /invoice the fixed fee once/i.test(compact);
      if (!alreadyOnce) {
        next = appendPaymentSentence(next, `Consultant will invoice the fixed fee once on ${facts.invoiceDate}.`);
      }
    } else if (!/invoice the fixed fee once|one installment/i.test(compact)) {
      next = appendPaymentSentence(next, "Consultant will invoice the fixed fee in one installment.");
    }
  } else if (facts.cadence === "monthly" && !/invoice the fixed fee monthly/i.test(compact)) {
    next = appendPaymentSentence(next, "Consultant will invoice the fixed fee monthly.");
  } else if (facts.cadence === "weekly" && !/invoice the fixed fee weekly/i.test(compact)) {
    next = appendPaymentSentence(next, "Consultant will invoice the fixed fee weekly.");
  }
  if (facts.deadlineDays != null && !new RegExp(`net\\s*[- ]?${facts.deadlineDays}\\b`, "i").test(compact)) {
    next = appendPaymentSentence(next, `Payment is due net ${facts.deadlineDays}.`);
  }
  if (next === section) return doc;
  return replaceDocumentSection(doc, section, next);
}

const NEXT_TOP_LEVEL_HEADING_RE = /(?:^|\n|(?<=\.))(?:\d{1,2})\.(?!\d)\s+\S/;
const SCOPE_SECTION_HEADING_RE = /^(\d+)\.\s+(?:SCOPE OF SERVICES|SERVICES|SCOPE|ENGAGEMENT)\b/im;

function replaceDocumentSection(doc: string, section: string, next: string): string {
  const start = doc.indexOf(section);
  if (start < 0) return doc;
  const after = doc.slice(start + section.length);
  const gluedHeading = /^(?:\d{1,2})\.(?!\d)\s+\S/.test(after);
  const sep = gluedHeading && !/\n$/.test(next) ? "\n\n" : "";
  return `${doc.slice(0, start)}${next}${sep}${after}`;
}

function applyLabeledEffectiveDateToOpening(doc: string, date: string): string {
  const labeled = new RegExp(
    `${date.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(\\s*the\\s+["']Effective Date["']\\s*\\)`,
    "i",
  );
  if (labeled.test(doc.slice(0, 900))) return doc;
  if (/entered into as of the Effective Date by and between/i.test(doc)) {
    return doc.replace(
      /entered into as of the Effective Date by and between/i,
      `entered into as of ${date} (the "Effective Date") by and between`,
    );
  }
  return doc.replace(
    /entered into by and between/i,
    `entered into as of ${date} (the "Effective Date") by and between`,
  );
}

function completionSentenceFromAnswers(answers: string): string {
  for (const sent of (answers || "").split(/(?<=[.!?])\s+/)) {
    const piece = sent.trim();
    if (!piece) continue;
    if (/written confirmation that/i.test(piece) || /^completion is\b/i.test(piece)) {
      return /[.!?]$/.test(piece) ? piece : `${piece}.`;
    }
  }
  return "";
}

function scopeSectionText(doc: string): string {
  const heading = SCOPE_SECTION_HEADING_RE.exec(doc || "");
  if (!heading || heading.index == null) return "";
  const start = heading.index;
  const afterHeading = start + heading[0].length;
  const rest = (doc || "").slice(afterHeading);
  const nxt = NEXT_TOP_LEVEL_HEADING_RE.exec(rest);
  const end = afterHeading + (nxt && nxt.index != null ? nxt.index : rest.length);
  return (doc || "").slice(start, end);
}

function appendScopeSentence(doc: string, sentence: string): string {
  const section = scopeSectionText(doc);
  if (!section.trim()) return doc;
  const next = appendPaymentSentence(section, sentence);
  if (next === section) return doc;
  return replaceDocumentSection(doc, section, next);
}

/**
 * Patch opening Effective Date and consulting completion on authorized paper
 * from confirmed answers. Avoids regenerating a full draft after first persist.
 */
export function applySuppliedContentFactsToAuthorizedPaper(
  documentText: string,
  intakeText: string,
  userGapAnswers: string,
): string {
  let doc = (documentText || "").replace(/\r\n/g, "\n");
  const meanings = extractDateMeanings(intakeText, userGapAnswers, doc);
  if (meanings.effectiveDate && !meanings.needsQuestion) {
    doc = applyLabeledEffectiveDateToOpening(doc, meanings.effectiveDate);
  }
  if (!hasCompletionMeaning(doc)) {
    const completion = completionSentenceFromAnswers(userGapAnswers);
    if (completion) doc = appendScopeSentence(doc, completion);
  }
  return doc;
}
