/**
 * Universal intake clarification — turn blocked / incomplete / counsel-prep prompts
 * into guided remediation with a suggested draftable rewrite.
 * Product-wide: no account, tier, or user branching.
 *
 * For overloaded negotiation notes: salvage every commercial fact we can detect
 * (economics, term, paper choice, risk topics, data scope) into whatWeHeard + rewrite.
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
  /\b(?:draft|create|write|prepare|generate)\b[\s\S]{0,80}\b(?:agreement|contract|msa|sow|nda|pilot\s+agreement|order\s+form|subscription\s+agreement)\b/i;

const BETWEEN_PARTIES_RE = /\bbetween\b[\s\S]{0,160}\band\b/i;

const COUNSEL_PREP_SIGNAL_RE =
  /\b(?:help\s+me\s+(?:figure\s+out|thinking\s+through)|what\s+positions\s+i\s+should\s+take|negotiation\s+plan|fallback\s+(?:language|positions)|clause\s+edits|deal\s+(?:risks?|guidance)|lawyering\s+the\s+deal|not\s+looking\s+for\s+a\s+(?:law\s+school\s+)?memo|confirm\s+(?:internally|with\s+security|with\s+.{0,20}legal)\s+before|push\s+them\s+back|accept\s+their\s+.{0,40}(?:with\s+edits|paper)|which\s+terms\s+are\s+(?:actual\s+)?(?:deal\s+)?risks|AE[-\s]?friendly\s+note|redline\s+concepts|needs?\s+attorney\s+review)\b/i;

const NUMBERED_ADVISORY_QUESTIONS_RE =
  /(?:^|\n)\s*(?:1[\).\]]|1\.)\s+(?:whether|which|what|how|where)\b[\s\S]{40,}(?:^|\n)\s*(?:2[\).\]]|2\.)\s+/im;

const MONEY_RE =
  /\$\s?\d[\d,]*(?:\.\d+)?\s*(?:k|m)?|\b\d[\d,]*(?:\.\d+)?\s*(?:dollars?|usd|acv)\b|\b\d+\s*k\b/i;
const TERM_RE =
  /\b(?:\d+\s*[-–]?\s*(?:day|days|week|weeks|month|months|year|years)|sixty[-\s]?day|6[-\s]?week|twelve[-\s]?month)\b/i;
const SAAS_RE = /\b(?:saas|software\s+as\s+a\s+service|subscription)\b/i;
const PILOT_RE = /\b(?:pilot\s+agreement|paid\s+pilot|\bpilot\b)\b/i;
const NDA_RE = /\b(?:mutual\s+)?(?:non[-\s]?disclosure|nda)\b/i;
const SERVICES_RE = /\b(?:services?\s+agreement|consulting|design|development|freelance)\b/i;

/** Universal commercial / risk topic detectors — order is display priority. */
const TOPIC_CHECKS: ReadonlyArray<[RegExp, string]> = [
  [/\bunlimited\s+liability\b|\bliability\s+caps?\b|\bliability\s+for\b/i, "capped (not unlimited) liability"],
  [/\b99\.9\s*%|\buptime\s+SLA\b|\bservice\s+credits?\b|\bSLA\b/i, "uptime SLA / service credits"],
  [/\bcustom\s+security\b|\bsecurity\s+obligations?\b|\bsecurity\s+program\b|\bsecurity\s+commitments?\b/i, "security commitments aligned to your program"],
  [/\baudit\s+rights?\b|\bon[-\s]?site\s+audits?\b|\binterviews?\s+with\s+(?:our\s+)?personnel\b/i, "scoped audit rights"],
  [/\bsubprocessors?\b/i, "subprocessor notice / approval limits"],
  [/\bterminat(?:e|ion).{0,48}convenience\b|\b30[-\s]?day\s+termination\b/i, "termination for convenience"],
  [
    /\bderivative\s+works?\b|\bownership\s+of\s+(?:all\s+)?(?:data|configurations?|reports?|outputs?)\b|\bIP\s+(?:ownership|claims?)\b|\bwork\s+product\b|\bintellectual\s+property\b/i,
    "IP / outputs / data ownership",
  ],
  [/\bindemnit/i, "balanced indemnity"],
  [/\bwithhold\s+payment\b|\bpayment\s+if\s+there.?s\s+any\s+dispute\b|\bpayment\s+disputes?\b/i, "payment dispute / withhold rights"],
  [/\binternal\s+policies\b|\bpolicies\s+even\s+if\s+they\s+change\b/i, "no open-ended policy change obligations"],
  [/\bmost[-\s]?favored\b/i, "most-favored pricing"],
  [/\bdelet(?:e|ion).{0,40}data\b/i, "data deletion"],
  [/\bmodel\s+training\b/i, "no model-training use of data"],
  [/\bSOC\s*2\b/i, "SOC 2 security representations"],
  [/\bconfidential/i, "confidentiality"],
  [/\bDPA\b|\bdata\s+processing\b/i, "DPA / data processing terms"],
];

function extractMoneyPhrases(raw: string): string[] {
  const out: string[] = [];
  const re =
    /\$\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:k|m|K|M))?(?:\s*ACV)?|\b\d+\s*k(?:-ish)?(?:\s*ACV)?\b|\b\d[\d,]*\s*(?:dollars?|usd)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) && out.length < 4) {
    out.push(m[0].replace(/\s+/g, " ").trim());
  }
  return out;
}

function extractTermPhrase(raw: string): string | null {
  const m = raw.match(
    /\b(?:\d+\s*[-–]?\s*(?:day|days|week|weeks|month|months|year|years)|sixty[-\s]?day|6[-\s]?week|twelve[-\s]?month)\b/i,
  );
  return m?.[0]?.replace(/\s+/g, " ").trim() ?? null;
}

function extractTopicChips(raw: string): string[] {
  const chips: string[] = [];
  const matchedChecks: Array<[RegExp, string]> = [];
  for (const check of TOPIC_CHECKS) {
    if (check[0].test(raw)) {
      chips.push(check[1]);
      matchedChecks.push(check);
    }
  }
  // Supplement with ask-list bullets that no structured detector already covered.
  for (const bullet of extractAskBullets(raw)) {
    if (matchedChecks.some(([re]) => re.test(bullet))) continue;
    if (chips.some((c) => c.toLowerCase() === bullet.toLowerCase())) continue;
    chips.push(bullet);
    if (chips.length >= 14) break;
  }
  return chips.slice(0, 14);
}

/** Short commercial asks from markdown/plain bullets (max ~12 words each). */
function extractAskBullets(raw: string): string[] {
  const out: string[] = [];
  const blockMatch = raw.match(
    /(?:asking\s+for|terms?\s+that\s+seem|key\s+terms?|their\s+agreement\s+has)[:\s]*\n((?:[ \t]*[-*•].+\n?){2,})/i,
  );
  const block = blockMatch?.[1] || raw;
  for (const line of block.split("\n")) {
    const m = line.match(/^[ \t]*[-*•]\s+(.{8,160})$/);
    if (!m) continue;
    const cleaned = m[1].replace(/\s+/g, " ").trim().replace(/[.;,:]+$/, "");
    if (cleaned.length < 8) continue;
    // Compress long bullets to a short commercial label for the rewrite list.
    const words = cleaned.split(/\s+/);
    const short = words.length > 12 ? `${words.slice(0, 12).join(" ")}…` : cleaned;
    out.push(short);
    if (out.length >= 12) break;
  }
  return out;
}

function extractDataScopeNotes(raw: string): string[] {
  const notes: string[] = [];
  if (/\b(?:business\s+records?|employee\s+names?|usage\s+(?:analytics|data)|internal\s+business)\b/i.test(raw)) {
    notes.push("Handles ordinary business records / employee contact / usage analytics");
  }
  const exclusions: string[] = [];
  if (/\bPHI\b/i.test(raw)) exclusions.push("PHI");
  if (/\bPCI\b/i.test(raw)) exclusions.push("PCI");
  if (/\bchildren'?s\s+data\b/i.test(raw)) exclusions.push("children’s data");
  if (/\b(?:government\s+)?classified\b/i.test(raw)) exclusions.push("classified information");
  if (exclusions.length) notes.push(`Out of scope: ${exclusions.join(", ")}`);
  return notes;
}

function extractExpansionNote(raw: string): string | null {
  if (/\bexpansion\b/i.test(raw) && /\b(?:rollout|first\s+team|goes\s+well)\b/i.test(raw)) {
    return "Possible expansion after initial team rollout";
  }
  if (/\bconvert(?:s|ing)?\b/i.test(raw) && /\b(?:annual|subscription|pilot)\b/i.test(raw)) {
    return "May convert / expand if the initial engagement succeeds";
  }
  return null;
}

function dealTypeLabel(raw: string): "saas_subscription" | "saas_pilot" | "services" | "nda" | "generic" {
  if (PILOT_RE.test(raw) && SAAS_RE.test(raw)) return "saas_pilot";
  if (PILOT_RE.test(raw) && MONEY_RE.test(raw)) return "saas_pilot";
  if (SAAS_RE.test(raw) || /\bACV\b/i.test(raw)) return "saas_subscription";
  if (NDA_RE.test(raw)) return "nda";
  if (SERVICES_RE.test(raw)) return "services";
  return "generic";
}

function buildCommercialSuggestedRewrite(raw: string): string {
  const deal = dealTypeLabel(raw);
  const money = extractMoneyPhrases(raw);
  const term = extractTermPhrase(raw) || (deal === "saas_subscription" ? "12-month" : "60-day");
  const fee = money[0] || (deal === "saas_subscription" ? "[annual fee / ACV]" : "[fee amount]");
  const topics = extractTopicChips(raw);
  const dataNotes = extractDataScopeNotes(raw);
  const expansion = extractExpansionNote(raw);

  const topicLine =
    topics.length > 0
      ? ` Address these commercial positions with practical, balanced language: ${topics.join("; ")}.`
      : "";
  const dataLine =
    dataNotes.length > 0 ? ` Data scope: ${dataNotes.join("; ").replace(/\.$/, "")}.` : "";
  const expansionLine = expansion ? ` ${expansion}.` : "";

  if (deal === "saas_pilot") {
    const conversion =
      money.find((m) => m !== fee && (/150|annual|k/i.test(m) || /ACV/i.test(m))) || money[1] || "";
    const convertBit = conversion
      ? ` If the pilot succeeds, it may convert to an annual SaaS subscription near ${conversion}.`
      : expansion
        ? ` ${expansion}.`
        : "";
    return (
      `Draft a ${term} paid SaaS pilot agreement between [Your Company Legal Name] and [Customer Legal Name] for ${fee}.` +
      convertBit +
      topicLine +
      dataLine +
      ` Use clear, practical language. Governing law: [State].`
    );
  }

  if (deal === "saas_subscription") {
    return (
      `Draft a ${term} SaaS subscription agreement between [Your Company Legal Name] and [Customer Legal Name] for approximately ${fee}.` +
      expansionLine +
      topicLine +
      dataLine +
      ` Use clear, practical language. Governing law: [State].`
    );
  }

  if (deal === "nda") {
    return (
      "Draft a mutual non-disclosure agreement between [Party A Legal Name] and [Party B Legal Name] " +
      "covering confidential business information for a 2-year term. Governing law: [State]."
    );
  }

  if (deal === "services" || MONEY_RE.test(raw)) {
    return (
      `Draft a services agreement between [Provider Legal Name] and [Client Legal Name] for ${term} at ${fee}.` +
      topicLine +
      ` Describe the services, payment schedule, ownership of deliverables, and termination. Governing law: [State].`
    );
  }

  return (
    "Draft a [agreement type] between [Party A Legal Name] and [Party B Legal Name] for [scope], " +
    "fee [amount], term [duration]. Governing law: [State]."
  );
}

function buildGenericSuggestedRewrite(raw: string): string | null {
  return buildCommercialSuggestedRewrite(raw);
}

function heardFromCounselPrep(raw: string): string[] {
  const heard: string[] = [];
  const deal = dealTypeLabel(raw);

  if (/\btheir\s+paper\b|\bcustomer\s+wants\s+to\s+use\s+their\b|\baccept\s+their\s+paper\b/i.test(raw)) {
    heard.push("Customer wants to use their paper; you’re weighing markup vs pushing to your form.");
  } else if (PILOT_RE.test(raw)) {
    heard.push("You’re evaluating a customer’s proposed paper (not asking us to draft your form yet).");
  } else if (deal === "saas_subscription") {
    heard.push("This is framed as enterprise SaaS deal guidance, not a draft-between-parties request.");
  }

  if (/\benterprise\b/i.test(raw)) heard.push("Deal context: enterprise customer.");
  if (/\bmid[-\s]?market\b/i.test(raw)) heard.push("Counterparty described as mid-market (legal name not given).");

  const term = extractTermPhrase(raw);
  if (term) {
    heard.push(deal === "saas_subscription" ? `Subscription term mentioned: ${term}.` : `Term mentioned: ${term}.`);
  }
  const money = extractMoneyPhrases(raw);
  if (money.length) {
    heard.push(
      /\bACV\b/i.test(raw)
        ? `Economics mentioned: ${money.join(", ")} (ACV / fee).`
        : `Economics mentioned: ${money.join(", ")}.`,
    );
  }

  const expansion = extractExpansionNote(raw);
  if (expansion) heard.push(`${expansion}.`);

  if (/\bMSA|order\s+form|DPA\b/i.test(raw)) {
    heard.push("You’re comparing their paper vs your MSA / order form / DPA process.");
  }

  const topics = extractTopicChips(raw);
  if (topics.length) {
    heard.push(`Commercial / risk topics called out (${topics.length}): ${topics.join("; ")}.`);
  }

  for (const note of extractDataScopeNotes(raw)) {
    heard.push(`${note}.`);
  }

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
    const suggested = buildCommercialSuggestedRewrite(raw);
    const topicCount = extractTopicChips(raw).length;
    return {
      kind: "counsel_prep",
      title: "This reads like negotiation prep — not a draftable agreement yet",
      why:
        "LawDog creates executable agreements from named parties, scope, fee, and term. " +
        "It does not produce attorney negotiation memos or markups of the other side’s paper.",
      whatWeHeard: heardFromCounselPrep(raw),
      guidedSteps: [
        "Name both legal entities (your company and the customer).",
        "Say you want a draft (not advice) — e.g. “Draft a 12-month SaaS subscription agreement between…”.",
        topicCount > 0
          ? "Keep the commercial facts already listed below (fee, term, and the risk topics we extracted)."
          : "Keep the commercial facts you already listed (fee, term, and key risk topics).",
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

  if ((hasMoney || hasTerm || SAAS_RE.test(raw) || PILOT_RE.test(raw) || SERVICES_RE.test(raw) || NDA_RE.test(raw)) && !hasBetweenParties) {
    const suggested = buildGenericSuggestedRewrite(raw);
    const heard: string[] = [];
    if (hasMoney) heard.push(`Fee / economics mentioned: ${extractMoneyPhrases(raw).join(", ") || "yes"}.`);
    if (hasTerm) heard.push(`Term mentioned: ${extractTermPhrase(raw) || "yes"}.`);
    if (SAAS_RE.test(raw) || PILOT_RE.test(raw)) heard.push("Looks like a SaaS / subscription or pilot deal.");
    if (NDA_RE.test(raw)) heard.push("Looks like an NDA request.");
    const topics = extractTopicChips(raw);
    if (topics.length) heard.push(`Topics detected: ${topics.slice(0, 8).join("; ")}.`);
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
    const topics = extractTopicChips(raw);
    return {
      kind: "ambiguous_request",
      title: "We need a clearer draft request",
      why: "This prompt is detailed, but it isn’t shaped as “draft an agreement between named parties.”",
      whatWeHeard: [
        `About ${raw.length.toLocaleString()} characters of notes.`,
        hasMoney ? `Economics mentioned: ${extractMoneyPhrases(raw).join(", ")}.` : "Economics were not clearly stated.",
        hasTerm ? `Term mentioned: ${extractTermPhrase(raw)}.` : "Term was not clearly stated.",
        ...(topics.length ? [`Topics detected: ${topics.slice(0, 10).join("; ")}.`] : []),
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
