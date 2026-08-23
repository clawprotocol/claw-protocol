/**
 * Free two-party dumps that already state parties + scope must ASK missing
 * payment / term / governing law BEFORE any free starter paint.
 *
 * #90 correctly skipped the too-thin suggested-draft dead-end. This module is
 * the next gate: do not land a hollow Party A/B page with empty payment/law.
 * After-pay paint is out of scope — callers must skip this on entitled / paid paths.
 */

import {
  buildLocalMissingTenetQuestions,
  getRequiredClarificationTopics,
  scoreFiveTenets,
  shouldSkipAskAndRenderImmediately,
} from "./proAgreementFiveTenets";
import { validateFreeStarterGeneratedBody } from "./freeStarterBodyValidation";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import { emptyStarterCheckoutPendingShell } from "./starterMultiPartyProGate";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { IntakeBlockingField } from "./intakeClarificationPolicy";
import { extractStatedTwoPartyHiringPair } from "./intakeNamedPartyFallback";

export { extractStatedTwoPartyHiringPair } from "./intakeNamedPartyFallback";

export type FreeStarterMissingTenetAskDecision =
  | {
      action: "ask";
      topics: string[];
      questions: string[];
      missingKeys: IntakeBlockingField[];
    }
  | { action: "paint"; topics: []; questions: []; missingKeys: [] };

const COMMERCIAL_TENETS = new Set(["payment", "term", "governing_law"]);

const TOPIC_TO_KEY: Record<string, IntakeBlockingField> = {
  parties: "parties",
  scope: "purpose",
  payment: "payment_terms",
  term: "duration",
  governing_law: "jurisdiction",
};

const HOLLOW_PARTY_NAME_RE = /^(?:party\s*[ab12]|client|service provider|the client|the service provider)$/i;

export function tenetTopicsToMissingKeys(topics: string[]): IntakeBlockingField[] {
  const keys: IntakeBlockingField[] = [];
  for (const topic of topics) {
    const key = TOPIC_TO_KEY[topic];
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys.slice(0, 5);
}

/**
 * Two named parties + stated scope, but payment and/or term and/or law missing
 * → ask those tenets (2–5). All five present → paint. Never invent term.
 */
export function evaluateFreeStarterMissingTenetAsk(
  intakeText: string,
  draft?: Parameters<typeof scoreFiveTenets>[1],
): FreeStarterMissingTenetAskDecision {
  const text = (intakeText || "").trim();
  if (!text) {
    return { action: "paint", topics: [], questions: [], missingKeys: [] };
  }
  if (shouldSkipAskAndRenderImmediately(text, draft)) {
    return { action: "paint", topics: [], questions: [], missingKeys: [] };
  }
  const score = scoreFiveTenets(text, draft);
  const topics = getRequiredClarificationTopics(text, draft);
  const missingCommercial = topics.filter((t) => COMMERCIAL_TENETS.has(t));
  if (score.parties && score.scope && missingCommercial.length > 0) {
    const askTopics = topics.filter((t) => t !== "parties" && t !== "scope").slice(0, 5);
    const questions = buildLocalMissingTenetQuestions(text, draft).filter((q) => {
      if (score.parties && /who are the parties/i.test(q)) return false;
      if (score.scope && /purpose or scope/i.test(q)) return false;
      return true;
    });
    return {
      action: "ask",
      topics: askTopics,
      questions: questions.slice(0, 5),
      missingKeys: tenetTopicsToMissingKeys(askTopics),
    };
  }
  return { action: "paint", topics: [], questions: [], missingKeys: [] };
}

export function shouldAskMissingTenetsBeforeFreePaint(
  intakeText: string,
  draft?: Parameters<typeof scoreFiveTenets>[1],
): boolean {
  return evaluateFreeStarterMissingTenetAsk(intakeText, draft).action === "ask";
}

export function buildSilentDraftForFreeMissingTenetAsk(intakeText: string): ParsedDraftShape {
  const structured = parseIntakeToStructuredAgreement(intakeText);
  const stated = extractStatedTwoPartyHiringPair(intakeText);
  const fromStructured = (structured.parties || [])
    .map((n) => n.trim())
    .filter((n) => n && !HOLLOW_PARTY_NAME_RE.test(n));
  const parties =
    stated ||
    (fromStructured.length >= 2
      ? fromStructured.slice(0, 2).map((name, i) => ({
          name,
          role: i === 0 ? "client" : "service_provider",
        }))
      : []);
  return {
    ...emptyStarterCheckoutPendingShell(),
    title: "Services Agreement",
    parties,
    purpose: structured.scope || "",
    payment_terms: structured.payment || "",
    duration: structured.term || null,
    jurisdiction: structured.governing_law || "",
  };
}

function draftPartiesAreHollow(draft: ParsedDraftShape | null | undefined): boolean {
  const names = (draft?.parties || []).map((p) => (p?.name || "").trim()).filter(Boolean);
  if (names.length < 2) return true;
  return names.filter((n) => HOLLOW_PARTY_NAME_RE.test(n)).length >= 2;
}

function partyListIncludesStatedHiringPeople(
  parties: { name?: string }[] | null | undefined,
  stated: { name: string }[],
): boolean {
  const blob = (parties || []).map((p) => (p?.name || "").trim().toLowerCase()).join(" | ");
  if (!blob) return false;
  return stated.every((p) => {
    const person = p.name.replace(/\s+of\s+.+$/i, "").trim().toLowerCase();
    return person.length >= 3 && blob.includes(person);
  });
}

function partyListLooksLikeOrgOnlyOfHiringPair(
  currentNames: string[],
  stated: { name: string }[],
): boolean {
  if (currentNames.length !== 2 || stated.length !== 2) return false;
  const orgs = stated
    .map((p) => (p.name.match(/\s+of\s+(.+)$/i)?.[1] || "").trim().toLowerCase())
    .filter((o) => o.length >= 3);
  if (orgs.length !== 2) return false;
  const cur = currentNames.map((n) => n.toLowerCase());
  return orgs.every((org) => cur.some((c) => c.includes(org) || org.includes(c)));
}

/** If parse emitted Party A/B (or org-only slots) but the dump named people, keep the dump names (two parties). */
export function seedStatedTwoPartyNamesOnHollowDraft(
  draft: ParsedDraftShape,
  intakeText: string,
): ParsedDraftShape {
  const silent = buildSilentDraftForFreeMissingTenetAsk(intakeText);
  if (silent.parties.length !== 2) return draft;
  if (silent.parties.some((p) => HOLLOW_PARTY_NAME_RE.test(p.name))) return draft;
  const current = (draft?.parties || []).map((p) => (p?.name || "").trim()).filter(Boolean);
  if (current.length > 2) return draft;
  if (draftPartiesAreHollow(draft) || partyListLooksLikeOrgOnlyOfHiringPair(current, silent.parties)) {
    return { ...draft, parties: silent.parties };
  }
  if (partyListIncludesStatedHiringPeople(draft.parties, silent.parties)) return draft;
  return draft;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Visitor-visible body must carry the dump names, not just party metadata.
 * Expands person-only slots and Party A/B to the stated two-party hiring pair.
 */
export function ensureStatedTwoPartyHiringNamesInBody(body: string, intakeText: string): string {
  const pair = extractStatedTwoPartyHiringPair(intakeText);
  if (!pair || pair.length !== 2) return body;
  let out = String(body || "");
  if (!out.trim()) return out;
  out = out.replace(/\bParty A\b/g, pair[0].name);
  out = out.replace(/\bParty B\b/g, pair[1].name);
  for (const party of pair) {
    const person = party.name.replace(/\s+of\s+.+$/i, "").trim();
    if (person.length < 3 || person.toLowerCase() === party.name.toLowerCase()) continue;
    if (!out.includes(party.name)) {
      out = out.replace(new RegExp(`\\b${escapeRegExp(person)}\\b(?!\\s+of\\s+)`, "g"), party.name);
    }
  }
  return out;
}

export function mergeNumberedTenetAnswersIntoIntake(
  intake: string,
  topics: string[],
  numberedAnswers: string,
): string {
  const lines = [(intake || "").trim()].filter(Boolean);
  topics.forEach((topic, i) => {
    const pattern = new RegExp(`(?:^|\\n)\\s*${i + 1}[.):]+\\s*([^\\n]+)`, "i");
    const answer = (numberedAnswers.match(pattern)?.[1] || "").trim();
    if (!answer) return;
    if (topic === "payment") lines.push(`Payment: ${answer}`);
    else if (topic === "term") lines.push(`Term: ${answer}`);
    else if (topic === "governing_law") lines.push(`Governing law: ${answer}`);
    else if (topic === "parties") lines.push(`Parties: ${answer}`);
    else if (topic === "scope") lines.push(`Scope: ${answer}`);
  });
  return lines.join("\n");
}

const PARTY_AB_RE = /\bParty\s+[AB]\b/i;
const EMPTY_PAYMENT_HEADING_RE = /Payment Terms\s*(?:\n\s*){0,2}(?:\n\s*\d+\.|\n\s*$|$)/i;
const EMPTY_LAW_HEADING_RE = /Governing Law\s*(?:\n\s*){0,2}(?:\n\s*\d+\.|\n\s*$|$)/i;
const INVENTED_EXECUTION_TERM_RE = /Effective Date:\s*upon full execution by (?:both|all) parties/i;

/**
 * A hollow Party A/B page with blank payment/law is never a valid free landing.
 * When the dump still needs a missing-tenet ask, no body is a valid landing.
 */
export function isValidFreeStarterLanding(body: string, intake: string): boolean {
  if (shouldAskMissingTenetsBeforeFreePaint(intake)) return false;
  const text = (body || "").trim();
  if (!text) return false;
  const score = scoreFiveTenets(intake);
  if (score.parties && PARTY_AB_RE.test(text)) return false;
  if (!score.payment && EMPTY_PAYMENT_HEADING_RE.test(text)) return false;
  if (!score.governingLaw && EMPTY_LAW_HEADING_RE.test(text)) return false;
  if (!score.term && INVENTED_EXECUTION_TERM_RE.test(text) && !/\b\d+\s*(?:day|week|month|year)/i.test(text)) {
    return false;
  }
  return validateFreeStarterGeneratedBody(text, intake).valid;
}
