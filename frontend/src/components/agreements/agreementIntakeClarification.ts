/**
 * Universal intake clarification — turn blocked / incomplete / counsel-prep prompts
 * into guided remediation with a suggested draftable rewrite.
 * Product-wide: no account, tier, or user branching.
 */

export type AgreementIntakeClarificationKind =
  | "counsel_prep"
  | "missing_named_parties"
  | "too_sparse"
  | "needs_commercial_basics"
  | "ambiguous_request";

export type AgreementIntakeClarification = {
  kind: AgreementIntakeClarificationKind;
  /** Short title for the panel */
  title: string;
  /** One-sentence why we paused */
  why: string;
  /** Facts we could salvage from the prompt */
  whatWeHeard: string[];
  /** Concrete revision steps */
  guidedSteps: string[];
  /** Ready-to-paste draftable rewrite when we can invent one from facts */
  suggestedRewrite: string | null;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
};

const DRAFT_INTENT_RE =
  /\b(?:draft|create|write|prepare|generate)\b[\s\S]{0,80}\b(?:agreement|contract|msa|sow|nda|pilot\s+agreement|order\s+form)\b/i;

const BETWEEN_PARTIES_RE = /\bbetween\b[\s\S]{0,160}\band\b/i;

const COUNSEL_PREP_SIGNAL_RE =
  /\b(?:help\s+me\s+figure\s+out|what\s+positions\s+i\s+should\s+take|negotiation\s+plan|fallback\s+language|clause\s+edits|deal\s+risks?\s+vs|lawyering\s+the\s+deal|not\s+looking\s+for\s+a\s+law\s+school\s+memo|confirm\s+internally\s+before|push\s+them\s+back|accept\s+their\s+.{0,40}with\s+edits|which\s+terms\s+are\s+actual\s+deal\s+risks)\b/i;

const NUMBERED_ADVISORY_QUESTIONS_RE =
  /(?:^|\n)\s*(?:1[\).\]]|1\.)\s+(?:whether|which|what|how)\b[\s\S]{40,}(?:^|\n)\s*(?:2[\).\]]|2\.)\s+/im;

const MONEY_RE =
  /\$\s?\d[\d,]*(?:\.\d+)?\s*(?:k|m)?|\b\d[\d,]*(?:\.\d+)?\s*(?:dollars?|usd)\b|\b\d+\s*k\b/i;
const TERM_RE =
  /\b(?:\d+\s*[-–]?\s*(?:day|days|week|weeks|month|months|year|years)|sixty[-\s]?day|6[-\s]?week|twelve[-\s]?month)\b/i;
const SAAS_PILOT_RE = /\b(?:saas|pilot\s+agreement|paid\s+pilot|annual\s+(?:saas|subscription))\b/i;
const NDA_RE = /\b(?:mutual\s+)?(?:non[-\s]?disclosure|nda)\b/i;
const SERVICES_RE = /\b(?:services?\s+agreement|consulting|design|development|freelance)\b/i;

function extractMoneyPhrases(raw: string): string[] {
  const out: string[] = [];
  const re = /\$\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:k|m|K|M))?(?:\s*[-–]\s*\$\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:k|m))?)?|\b\d+\s*k(?:-ish)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) && out.length < 4) {
    out.push(m[0].replace(/\s+/g, " ").trim());
  }
  return out;
}

function extractTermPhrase(raw: string): string | null {
  const m = raw.match(
    /\b(?:\d+\s*[-–]?\s*(?:day|days|week|weeks|month|months)|sixty[-\s]?day|6[-\s]?week)\b(?:\s+pilot)?/i,
  );
  return m?.[0]?.replace(/\s+/g, " ").trim() ?? null;
}

function extractTopicChips(raw: string): string[] {
  const chips: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/\bunlimited\s+liability\b/i, "liability caps"],
    [/\b(?:work\s+product|IP\s+ownership|intellectual\s+property)\b/i, "IP / work product"],
    [/\bterminat(?:e|ion).{0,40}convenience\b/i, "termination for convenience"],
    [/\baudit\s+rights?\b/i, "audit rights"],
    [/\bmost[-\s]?favored\b/i, "most-favored pricing"],
    [/\bindemnif/i, "indemnity"],
    [/\bdelet(?:e|ion).{0,40}data\b/i, "data deletion"],
    [/\bmodel\s+training\b/i, "no model-training use of data"],
    [/\bSOC\s*2\b/i, "SOC 2 security representations"],
    [/\bconfidential/i, "confidentiality"],
  ];
  for (const [re, label] of checks) {
    if (re.test(raw)) chips.push(label);
  }
  return chips.slice(0, 8);
}

function buildSaasPilotSuggestedRewrite(raw: string): string {
  const money = extractMoneyPhrases(raw);
  const term = extractTermPhrase(raw) || "60-day";
  const fee = money[0] || "$15,000";
  const conversion = money.find((m) => /150|annual/i.test(m) || /k/i.test(m) && m !== fee) || "$150,000";
  const topics = extractTopicChips(raw);
  const topicLine =
    topics.length > 0
      ? ` Cover these topics with balanced commercial positions: ${topics.join("; ")}.`
      : "";
  return (
    `Draft a ${term} paid SaaS pilot agreement between [Your Company Legal Name] and [Customer Legal Name] for ${fee}. ` +
    `If the pilot succeeds, it may convert to an annual SaaS subscription near ${conversion}.` +
    topicLine +
    ` Use clear, practical language. Governing law: [State].`
  );
}

function buildGenericSuggestedRewrite(raw: string): string | null {
  if (SAAS_PILOT_RE.test(raw) || (MONEY_RE.test(raw) && TERM_RE.test(raw) && /pilot/i.test(raw))) {
    return buildSaasPilotSuggestedRewrite(raw);
  }
  if (NDA_RE.test(raw)) {
    return (
      "Draft a mutual non-disclosure agreement between [Party A Legal Name] and [Party B Legal Name] " +
      "covering confidential business information for a 2-year term. Governing law: [State]."
    );
  }
  if (SERVICES_RE.test(raw) || MONEY_RE.test(raw)) {
    const fee = extractMoneyPhrases(raw)[0] || "[fee amount]";
    const term = extractTermPhrase(raw) || "[term]";
    return (
      `Draft a services agreement between [Provider Legal Name] and [Client Legal Name] for ${term} at ${fee}. ` +
      "Describe the services, payment schedule, ownership of deliverables, and termination. Governing law: [State]."
    );
  }
  return (
    "Draft a [agreement type] between [Party A Legal Name] and [Party B Legal Name] for [scope], " +
    "fee [amount], term [duration]. Governing law: [State]."
  );
}

function heardFromCounselPrep(raw: string): string[] {
  const heard: string[] = [];
  if (SAAS_PILOT_RE.test(raw) || /pilot/i.test(raw)) {
    heard.push("You’re evaluating a customer’s proposed pilot paper (not asking us to draft your form yet).");
  }
  const term = extractTermPhrase(raw);
  if (term) heard.push(`Pilot term mentioned: ${term}.`);
  const money = extractMoneyPhrases(raw);
  if (money.length) heard.push(`Economics mentioned: ${money.join(", ")}.`);
  if (/\bmid[-\s]?market\b/i.test(raw)) heard.push("Counterparty described as a mid-market customer (legal name not given).");
  if (/\bMSA|order\s+form|DPA\b/i.test(raw)) {
    heard.push("You’re comparing their pilot agreement vs your MSA / order form / DPA process.");
  }
  const topics = extractTopicChips(raw);
  if (topics.length) heard.push(`Risk topics called out: ${topics.join("; ")}.`);
  if (NUMBERED_ADVISORY_QUESTIONS_RE.test(raw)) {
    heard.push("The ask is a numbered negotiation / counsel checklist, not a draft request.");
  }
  return heard;
}

export function buildAgreementIntakeClarification(rawIntake: string): AgreementIntakeClarification | null {
  const raw = (rawIntake || "").replace(/\r\n/g, "\n").trim();
  if (raw.length < 6) return null;

  const hasDraftIntent = DRAFT_INTENT_RE.test(raw);
  const hasBetweenParties = BETWEEN_PARTIES_RE.test(raw);
  const counselSignals = COUNSEL_PREP_SIGNAL_RE.test(raw);
  const numberedAdvisory = NUMBERED_ADVISORY_QUESTIONS_RE.test(raw);
  const hasMoney = MONEY_RE.test(raw);
  const hasTerm = TERM_RE.test(raw);

  if (hasDraftIntent && hasBetweenParties) return null;

  if ((counselSignals && numberedAdvisory && !hasBetweenParties) || (counselSignals && raw.length >= 900 && !hasDraftIntent)) {
    const suggested = buildSaasPilotSuggestedRewrite(raw);
    return {
      kind: "counsel_prep",
      title: "This reads like negotiation prep — not a draftable agreement yet",
      why:
        "LawDog creates executable agreements from named parties, scope, fee, and term. " +
        "It does not produce attorney negotiation memos or markups of the other side’s paper.",
      whatWeHeard: heardFromCounselPrep(raw),
      guidedSteps: [
        "Name both legal entities (your company and the customer).",
        "Say you want a draft (not advice) — e.g. “Draft a 60-day SaaS pilot agreement between…”.",
        "Keep the commercial facts you already listed (fee, term, conversion, key risk topics).",
        "Save negotiation strategy / “what to push” questions for your attorney or AE playbook outside LawDog.",
      ],
      suggestedRewrite: suggested,
      primaryCtaLabel: "Use suggested draft request",
      secondaryCtaLabel: "I’ll edit the prompt myself",
    };
  }

  if (raw.length < 40 && !hasBetweenParties) {
    return {
      kind: "too_sparse",
      title: "Add a few basics so we can draft",
      why: "We need named parties and what the agreement is for before LawDog can build a draft.",
      whatWeHeard: raw.length ? [`You wrote: “${raw.slice(0, 120)}${raw.length > 120 ? "…" : ""}”`] : [],
      guidedSteps: [
        "Name Party A and Party B (legal names).",
        "Say the agreement type (services, NDA, pilot, consulting, etc.).",
        "Add fee and term if you know them.",
      ],
      suggestedRewrite: buildGenericSuggestedRewrite(raw),
      primaryCtaLabel: "Use starter template",
      secondaryCtaLabel: "Keep editing",
    };
  }

  if ((hasMoney || hasTerm || SAAS_PILOT_RE.test(raw) || SERVICES_RE.test(raw) || NDA_RE.test(raw)) && !hasBetweenParties) {
    const suggested = buildGenericSuggestedRewrite(raw);
    const heard: string[] = [];
    if (hasMoney) heard.push(`Fee / economics mentioned: ${extractMoneyPhrases(raw).join(", ") || "yes"}.`);
    if (hasTerm) heard.push(`Term mentioned: ${extractTermPhrase(raw) || "yes"}.`);
    if (SAAS_PILOT_RE.test(raw)) heard.push("Looks like a SaaS / pilot deal.");
    if (NDA_RE.test(raw)) heard.push("Looks like an NDA request.");
    heard.push("Legal party names are missing or not in a “between A and B” form.");
    return {
      kind: "missing_named_parties",
      title: "Name the parties to continue",
      why: "We can see commercial details, but not clear legal names for both sides.",
      whatWeHeard: heard,
      guidedSteps: [
        "Add: “between [Your Company LLC] and [Customer Inc.].”",
        "Keep the fee, term, and scope you already wrote.",
        "Then tap Create draft again.",
      ],
      suggestedRewrite: suggested,
      primaryCtaLabel: "Use suggested draft request",
      secondaryCtaLabel: "I’ll add parties myself",
    };
  }

  if (hasBetweenParties && !hasDraftIntent && !hasMoney && !hasTerm && raw.length < 120) {
    return {
      kind: "needs_commercial_basics",
      title: "Add scope, fee, or term",
      why: "Parties are clearer than the deal itself — add what they’re agreeing to.",
      whatWeHeard: ["A between-parties phrase was detected.", "Fee / term / scope still look thin."],
      guidedSteps: [
        "Add what work or rights the agreement covers.",
        "Add payment (if any) and how long it lasts.",
        "Start with “Draft a … agreement between …”.",
      ],
      suggestedRewrite: buildGenericSuggestedRewrite(raw),
      primaryCtaLabel: "Use suggested draft request",
      secondaryCtaLabel: "Keep editing",
    };
  }

  if (raw.length >= 400 && !hasDraftIntent && !hasBetweenParties) {
    return {
      kind: "ambiguous_request",
      title: "We need a clearer draft request",
      why: "This prompt is detailed, but it isn’t shaped as “draft an agreement between named parties.”",
      whatWeHeard: [
        `About ${raw.length.toLocaleString()} characters of notes.`,
        hasMoney ? "Some economics were mentioned." : "Economics were not clearly stated.",
        hasTerm ? "A time period was mentioned." : "Term was not clearly stated.",
      ],
      guidedSteps: [
        "Lead with: “Draft a [type] agreement between [A] and [B]…”.",
        "Pull only the deal facts you want in the contract (drop advice questions).",
        "Or use the suggested rewrite and fill in the bracketed names.",
      ],
      suggestedRewrite: buildGenericSuggestedRewrite(raw),
      primaryCtaLabel: "Use suggested draft request",
      secondaryCtaLabel: "I’ll rewrite it",
    };
  }

  return null;
}

/** Backward-compatible boolean gate used by create-submit paths. */
export type AgreementIntakeCapabilityDecision =
  | { ok: true }
  | {
      ok: false;
      code: AgreementIntakeClarificationKind;
      userMessage: string;
      clarification: AgreementIntakeClarification;
    };

function clarificationToUserMessage(c: AgreementIntakeClarification): string {
  const heard = c.whatWeHeard.length ? `\n\nWhat we heard:\n- ${c.whatWeHeard.join("\n- ")}` : "";
  const steps = `\n\nHow to fix it:\n${c.guidedSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
  const suggest = c.suggestedRewrite ? `\n\nSuggested draft request:\n${c.suggestedRewrite}` : "";
  return `${c.title}\n\n${c.why}${heard}${steps}${suggest}`;
}

export function assessAgreementIntakeCapability(rawIntake: string): AgreementIntakeCapabilityDecision {
  const clarification = buildAgreementIntakeClarification(rawIntake);
  if (!clarification) return { ok: true };
  return {
    ok: false,
    code: clarification.kind,
    userMessage: clarificationToUserMessage(clarification),
    clarification,
  };
}

export type IntentionalCreateDraftSubmitDecision =
  | { action: "proceed"; text: string }
  | {
      action: "block_capability";
      text: string;
      message: string;
      clarification: AgreementIntakeClarification;
    }
  | { action: "noop" };

export function evaluateIntentionalCreateDraftSubmit(rawIntake: string): IntentionalCreateDraftSubmitDecision {
  const text = (rawIntake || "").replace(/\r\n/g, "\n").trim();
  if (text.length < 6) return { action: "noop" };
  const capability = assessAgreementIntakeCapability(text);
  if (!capability.ok) {
    return {
      action: "block_capability",
      text,
      message: capability.userMessage,
      clarification: capability.clarification,
    };
  }
  return { action: "proceed", text };
}
