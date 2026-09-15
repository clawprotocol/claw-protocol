/**
 * Named milestone recipients without a payer stay a guided missing fact.
 * Do not invent a payer or add a fifth legal party.
 * Generated or transformed paper is not customer confirmation.
 */
import type { MaterialMissingItem } from "./proAgreementCompleteness/types";
import { paymentSectionText } from "./proAgreementCompleteness/revisionQuestionEngine";
import {
  entityBoundTo,
  partyReceiveAllocationsFromIntake,
} from "./paidProPartyEconomicRelationships";

export const UNCONFIRMED_MILESTONE_PAYER_QUESTION =
  "Which of the existing parties pays the listed milestone amounts? Name one current party. Do not add another legal party.";

const EXPLICIT_PAYER_RE =
  /\b(?:pays?|shall pay|will pay|is the paying party|paying party)\b/i;
const INVENTED_FIFTH_PARTY_RE =
  /\b(?:a new company|another company|fifth party|additional legal party|outside payer|unlisted party)\b/i;
const LISTED_MILESTONE_PAYER_SENTENCE_RE =
  /\s*[A-Z][^.?\n]{2,90}?\s+pays each listed milestone amount to the named recipient\.\s*/gi;

export function unconfirmedMilestonePayerQuestion(): string {
  return UNCONFIRMED_MILESTONE_PAYER_QUESTION;
}

export function isMilestonePayerQuestion(question: string): boolean {
  return (question || "").trim() === UNCONFIRMED_MILESTONE_PAYER_QUESTION;
}

export function intakeHasNamedMilestoneRecipients(intake: string): boolean {
  return partyReceiveAllocationsFromIntake(intake).length >= 2;
}

export function textNamesExplicitPayer(text: string): boolean {
  return EXPLICIT_PAYER_RE.test(text || "");
}

export function knownLegalEntitiesFromIntake(intake: string): string[] {
  const fromReceives = partyReceiveAllocationsFromIntake(intake).map((row) => row.entity);
  const labeled = [...(intake || "").matchAll(/^Party \d+[^\n]*\n([^\n]+)/gim)].map((m) =>
    (m[1] || "").trim(),
  );
  const entities = [...fromReceives, ...labeled].filter((name) => name.length >= 4);
  return [...new Set(entities)];
}

export function paperBindsMilestonePayer(text: string, party: string): boolean {
  return Boolean(party) && entityBoundTo(text || "", party, EXPLICIT_PAYER_RE);
}

/**
 * Confirmation sources: explicit payer in intake, or a confirmed customer answer.
 * Raw generated/transformed paper is never confirmation. The unused body argument
 * stays for call-site compatibility and is ignored.
 */
export function extractConfirmedMilestonePayer(
  intake: string,
  userGapAnswers = "",
  generatedOrTransformedBody = "",
): string | null {
  const parties = knownLegalEntitiesFromIntake(`${intake}\n${generatedOrTransformedBody}`);
  const sources = [userGapAnswers, intake];
  for (const source of sources) {
    if (!textNamesExplicitPayer(source)) continue;
    for (const party of parties) {
      if (entityBoundTo(source, party, EXPLICIT_PAYER_RE)) return party;
    }
  }
  return null;
}

export function milestonePayerNeedsQuestion(args: {
  intakeRaw?: string | null;
  userGapAnswers?: string | null;
  body?: string | null;
}): boolean {
  const intake = args.intakeRaw || "";
  const answers = args.userGapAnswers || "";
  const body = args.body || "";
  const recipientSource = intakeHasNamedMilestoneRecipients(intake) ? intake : body;
  if (!intakeHasNamedMilestoneRecipients(recipientSource)) return false;
  return !extractConfirmedMilestonePayer(intake, answers, body);
}

export function milestonePayerMaterialItem(args: {
  intakeRaw?: string | null;
  userGapAnswers?: string | null;
  body?: string | null;
}): MaterialMissingItem | null {
  if (!milestonePayerNeedsQuestion(args)) return null;
  return {
    id: "milestone_payer",
    severity: "material",
    agreementFamily: "consulting_agreement",
    label: "Milestone payer",
    question: UNCONFIRMED_MILESTONE_PAYER_QUESTION,
    whyItMatters:
      "Named recipients and amounts are not a payment term until an existing party is identified as the payer.",
    suggestedAnswerFormat: "Name one current party as the payer. Do not add another legal party.",
    affectsSections: ["Payment", "Fees"],
    canProceedWithoutAnswer: true,
  };
}

function replaceDocumentSection(doc: string, section: string, next: string): string {
  const start = doc.indexOf(section);
  if (start < 0) return doc;
  const after = doc.slice(start + section.length);
  const gluedHeading = /^(?:\d{1,2})\.(?!\d)\s+\S/.test(after);
  const sep = gluedHeading && !/\n$/.test(next) ? "\n\n" : "";
  return `${doc.slice(0, start)}${next}${sep}${after}`;
}

function appendPaymentSentence(section: string, sentence: string): string {
  const next = section.replace(/\s+$/g, "");
  const spacer = next && !/[.!?]$/.test(next) ? ". " : next ? " " : "";
  return `${next}${spacer}${sentence}`.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

function stripContradictoryMilestonePayerSentences(
  doc: string,
  payer: string,
  parties: readonly string[],
): string {
  let next = doc;
  for (const party of parties) {
    if (!party || party === payer) continue;
    const escaped = party.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(
      new RegExp(`${escaped}\\s+pays each listed milestone amount to the named recipient\\.\\s*`, "gi"),
      "",
    );
  }
  next = next.replace(LISTED_MILESTONE_PAYER_SENTENCE_RE, (sentence) =>
    entityBoundTo(sentence, payer, EXPLICIT_PAYER_RE) ? sentence : "",
  );
  return next.replace(/\n{3,}/g, "\n\n");
}

export function applySuppliedMilestonePayerToAuthorizedPaper(
  documentText: string,
  intakeText: string,
  userGapAnswers: string,
): string {
  if (INVENTED_FIFTH_PARTY_RE.test(userGapAnswers) && !extractConfirmedMilestonePayer(intakeText, userGapAnswers)) {
    return documentText;
  }
  const payer = extractConfirmedMilestonePayer(intakeText, userGapAnswers, documentText);
  if (!payer) return documentText;
  const parties = knownLegalEntitiesFromIntake(`${intakeText}\n${documentText}`);
  let doc = stripContradictoryMilestonePayerSentences(
    (documentText || "").replace(/\r\n/g, "\n"),
    payer,
    parties,
  );
  if (paperBindsMilestonePayer(doc, payer)) return doc;
  const section = paymentSectionText(doc);
  if (!section.trim()) return doc;
  const sentence = `${payer} pays each listed milestone amount to the named recipient.`;
  return replaceDocumentSection(doc, section, appendPaymentSentence(section, sentence));
}
