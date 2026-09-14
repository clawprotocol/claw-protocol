/** Targeted completion meaning for consulting work — not a keyword warning and not a SaaS acceptance process. */

export const UNCONFIRMED_COMPLETION_CRITERIA_QUESTION =
  "What should mark completion of the consulting work?";

const COMPLETION_MEANING_RE =
  /\b(?:complete when|completion (?:is|means|occurs)|work is complete when|written confirmation that|accepted when (?:the )?client)\b/i;
const HOSTED_SAAS_RE =
  /\b(?:saas|software as a service|hosted platform|subscription agreement|annual subscription)\b/i;
const NO_PROFESSIONAL_SERVICES_RE =
  /\b(?:no professional services|hosted platform only|hosted platform access)\b/i;
const CONSULTING_DEAL_RE =
  /\b(?:consulting|professional services|implementation work|ai workflow implementation)\b/i;

export function unconfirmedCompletionCriteriaQuestion(scopeCue?: string | null): string {
  if (/ai workflow implementation/i.test(scopeCue || "")) {
    return "What should mark completion of the AI workflow implementation work?";
  }
  return UNCONFIRMED_COMPLETION_CRITERIA_QUESTION;
}

export function isCompletionCriteriaQuestion(question: string): boolean {
  return /^What should mark completion of /.test((question || "").trim());
}

export function isHostedSaasDeal(intake: string, body = ""): boolean {
  const blob = `${intake}\n${body}`;
  return HOSTED_SAAS_RE.test(blob) && NO_PROFESSIONAL_SERVICES_RE.test(blob);
}

export function hasCompletionMeaning(text: string): boolean {
  return COMPLETION_MEANING_RE.test(text || "");
}

export function completionCriteriaMaterialItem(args: {
  intakeRaw?: string | null;
  userGapAnswers?: string | null;
  body?: string | null;
}): {
  id: "consulting_completion_meaning";
  severity: "material";
  label: string;
  question: string;
  whyItMatters: string;
  suggestedAnswerFormat: string;
  affectsSections: string[];
  canProceedWithoutAnswer: true;
} | null {
  const intake = args.intakeRaw || "";
  const answers = args.userGapAnswers || "";
  const body = args.body || "";
  if (isHostedSaasDeal(intake, body)) return null;
  if (!CONSULTING_DEAL_RE.test(`${intake}\n${body}`)) return null;
  if (hasCompletionMeaning(`${answers}\n${intake}`) || hasCompletionMeaning(body)) return null;
  return {
    id: "consulting_completion_meaning",
    severity: "material",
    label: "Completion meaning",
    question: unconfirmedCompletionCriteriaQuestion(`${intake}\n${body}`),
    whyItMatters:
      "This consulting deal names the work but does not say what marks completion. Adding the word approval is not enough.",
    suggestedAnswerFormat:
      "e.g. Completion is Client's written confirmation that the implemented AI workflow is in operational use.",
    affectsSections: ["Scope", "Services"],
    canProceedWithoutAnswer: true,
  };
}
