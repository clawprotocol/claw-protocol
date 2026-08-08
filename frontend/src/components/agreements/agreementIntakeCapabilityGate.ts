/**
 * Detect intakes that are not draftable executable agreements (counsel prep,
 * negotiation Q&A, deal advice) so Create draft does not silently paint a
 * thin/stale template or invent parties from greeting text.
 */

export type AgreementIntakeCapabilityCode =
  | "counsel_prep_not_draftable"
  | "advisory_qa_not_draftable";

export type AgreementIntakeCapabilityDecision = {
  ok: true;
} | {
  ok: false;
  code: AgreementIntakeCapabilityCode;
  userMessage: string;
};

const DRAFT_INTENT_RE =
  /\b(?:draft|create|write|prepare|generate)\b[\s\S]{0,80}\b(?:agreement|contract|msa|sow|nda|pilot\s+agreement|order\s+form)\b/i;

const BETWEEN_PARTIES_RE =
  /\bbetween\b[\s\S]{0,120}\band\b/i;

const COUNSEL_PREP_SIGNAL_RE =
  /\b(?:help\s+me\s+figure\s+out|what\s+positions\s+i\s+should\s+take|negotiation\s+plan|fallback\s+language|clause\s+edits|deal\s+risks?\s+vs|lawyering\s+the\s+deal|not\s+looking\s+for\s+a\s+law\s+school\s+memo|confirm\s+internally\s+before|push\s+them\s+back|accept\s+their\s+.{0,40}with\s+edits|which\s+terms\s+are\s+actual\s+deal\s+risks)\b/i;

const NUMBERED_ADVISORY_QUESTIONS_RE =
  /(?:^|\n)\s*(?:1[\).\]]|1\.)\s+(?:whether|which|what|how)\b[\s\S]{40,}(?:^|\n)\s*(?:2[\).\]]|2\.)\s+/im;

const COUNSEL_PREP_USER_MESSAGE =
  "This looks like negotiation / deal-counsel prep, not a draftable agreement between named parties.\n\n" +
  "LawDog drafts executable agreements from parties, scope, fee, and term. It does not produce attorney negotiation memos or markups of the other side’s paper.\n\n" +
  "Rephrase as a draft request — for example: “Draft a 60-day SaaS pilot agreement between [Your Company] and [Customer] for $15,000, converting to an annual SaaS subscription if the pilot succeeds…” — or get attorney review for counsel on their form.";

export function assessAgreementIntakeCapability(rawIntake: string): AgreementIntakeCapabilityDecision {
  const raw = (rawIntake || "").replace(/\r\n/g, "\n").trim();
  if (raw.length < 40) return { ok: true };

  const hasDraftIntent = DRAFT_INTENT_RE.test(raw);
  const hasBetweenParties = BETWEEN_PARTIES_RE.test(raw);
  const counselSignals = COUNSEL_PREP_SIGNAL_RE.test(raw);
  const numberedAdvisory = NUMBERED_ADVISORY_QUESTIONS_RE.test(raw);

  // Explicit draft-between-parties requests always proceed.
  if (hasDraftIntent && hasBetweenParties) return { ok: true };

  if (counselSignals && numberedAdvisory && !hasBetweenParties) {
    return {
      ok: false,
      code: "counsel_prep_not_draftable",
      userMessage: COUNSEL_PREP_USER_MESSAGE,
    };
  }

  if (counselSignals && raw.length >= 900 && !hasDraftIntent) {
    return {
      ok: false,
      code: "advisory_qa_not_draftable",
      userMessage: COUNSEL_PREP_USER_MESSAGE,
    };
  }

  return { ok: true };
}

export type IntentionalCreateDraftSubmitDecision =
  | { action: "proceed"; text: string }
  | { action: "block_capability"; text: string; message: string }
  | { action: "noop" };

/**
 * Shared Create-draft submit evaluation for every INPUT generate path
 * (stageA, guided_input_generate, voice_draft_now). Caller must clear paid
 * authority before proceeding when action === "proceed".
 */
export function evaluateIntentionalCreateDraftSubmit(rawIntake: string): IntentionalCreateDraftSubmitDecision {
  const text = (rawIntake || "").replace(/\r\n/g, "\n").trim();
  if (text.length < 6) return { action: "noop" };
  const capability = assessAgreementIntakeCapability(text);
  if (!capability.ok) {
    return { action: "block_capability", text, message: capability.userMessage };
  }
  return { action: "proceed", text };
}
