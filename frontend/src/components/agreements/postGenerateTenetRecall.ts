import { isPollutedTenetQuestionHint, scoreFiveTenets } from "./proAgreementFiveTenets";
export { isPollutedTenetQuestionHint };

/** Match #56 keep floor: only score a substantive painted paid body. */
export const POST_GENERATE_SUBSTANTIVE_MIN_LEN = 1600;

export type PostGenerateTenetRecallDecision =
  | { action: "proceed"; questions: string[]; missingTenets: string[] }
  | { action: "await_gaps"; questions: string[]; missingTenets: string[] };

function cleanPartyHintFromPaintedBody(body: string): string {
  const text = (body || "").replace(/\r\n/g, "\n");
  const between = text.match(
    /\bbetween\s+([A-Z][A-Za-z0-9.'&\-]{1,20}(?:\s+[A-Z][A-Za-z0-9.'&\-]{1,20}){0,3})\s+and\s+([A-Z][A-Za-z0-9.'&\-]{1,20}(?:\s+[A-Z][A-Za-z0-9.'&\-]{1,20}){0,3})\b/,
  );
  if (!between) return "";
  for (const raw of [between[2], between[1]]) {
    const n = (raw || "").trim();
    if (
      n &&
      n.length <= 40 &&
      !isPollutedTenetQuestionHint(n) &&
      !/^(?:client|the\s+client|party\s*[ab12]|service\s+provider|the\s+company)$/i.test(n)
    ) {
      return n;
    }
  }
  return "";
}

function oneLinerForMissingTenet(topic: string, who: string): string {
  switch (topic) {
    case "parties":
      return "Who are the parties to this agreement? Please provide full legal names.";
    case "scope":
      return "What is the purpose or scope of this agreement?";
    case "payment":
      return "How much is paid, and when?";
    case "term":
      return who
        ? `How long does this agreement with ${who} last?`
        : "How long does this agreement last?";
    case "governing_law":
      return who
        ? `Which state's law should govern this agreement with ${who}?`
        : "Which state's law should govern this agreement?";
    default:
      return `Please clarify: ${topic}`;
  }
}

/**
 * 2–5 clean one-liner questions for tenets still missing from a painted Pro body.
 * Never pastes outline / draft-dump text into the label.
 */
export function buildPostGenerateMissingTenetQuestions(paintedBody: string): string[] {
  const score = scoreFiveTenets(paintedBody || "");
  const who = cleanPartyHintFromPaintedBody(paintedBody || "");
  return score.missingTenets.slice(0, 5).map((topic) => oneLinerForMissingTenet(topic, who));
}

/**
 * After a paid OpenAI draft paints: ask only for tenets still missing from THAT body.
 * One-cycle cap via `alreadyAsked`. Incomplete short/skeleton bodies do not ask.
 */
export function evaluatePostGenerateTenetRecall(args: {
  paintedBody: string;
  alreadyAsked: boolean;
  minBodyLen?: number;
  /** Original checkout / visitor dump — never re-ask a tenet already stated there. */
  originalIntake?: string | null;
}): PostGenerateTenetRecallDecision {
  const empty = { action: "proceed" as const, questions: [] as string[], missingTenets: [] as string[] };
  if (args.alreadyAsked) return empty;
  const painted = (args.paintedBody || "").trim();
  const minLen = args.minBodyLen ?? POST_GENERATE_SUBSTANTIVE_MIN_LEN;
  if (painted.length < minLen) return empty;
  const score = scoreFiveTenets(painted);
  const intakeScore = args.originalIntake ? scoreFiveTenets(args.originalIntake) : null;
  const missingTenets = score.missingTenets.filter((topic) => {
    if (!intakeScore) return true;
    if (topic === "governing_law") return !intakeScore.governingLaw;
    if (topic === "payment") return !intakeScore.payment;
    if (topic === "parties") return !intakeScore.parties;
    if (topic === "scope") return !intakeScore.scope;
    if (topic === "term") return !intakeScore.term;
    return true;
  });
  if (missingTenets.length === 0) return empty;
  const who = cleanPartyHintFromPaintedBody(painted);
  const questions = missingTenets
    .slice(0, 5)
    .map((topic) => oneLinerForMissingTenet(topic, who).replace(/\s+/g, " ").trim())
    .filter((q) => q.length > 0 && q.length <= 160 && !/[\n\r]/.test(q));
  if (questions.length === 0) return empty;
  return {
    action: "await_gaps",
    questions: questions.slice(0, 5),
    missingTenets: missingTenets.slice(0, 5),
  };
}
