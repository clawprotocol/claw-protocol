/**
 * Connect representative-bind identity questions to the existing clarification
 * workflow. Unresolved people are stored separately from confirmed legal parties.
 */

import type { BindableParty } from "./legalPartyRepresentativeBind";
import {
  bindRepresentativesToLegalParties,
  extractEntitySignerInstructions,
  extractRoleSignerInstructions,
} from "./legalPartyRepresentativeBind";
import { isBoilerplateLegalPartyPhrase, isLikelyHumanSignerName } from "./intakeSignerMetadataAuthority";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import { partyLegalNamesMatch, resolvePaidProPartyRolesFromAcceptedCorpus } from "./paidProAcceptedCorpusPartyRoles";
import type { MaterialMissingItem } from "./proAgreementCompleteness/types";

export const IDENTITY_SIGNING_OR_PARTY_QUESTION_RE =
  /^Is (.+) signing for one of the named companies, or contracting as their own legal party\?$/;

export const IDENTITY_RESOLUTION_MARKER = "IDENTITY_RESOLUTION:";
export const IDENTITY_UNRESOLVED_MARKER = "IDENTITY_UNRESOLVED:";
export const MAX_LEGAL_PARTIES = 4;

export type IdentitySubjectSource = "customer_mentioned" | "extraction_only";

export type UnresolvedIdentitySubject = {
  name: string;
  source: IdentitySubjectSource;
  email?: string;
  roleHint?: string;
};

const NEGATION_RE =
  /\b(?:is\s+not|isn['’]t|does\s+not|doesn['’]t|not\s+signing|not\s+a\s+(?:party|signer)|do\s+not\s+add|ignore|not\s+involved)\b/i;

function statementsOf(text: string): string[] {
  return (text || "")
    .split(/[\n;]+/)
    .map((row) => row.trim())
    .filter(Boolean);
}

function stripMarkers(text: string): string {
  let out = String(text || "").trim();
  if (out.startsWith(IDENTITY_RESOLUTION_MARKER)) {
    out = out.slice(IDENTITY_RESOLUTION_MARKER.length).trim();
  }
  if (out.startsWith(IDENTITY_UNRESOLVED_MARKER)) {
    out = out.slice(IDENTITY_UNRESOLVED_MARKER.length).trim();
  }
  return out;
}

function samePerson(a: string, b: string): boolean {
  return a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
}

const PERSON_NAME_STOP_RE =
  /^(?:is|are|was|were|be|been|being|not|signing|signs|will|signed|for|the|a|an|as|their|own|legal|party)$/i;

function normalizeCapturedPerson(raw: string): string | null {
  const cleaned = String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/g, "")
    .split(/\s+/)
    .filter((part) => part && !PERSON_NAME_STOP_RE.test(part))
    .join(" ");
  if (!cleaned || !isLikelyHumanSignerName(cleaned)) return null;
  return cleaned;
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isIdentityClarificationQuestion(question: string): boolean {
  return IDENTITY_SIGNING_OR_PARTY_QUESTION_RE.test((question || "").trim());
}

export function personNamedInIdentityQuestion(question: string): string | null {
  const match = (question || "").trim().match(IDENTITY_SIGNING_OR_PARTY_QUESTION_RE);
  return match?.[1]?.trim() || null;
}

export function identityQuestionForPerson(name: string): string {
  return `Is ${name} signing for one of the named companies, or contracting as their own legal party?`;
}

export function isCustomerMentionedPerson(intake: string, name: string): boolean {
  const person = (name || "").trim();
  if (!person || !intake) return false;
  return new RegExp(`\\b${escapeRe(person)}\\b`, "i").test(intake);
}

export function serializeUnresolvedIdentity(subjects: readonly UnresolvedIdentitySubject[]): string {
  return subjects
    .map((row) => {
      const email = row.email || "";
      const role = row.roleHint || "";
      return `${IDENTITY_UNRESOLVED_MARKER} ${row.name} | ${row.source} | ${email} | ${role}`.replace(/\s+$/, "");
    })
    .join("\n");
}

export function parseUnresolvedIdentity(text: string | null | undefined): UnresolvedIdentitySubject[] {
  const out: UnresolvedIdentitySubject[] = [];
  for (const line of statementsOf(text || "")) {
    if (!line.startsWith(IDENTITY_UNRESOLVED_MARKER)) continue;
    const body = stripMarkers(line);
    const [name, source, email, roleHint] = body.split("|").map((part) => part.trim());
    if (!name || isBoilerplateLegalPartyPhrase(name)) continue;
    out.push({
      name,
      source: source === "customer_mentioned" ? "customer_mentioned" : "extraction_only",
      ...(email ? { email } : {}),
      ...(roleHint ? { roleHint } : {}),
    });
  }
  return out;
}

export function classifyUnresolvedIdentitySubjects(
  rows: readonly BindableParty[],
  intake: string,
): UnresolvedIdentitySubject[] {
  return rows
    .filter((row) => isLikelyHumanSignerName(row.name) && !isBoilerplateLegalPartyPhrase(row.name))
    .map((row) => ({
      name: row.name,
      source: isCustomerMentionedPerson(intake, row.name) ? "customer_mentioned" : "extraction_only",
      ...(row.email ? { email: row.email } : {}),
      ...(row.role && !/^(party|signer|email)$/i.test(row.role) ? { roleHint: row.role } : {}),
    }));
}

export function customerMentionedUnresolvedFromIntake(
  intake: string,
  confirmedParties: readonly BindableParty[] = [],
): UnresolvedIdentitySubject[] {
  const boundSigners = [
    ...extractEntitySignerInstructions(intake).map((row) => row.signerName),
    ...extractRoleSignerInstructions(intake).map((row) => row.signerName),
  ];
  const confirmed = confirmedParties.map((row) => row.name);
  const found: UnresolvedIdentitySubject[] = [];
  const nameRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+){1,3})\b/g;
  let match: RegExpExecArray | null;
  const blob = intake || "";
  while ((match = nameRe.exec(blob))) {
    const name = match[1]!.trim();
    if (!isLikelyHumanSignerName(name) || isBoilerplateLegalPartyPhrase(name)) continue;
    if (/\b(?:agreement|services|consulting|subscription|draft|scope|fees|payment|governing|confidentiality|termination)\b/i.test(name)) {
      continue;
    }
    if (/^(?:New York|New Jersey|New Mexico|New Hampshire|North Carolina|South Carolina|North Dakota|South Dakota|West Virginia|Rhode Island|Washington Dc)$/i.test(name)) {
      continue;
    }
    const before = blob.slice(Math.max(0, match.index - 28), match.index);
    if (/\b(?:governing\s+law|law|venue|state of)\s+$/i.test(before)) continue;
    const after = blob.slice(match.index + name.length, match.index + name.length + 12);
    if (/\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP)\b/i.test(after)) {
      continue;
    }
    if (boundSigners.some((signer) => samePerson(signer, name))) continue;
    if (confirmed.some((party) => samePerson(party, name) || party.toLowerCase().includes(name.toLowerCase()))) {
      continue;
    }
    if (new RegExp(`${escapeRe(name)}\\s+as\\s+an\\s+individual`, "i").test(blob)) continue;
    if (!found.some((row) => samePerson(row.name, name))) {
      const nearby = blob.slice(match.index + name.length, match.index + name.length + 80);
      const email = nearby.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
      found.push({ name, source: "customer_mentioned", ...(email ? { email } : {}) });
    }
  }
  return found;
}

export function mergeUnresolvedIdentityIntoText(
  existing: string | null | undefined,
  subjects: readonly UnresolvedIdentitySubject[],
): string {
  const kept = statementsOf(existing || "").filter((line) => !line.startsWith(IDENTITY_UNRESOLVED_MARKER));
  const serialized = serializeUnresolvedIdentity(subjects);
  return [...kept, serialized].filter(Boolean).join("\n").trim();
}

export function canonicalizeIdentityAnswer(
  answer: string,
  options?: { knownEntities?: readonly string[]; questionPerson?: string | null },
): string | null {
  const raw = stripMarkers(answer);
  if (!raw) return null;
  if (isIdentityClarificationQuestion(raw) || isIdentityClarificationQuestion(answer)) return null;
  const text = raw
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, " ")
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (NEGATION_RE.test(text) || NEGATION_RE.test(raw)) return null;
  if (text === IDENTITY_RESOLUTION_MARKER.trim()) return null;

  if (/^.+\s+signer:\s+[A-Z]/i.test(text)) {
    const signer = text.match(/^(.+?)\s+signer:\s+(.+)$/i);
    if (signer) {
      const entity = signer[1]!.replace(IDENTITY_RESOLUTION_MARKER, "").trim();
      const person = normalizeCapturedPerson(signer[2]!);
      if (!person) return null;
      if (options?.questionPerson && !samePerson(person, options.questionPerson)) return null;
      if (options?.knownEntities?.length && !options.knownEntities.some((name) => partyLegalNamesMatch(name, entity))) {
        return null;
      }
      return `${entity} signer: ${person}`;
    }
  }

  const signing = text.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,3})\s+(?:is\s+)?(?:signing|signs|will\s+sign|signed)\s+for\s+(.+?)(?:[.!]|$)/i,
  );
  if (signing) {
    const person = normalizeCapturedPerson(signing[1]!);
    const entity = signing[2]!.replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "");
    if (!person || !entity || /one of the named companies/i.test(entity)) return null;
    if (options?.questionPerson && !samePerson(person, options.questionPerson)) return null;
    if (options?.knownEntities?.length && !options.knownEntities.some((name) => partyLegalNamesMatch(name, entity))) {
      return null;
    }
    return `${entity} signer: ${person}`;
  }

  const entityFirst = text.match(
    /\b(.+?)\s+(?:signer|signatory)\s+(?:is|:)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,3})\b/i,
  );
  if (entityFirst) {
    const entity = entityFirst[1]!.replace(/\s+/g, " ").trim();
    const person = normalizeCapturedPerson(entityFirst[2]!);
    if (person && entity) {
      if (options?.questionPerson && !samePerson(person, options.questionPerson)) return null;
      if (options?.knownEntities?.length && !options.knownEntities.some((name) => partyLegalNamesMatch(name, entity))) {
        return null;
      }
      return `${entity} signer: ${person}`;
    }
  }

  const own = text.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,3})\s+is\s+(?:contracting\s+as\s+(?:their|his|her|its)\s+own\s+legal\s+party|an\s+individual(?:\s+party)?|a\s+contracting\s+party)(?:\s*\(\s*([^)]+)\s*\))?/i,
  );
  if (own) {
    const person = normalizeCapturedPerson(own[1]!);
    const role = (own[2] || "Individual").replace(/\s+/g, " ").trim();
    if (!person) return null;
    if (options?.questionPerson && !samePerson(person, options.questionPerson)) return null;
    return `${person} as an individual (${role}) is a contracting party`;
  }

  const dismiss = text.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,3})\s+(?:is\s+not\s+a\s+(?:party|participant)|was\s+added\s+by\s+mistake|should\s+be\s+ignored)\b/i,
  );
  if (dismiss && normalizeCapturedPerson(dismiss[1]!)) {
    return null;
  }
  return null;
}

export function persistableIdentityResolution(
  answer: string,
  options?: { knownEntities?: readonly string[]; questionPerson?: string | null },
): string | null {
  const canonical = canonicalizeIdentityAnswer(answer, options);
  if (!canonical) return null;
  return `${IDENTITY_RESOLUTION_MARKER} ${canonical}`;
}

export function confirmedIdentityResolutionLines(text: string | null | undefined): string[] {
  return statementsOf(text || "")
    .filter((line) => line.startsWith(IDENTITY_RESOLUTION_MARKER))
    .map((line) => canonicalizeIdentityAnswer(line))
    .filter((line): line is string => Boolean(line));
}

function emailFromText(text: string): string | undefined {
  return text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
}

/** Explicit customer or intake signer instructions only — not inferred contact/notice fills. */
function explicitResolvedPersonNames(args: {
  intake: string;
  answers?: string | null;
  knownEntities?: readonly string[];
}): string[] {
  const names: string[] = [];
  for (const row of extractEntitySignerInstructions(args.intake)) {
    if (row.signerName) names.push(row.signerName);
  }
  for (const row of extractRoleSignerInstructions(args.intake)) {
    if (row.signerName) names.push(row.signerName);
  }
  for (const line of statementsOf([args.intake, args.answers || ""].join("\n"))) {
    const canonical = canonicalizeIdentityAnswer(line, { knownEntities: args.knownEntities });
    if (!canonical) continue;
    const signer = canonical.match(/^(.+?) signer: (.+)$/);
    if (signer) names.push(signer[2]!.trim());
    const own = canonical.match(/^(.+?) as an individual \((.+)\) is a contracting party$/);
    if (own) names.push(own[1]!.trim());
  }
  return names;
}

function isConfirmedIndividualParty(name: string, intake: string): boolean {
  return new RegExp(`${escapeRe(name)}\\s+as\\s+an\\s+individual`, "i").test(intake);
}

function keepConfirmedLegalParty(party: BindableParty, intake: string): boolean {
  const name = String(party.name || "").trim();
  if (!name || /^\d+\s+/.test(name)) return false;
  if (!isLikelyHumanSignerName(name)) return true;
  if (isConfirmedIndividualParty(name, intake)) return true;
  const role = String(party.role || "").trim();
  return Boolean(role && !/^(party|signer|email)$/i.test(role));
}

export function confirmedPartiesFromCustomerText(
  intake: string,
  parsedParties?: readonly BindableParty[] | null,
): BindableParty[] {
  if (parsedParties && parsedParties.length >= 2) {
    const confirmed = parsedParties.filter((party) => keepConfirmedLegalParty(party, intake));
    const deduped: BindableParty[] = [];
    for (const party of confirmed.length >= 2
      ? confirmed
      : parsedParties.filter((row) => !isLikelyHumanSignerName(row.name) && keepConfirmedLegalParty(row, intake))) {
      if (!deduped.some((existing) => partyLegalNamesMatch(existing.name, party.name))) {
        deduped.push({ ...party });
      }
    }
    return deduped;
  }
  const structured = parseIntakeToStructuredAgreement(intake);
  const parties = (structured.parties || [])
    .filter((name) => keepConfirmedLegalParty({ name, role: "party" }, intake))
    .slice(0, MAX_LEGAL_PARTIES)
    .map((name) => ({
      name,
      role: structured.partyRoleHints[name.toLowerCase()] || structured.partyRoleHints[name] || "party",
    }));
  return bindRepresentativesToLegalParties(parties, intake).parties;
}

export function identityResolvedInPaper(body: string | null | undefined, person: string): boolean {
  const name = (person || "").trim();
  const paper = String(body || "");
  if (!name || !paper) return false;
  const re = escapeRe(name);
  return (
    new RegExp(`authorized signer is ${re}\\b`, "i").test(paper) ||
    new RegExp(`${re}\\s+as an individual`, "i").test(paper) ||
    new RegExp(`${re}\\s*\\(\\s*["']?(?:Advisor|Individual|Party)\\b`, "i").test(paper)
  );
}

export function mergeIdentityResolutionsIntoIntake(intake: string, answers: string | null | undefined): string {
  const lines = statementsOf(answers || "")
    .map((line) => canonicalizeIdentityAnswer(line))
    .filter((line): line is string => Boolean(line));
  return [intake || "", ...lines].filter(Boolean).join("\n").trim();
}

export function identityClarificationResolved(
  answersOrIntake: string | null | undefined,
  question: string,
  options?: { knownEntities?: readonly string[] },
): boolean {
  const person = personNamedInIdentityQuestion(question);
  if (!person) return false;
  const blob = String(answersOrIntake || "");
  if (!blob.trim()) return false;
  return statementsOf(blob).some((line) => {
    const canonical = canonicalizeIdentityAnswer(line, {
      knownEntities: options?.knownEntities,
      questionPerson: person,
    });
    return Boolean(canonical);
  });
}

function collectUnresolvedSubjects(args: {
  parties: readonly BindableParty[];
  intake: string;
  answers?: string | null;
  unresolvedSubjects?: readonly UnresolvedIdentitySubject[] | null;
}): UnresolvedIdentitySubject[] {
  const bound = bindRepresentativesToLegalParties(args.parties, args.intake);
  const fromRows = classifyUnresolvedIdentitySubjects(bound.unresolvedExtractionRows, args.intake);
  const fromText = parseUnresolvedIdentity([args.intake, args.answers || ""].join("\n"));
  const fromIntakeMentions = customerMentionedUnresolvedFromIntake(args.intake, bound.parties);
  const merged = [...(args.unresolvedSubjects || []), ...fromRows, ...fromText, ...fromIntakeMentions];
  const out: UnresolvedIdentitySubject[] = [];
  for (const row of merged) {
    if (isBoilerplateLegalPartyPhrase(row.name)) continue;
    if (!out.some((existing) => samePerson(existing.name, row.name))) out.push(row);
  }
  return out;
}

export function applyIdentityClarificationAnswers<T extends BindableParty>(args: {
  parties: readonly T[];
  intake: string;
  answers?: string | null;
  unresolvedSubjects?: readonly UnresolvedIdentitySubject[] | null;
}): { parties: T[]; unresolvedExtractionRows: BindableParty[]; unresolvedSubjects: UnresolvedIdentitySubject[]; clarificationQuestion: string | null } {
  const confirmationBlob = [args.intake, args.answers || ""].join("\n");
  const startingParties = args.parties.filter((party) => keepConfirmedLegalParty(party, confirmationBlob)) as T[];
  const strippedHumans = args.parties.filter(
    (party) => !startingParties.some((kept) => samePerson(kept.name, party.name)) && isLikelyHumanSignerName(party.name),
  );
  const knownEntities = startingParties.map((party) => party.name);
  const mergedIntake = mergeIdentityResolutionsIntoIntake(args.intake, args.answers);
  const bound = bindRepresentativesToLegalParties(startingParties, mergedIntake);
  let parties = bound.parties as T[];
  for (const party of startingParties) {
    if (!isLikelyHumanSignerName(party.name)) continue;
    if (parties.some((existing) => samePerson(existing.name, party.name))) continue;
    parties = parties.map((existing) =>
      samePerson(String(existing.signerName || ""), party.name) ? { ...existing, signerName: "" } : existing,
    ) as T[];
    parties = [...parties, party];
  }
  let unresolved = collectUnresolvedSubjects({
    parties: startingParties,
    intake: args.intake,
    answers: args.answers,
    unresolvedSubjects: [
      ...(args.unresolvedSubjects || []),
      ...classifyUnresolvedIdentitySubjects(strippedHumans, args.intake),
    ],
  });

  for (const line of statementsOf(args.answers || "")) {
    const canonical = canonicalizeIdentityAnswer(line, { knownEntities });
    if (!canonical) continue;
    const signer = canonical.match(/^(.+?) signer: (.+)$/);
    if (signer) {
      const entity = signer[1]!.trim();
      const person = signer[2]!.trim();
      const source = unresolved.find((row) => samePerson(row.name, person));
      const email = source?.email || emailFromText(line);
      parties = parties.map((party) =>
        partyLegalNamesMatch(party.name, entity)
          ? {
              ...party,
              signerName: party.signerName || person,
              ...(email && !party.email ? { email } : {}),
            }
          : party,
      );
      unresolved = unresolved.filter((row) => !samePerson(row.name, person));
      continue;
    }
    const own = canonical.match(/^(.+?) as an individual \((.+)\) is a contracting party$/);
    if (own) {
      const person = own[1]!.trim();
      const role = own[2]!.trim();
      if (parties.some((party) => samePerson(party.name, person))) {
        unresolved = unresolved.filter((row) => !samePerson(row.name, person));
        continue;
      }
      if (parties.length >= MAX_LEGAL_PARTIES) {
        continue;
      }
      const source =
        unresolved.find((row) => samePerson(row.name, person)) ||
        args.unresolvedSubjects?.find((row) => samePerson(row.name, person));
      const email = source?.email || emailFromText(line);
      parties = [
        ...parties,
        {
          ...(source || {}),
          name: person,
          role,
          ...(email ? { email } : {}),
        } as T,
      ];
      unresolved = unresolved.filter((row) => !samePerson(row.name, person));
    }
  }

  const explicitPeople = explicitResolvedPersonNames({
    intake: mergedIntake,
    answers: args.answers,
    knownEntities,
  });
  const callerProvidedUnresolved = args.unresolvedSubjects !== undefined && args.unresolvedSubjects !== null;
  const stillOpenNames = (args.unresolvedSubjects || [])
    .filter((row) => row.source === "customer_mentioned")
    .map((row) => row.name);
  parties = parties.map((party) => {
    const signer = String(party.signerName || "").trim();
    if (!signer) return party;
    const stillOpen = stillOpenNames.some((name) => samePerson(name, signer));
    const inferredBind =
      stillOpen &&
      !explicitPeople.some((name) => samePerson(name, signer)) &&
      (callerProvidedUnresolved || unresolved.some((row) => samePerson(row.name, signer)));
    return inferredBind ? { ...party, signerName: "" } : party;
  });
  const askable = unresolved.filter((row) => {
    if (row.source !== "customer_mentioned") return false;
    if (isBoilerplateLegalPartyPhrase(row.name)) return false;
    if (explicitPeople.some((name) => samePerson(name, row.name))) return false;
    if (parties.some((party) => samePerson(party.name, row.name))) return false;
    const persistedSigner = parties.some((party) => samePerson(String(party.signerName || ""), row.name));
    if (callerProvidedUnresolved && persistedSigner && !stillOpenNames.some((name) => samePerson(name, row.name))) {
      return false;
    }
    return true;
  });
  return {
    parties,
    unresolvedExtractionRows: unresolved.map((row) => ({
      name: row.name,
      role: row.roleHint || "party",
      ...(row.email ? { email: row.email } : {}),
    })),
    unresolvedSubjects: unresolved,
    clarificationQuestion:
      askable.length > 0 && parties.length >= 2 && parties.length < MAX_LEGAL_PARTIES
        ? identityQuestionForPerson(askable[0]!.name)
        : null,
  };
}

export function identityClarificationMaterialItem(args: {
  intakeRaw?: string | null;
  userGapAnswers?: string | null;
  parsedParties?: readonly BindableParty[] | null;
  additionalTerms?: string | null;
  unresolvedSubjects?: readonly UnresolvedIdentitySubject[] | null;
  body?: string | null;
}): MaterialMissingItem | null {
  const intake = [args.intakeRaw || "", args.additionalTerms || "", args.userGapAnswers || ""].filter(Boolean).join("\n");
  const parties = confirmedPartiesFromCustomerText(intake, args.parsedParties);
  const unresolvedSubjects = [
    ...(args.unresolvedSubjects || parseUnresolvedIdentity(intake)),
    ...customerMentionedUnresolvedFromIntake(intake, parties),
  ].filter(
    (row, index, all) =>
      !isBoilerplateLegalPartyPhrase(row.name) &&
      all.findIndex((other) => samePerson(other.name, row.name)) === index,
  );
  const applied = applyIdentityClarificationAnswers({
    parties,
    intake,
    answers: args.userGapAnswers,
    unresolvedSubjects,
  });
  const question = applied.clarificationQuestion;
  if (!question) return null;
  const person = personNamedInIdentityQuestion(question) || "this person";
  const knownEntities = applied.parties.map((party) => party.name);
  if (
    identityResolvedInPaper(args.body, person) ||
    identityClarificationResolved(args.userGapAnswers, question, { knownEntities }) ||
    confirmedIdentityResolutionLines(args.additionalTerms).some((line) =>
      Boolean(canonicalizeIdentityAnswer(line, { knownEntities, questionPerson: person })),
    )
  ) {
    return null;
  }
  return {
    id: "identity_signing_or_party",
    severity: "material",
    agreementFamily: "generic_business_agreement",
    label: "Party or representative",
    question,
    whyItMatters: `${person} was mentioned but is not a confirmed legal party until you say whether they sign for a named company or contract as themselves.`,
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

function oxfordRoleList(roles: readonly string[]): string {
  if (roles.length <= 1) return roles[0] || "";
  if (roles.length === 2) return `${roles[0]} and ${roles[1]}`;
  return `${roles.slice(0, -1).join(", ")}, and ${roles[roles.length - 1]}`;
}

function openingQuotedRole(doc: string, name: string): string | null {
  const match = doc.match(new RegExp(`${escapeRe(name)}\\s*\\(\\s*["“']([^"”']+)["”']\\s*\\)`, "i"));
  const role = match?.[1]?.trim() || "";
  return role && !/^party$/i.test(role) ? role : null;
}

function displayRoleForParty(party: BindableParty, paper?: string): string {
  if (paper && !isLikelyHumanSignerName(party.name)) {
    const quoted = openingQuotedRole(paper, party.name);
    if (quoted) return quoted;
  }
  const role = String(party.role || "").trim();
  if (role && !/^party$/i.test(role)) return role;
  return isLikelyHumanSignerName(party.name) ? "Advisor" : "Party";
}

function removeEmailFromUnrelatedNoticeStanzas(doc: string, ownerName: string, email: string): string {
  if (!email) return doc;
  const ownerRe = new RegExp(`^If to\\s+${escapeRe(ownerName)}\\b`, "i");
  const emailLine = new RegExp(`^Email:\\s*${escapeRe(email)}\\s*\\n?`, "im");
  return doc
    .split(/(?=^If to )/m)
    .map((stanza) => {
      if (!/^If to /i.test(stanza) || ownerRe.test(stanza.trimStart())) return stanza;
      return stanza.replace(emailLine, "");
    })
    .join("");
}

function ensureNoticeStanzaForParty(doc: string, name: string, email?: string): string {
  const headerRe = new RegExp(`^If to\\s+${escapeRe(name)}\\s*:`, "im");
  if (headerRe.test(doc)) {
    if (!email || new RegExp(`If to\\s+${escapeRe(name)}[\\s\\S]{0,400}${escapeRe(email)}`, "i").test(doc)) {
      return doc;
    }
    return doc.replace(
      new RegExp(`(^If to\\s+${escapeRe(name)}\\s*:\\s*\\n${escapeRe(name)}\\s*\\n)`, "im"),
      `$1Email: ${email}\n`,
    );
  }
  const block = [`If to ${name}:`, name, ...(email ? [`Email: ${email}`] : []), ""].join("\n");
  const witness = doc.search(/\bIN WITNESS WHEREOF\b/i);
  if (witness >= 0) {
    return `${doc.slice(0, witness).trimEnd()}\n\n${block}\n${doc.slice(witness)}`;
  }
  return `${doc.trimEnd()}\n\n${block}\n`;
}

function remapInvertedConsultantClientHeadings(doc: string): string {
  const declared = resolvePaidProPartyRolesFromAcceptedCorpus(doc);
  const consultant =
    declared.find((row) => row.roleLabel === "Consultant")?.legalName ||
    declared.find((row) => row.role === "service_provider")?.legalName;
  const client = declared.find((row) => row.role === "client")?.legalName;
  if (!consultant || !client) return doc;
  const witness = doc.search(/\bIN WITNESS WHEREOF\b/i);
  if (witness < 0) return doc;
  const prefix = doc.slice(0, witness);
  let tail = doc.slice(witness);
  const consultantEsc = escapeRe(consultant);
  const clientEsc = escapeRe(client);
  tail = tail.replace(
    new RegExp(`^(\\s*)CLIENT\\s*:\\s*${consultantEsc}\\.?\\s*$`, "im"),
    `$1CONSULTANT:\n${consultant}`,
  );
  tail = tail.replace(
    new RegExp(`^(\\s*)CLIENT\\s*:\\s*\\n\\s*${consultantEsc}\\.?\\s*$`, "im"),
    `$1CONSULTANT:\n${consultant}`,
  );
  tail = tail.replace(
    new RegExp(`^(\\s*)SERVICE\\s+PROVIDER\\s*:\\s*${clientEsc}\\.?\\s*$`, "im"),
    `$1CLIENT:\n${client}`,
  );
  tail = tail.replace(
    new RegExp(`^(\\s*)SERVICE\\s+PROVIDER\\s*:\\s*\\n\\s*${clientEsc}\\.?\\s*$`, "im"),
    `$1CLIENT:\n${client}`,
  );
  return `${prefix}${tail}`;
}

function clearStaleSignerNameFromOtherExecutionBlocks(doc: string, person: BindableParty): string {
  const heading = displayRoleForParty(person).toUpperCase();
  const witness = doc.search(/\bIN WITNESS WHEREOF\b/i);
  if (witness < 0) return doc;
  const prefix = doc.slice(0, witness);
  const blocks = doc.slice(witness).split(/(?=^[A-Z][A-Z\s]+:\s*$)/m);
  const nameRe = new RegExp(`^(\\s*Name:\\s*)${escapeRe(person.name)}\\s*$`, "im");
  const rewritten = blocks.map((block) => {
    const first = block.split("\n").find((line) => line.trim()) || "";
    const ownHeading = new RegExp(`^\\s*${escapeRe(heading)}\\s*:`, "i").test(first);
    return ownHeading ? block : block.replace(nameRe, "$1__________________________");
  });
  return `${prefix}${rewritten.join("")}`;
}

function ensureIndividualExecutionBlock(doc: string, person: BindableParty): string {
  const role = displayRoleForParty(person);
  const heading = role.toUpperCase();
  const witness = doc.search(/\bIN WITNESS WHEREOF\b/i);
  const tail = witness >= 0 ? doc.slice(witness) : doc;
  if (new RegExp(`^\\s*${escapeRe(heading)}\\s*:`, "im").test(tail)) return doc;
  const thin = new RegExp(
    `\\n+${escapeRe(role)}:\\s*${escapeRe(person.name)}\\s+By:[^\\n]*\\n?`,
    "i",
  );
  const stripped = doc.replace(thin, "\n");
  const block = [
    `${heading}:`,
    person.name,
    "By: __________________________",
    `Name: ${person.signerName || person.name}`,
    "Title: ________",
    "Date: _____________________________",
  ].join("\n");
  return `${stripped.trimEnd()}\n\n${block}\n`;
}

export function applyIdentityResolutionToAuthorizedPaper(
  documentText: string,
  parties: readonly BindableParty[],
): string {
  let doc = (documentText || "").replace(/\r\n/g, "\n");
  if (!doc.trim() || parties.length < 2) return doc;
  for (const party of parties) {
    if (!party.signerName || !isLikelyHumanSignerName(party.signerName)) continue;
    if (/^(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/i.test(party.signerName.trim())) continue;
    const role = party.role || "Party";
    const signerLine = new RegExp(`${escapeRe(role)}'s authorized signer is [^.\n]+`, "i");
    if (signerLine.test(doc)) {
      doc = doc.replace(signerLine, () => `${role}'s authorized signer is ${party.signerName}`);
    }
  }
  const individuals = parties.filter((party) => isLikelyHumanSignerName(party.name));
  for (const person of individuals) {
    doc = doc.replace(
      new RegExp(
        `((?:Consultant|Client|[A-Z][A-Za-z]+(?:\\s+[A-Z][A-Za-z]+)*)'s authorized signer is )${escapeRe(person.name)}`,
        "gi",
      ),
      "$1________",
    );
  }
  for (const person of individuals) {
    const role = displayRoleForParty(person, doc);
    if (!new RegExp(`\\b${escapeRe(person.name)}\\b`, "i").test(doc)) {
      doc = doc.replace(
        /(entered into by and between\s+)([\s\S]*?)(\.\s+(?:Consultant|Client|The |This |[A-Z][a-z]+ and ))/,
        (full, prefix: string, middle: string, end: string) =>
          middle.toLowerCase().includes(person.name.toLowerCase())
            ? full
            : `${prefix}${middle} and ${person.name} ("${role}")${end}`,
      );
    }
  }
  const roleLabels = parties.map((party) => displayRoleForParty(party, doc)).filter((role) => role !== "Party");
  if (roleLabels.length >= 2) {
    const collective = oxfordRoleList(roleLabels);
    doc = doc.replace(
      /[A-Z][A-Za-z]+(?:,\s+[A-Z][A-Za-z]+)*(?:,?\s+and\s+[A-Z][A-Za-z]+) may be referred to individually as a ["“]Party["”] and collectively as the ["“]Parties\.?["”]\.?/,
      `${collective} may be referred to individually as a "Party" and collectively as the "Parties".`,
    );
  }
  for (const person of individuals) {
    const email = String(person.email || "").trim();
    if (email) {
      doc = removeEmailFromUnrelatedNoticeStanzas(doc, person.name, email);
      doc = ensureNoticeStanzaForParty(doc, person.name, email);
    }
  }
  doc = remapInvertedConsultantClientHeadings(doc);
  for (const person of individuals) {
    doc = ensureIndividualExecutionBlock(doc, person);
    doc = clearStaleSignerNameFromOtherExecutionBlocks(doc, person);
  }
  return doc;
}
