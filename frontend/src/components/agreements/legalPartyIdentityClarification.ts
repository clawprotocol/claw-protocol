/**
 * Connect representative-bind identity questions to the existing clarification
 * workflow. Unresolved extraction humans are not confirmed legal parties.
 */

import type { BindableParty } from "./legalPartyRepresentativeBind";
import {
  bindRepresentativesToLegalParties,
  extractEntitySignerInstructions,
} from "./legalPartyRepresentativeBind";
import { isLikelyHumanSignerName } from "./intakeSignerMetadataAuthority";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import type { MaterialMissingItem } from "./proAgreementCompleteness/types";

export const IDENTITY_SIGNING_OR_PARTY_QUESTION_RE =
  /^Is (.+) signing for one of the named companies, or contracting as their own legal party\?$/;

export const IDENTITY_RESOLUTION_MARKER = "IDENTITY_RESOLUTION:";

export function isIdentityClarificationQuestion(question: string): boolean {
  return IDENTITY_SIGNING_OR_PARTY_QUESTION_RE.test((question || "").trim());
}

export function personNamedInIdentityQuestion(question: string): string | null {
  const match = (question || "").trim().match(IDENTITY_SIGNING_OR_PARTY_QUESTION_RE);
  return match?.[1]?.trim() || null;
}

function statementsOf(text: string): string[] {
  return (text || "")
    .split(/[\n;]+/)
    .map((row) => row.replace(new RegExp(`^${IDENTITY_RESOLUTION_MARKER}\\s*`), "").trim())
    .filter(Boolean);
}

export function identityClarificationResolved(answersOrIntake: string | null | undefined, question: string): boolean {
  const person = personNamedInIdentityQuestion(question);
  if (!person) return false;
  const blob = String(answersOrIntake || "");
  if (!blob.trim()) return false;
  const nameRe = new RegExp(person.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return statementsOf(blob).some(
    (line) =>
      nameRe.test(line) &&
      (/\bsigning for\b/i.test(line) ||
        /\bas an individual\b/i.test(line) ||
        /\bown legal party\b/i.test(line) ||
        /\bcontracting party\b/i.test(line) ||
        /\bsigner:\s*/i.test(line)),
  );
}

export function canonicalizeIdentityAnswer(answer: string): string | null {
  const text = String(answer || "").replace(new RegExp(`^${IDENTITY_RESOLUTION_MARKER}\\s*`), "").trim();
  if (!text) return null;
  if (/^.+\s+signer:\s+[A-Z]/.test(text)) return text;
  const signing = text.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,3})\s+is signing for\s+(.+?)(?:[.!]|$)/i,
  );
  if (signing) {
    const person = signing[1]!.replace(/\s+/g, " ").trim();
    const entity = signing[2]!.replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "");
    if (isLikelyHumanSignerName(person) && entity) return `${entity} signer: ${person}`;
  }
  const own = text.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,3})\s+is (?:contracting as (?:their|his|her) own legal party|an individual(?:\s+party)?|a contracting party)(?:\s*\(\s*([^)]+)\s*\))?/i,
  );
  if (own) {
    const person = own[1]!.replace(/\s+/g, " ").trim();
    const role = (own[2] || "Individual").replace(/\s+/g, " ").trim();
    if (isLikelyHumanSignerName(person)) {
      return `${person} as an individual (${role}) is a contracting party`;
    }
  }
  return null;
}

export function persistableIdentityResolution(answer: string): string | null {
  const canonical = canonicalizeIdentityAnswer(answer);
  if (!canonical) return null;
  return `${IDENTITY_RESOLUTION_MARKER} ${canonical}`;
}

export function mergeIdentityResolutionsIntoIntake(intake: string, answers: string | null | undefined): string {
  const lines = statementsOf(answers || "")
    .map((line) => canonicalizeIdentityAnswer(line) || persistableIdentityResolution(line))
    .filter((line): line is string => Boolean(line));
  return [intake || "", ...lines].filter(Boolean).join("\n").trim();
}

function samePerson(a: string, b: string): boolean {
  return a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
}

export function applyIdentityClarificationAnswers<T extends BindableParty>(args: {
  parties: readonly T[];
  intake: string;
  answers?: string | null;
}): { parties: T[]; unresolvedExtractionRows: BindableParty[]; clarificationQuestion: string | null } {
  const mergedIntake = mergeIdentityResolutionsIntoIntake(args.intake, args.answers);
  const bound = bindRepresentativesToLegalParties(args.parties, mergedIntake);
  let parties = bound.parties as T[];
  let unresolved = [...bound.unresolvedExtractionRows];
  for (const line of statementsOf(args.answers || "")) {
    const canonical = canonicalizeIdentityAnswer(line);
    if (!canonical) continue;
    const signer = canonical.match(/^(.+?) signer: (.+)$/);
    if (signer) {
      const entity = signer[1]!.trim();
      const person = signer[2]!.trim();
      parties = parties.map((party) =>
        partyLegalNamesMatch(party.name, entity)
          ? { ...party, signerName: party.signerName || person }
          : party,
      );
      unresolved = unresolved.filter((row) => !samePerson(row.name, person));
      continue;
    }
    const own = canonical.match(/^(.+?) as an individual \((.+)\) is a contracting party$/);
    if (own) {
      const person = own[1]!.trim();
      const role = own[2]!.trim();
      if (!parties.some((party) => samePerson(party.name, person))) {
        const source =
          unresolved.find((row) => samePerson(row.name, person)) ||
          args.parties.find((row) => samePerson(row.name, person));
        if (source) parties = [...parties, { ...source, name: person, role } as T];
      }
      unresolved = unresolved.filter((row) => !samePerson(row.name, person));
    }
  }
  const unresolvedHumans = unresolved.filter((row) => isLikelyHumanSignerName(row.name));
  return {
    parties,
    unresolvedExtractionRows: unresolved,
    clarificationQuestion:
      unresolvedHumans.length > 0 && parties.length >= 2
        ? `Is ${unresolvedHumans[0]!.name} signing for one of the named companies, or contracting as their own legal party?`
        : null,
  };
}

export function identityClarificationMaterialItem(args: {
  intakeRaw?: string | null;
  userGapAnswers?: string | null;
  parsedParties?: readonly BindableParty[] | null;
  additionalTerms?: string | null;
}): MaterialMissingItem | null {
  const parties = args.parsedParties || [];
  if (parties.length < 2) return null;
  const merged = mergeIdentityResolutionsIntoIntake(
    [args.intakeRaw || "", args.additionalTerms || ""].filter(Boolean).join("\n"),
    args.userGapAnswers,
  );
  const bound = bindRepresentativesToLegalParties(parties, merged);
  const question = bound.clarificationQuestion;
  if (!question) return null;
  if (identityClarificationResolved([args.userGapAnswers, args.additionalTerms, args.intakeRaw].filter(Boolean).join("\n"), question)) {
    return null;
  }
  const person = personNamedInIdentityQuestion(question) || "this person";
  return {
    id: "identity_signing_or_party",
    severity: "material",
    agreementFamily: "generic_business_agreement",
    label: "Party or representative",
    question,
    whyItMatters: `${person} was extracted but is not a confirmed legal party until you say whether they sign for a named company or contract as themselves.`,
    suggestedAnswerFormat: `e.g. ${person} is signing for Harbor Peak Analytics LLC. or ${person} is contracting as their own legal party (Advisor).`,
    affectsSections: ["Parties", "Signatures"],
    canProceedWithoutAnswer: true,
  };
}

export function appendIdentityQuestionToMaterialAsks(
  asks: readonly string[] | null | undefined,
  question: string | null | undefined,
): string[] {
  const out = [...(asks || [])].map((s) => String(s).trim()).filter(Boolean);
  const q = (question || "").trim();
  if (q && !out.includes(q)) out.push(q);
  return out.slice(0, 8);
}

export function entityAlreadyHasExplicitSigner(intake: string, entity: string): boolean {
  return extractEntitySignerInstructions(intake).some((row) => row.entity.toLowerCase() === entity.toLowerCase());
}
