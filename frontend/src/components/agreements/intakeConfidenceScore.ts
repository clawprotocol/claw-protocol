import type { LivePreviewModel } from "./liveDraftHeuristics";
import { extractIntakePayment } from "./intakeCurrencyParse";
import { extractBetweenPartyPair } from "./partyBetweenParse";

/** Pillar weights — optional adds on top; see {@link MAX_RAW_TOTAL}. */
const W_PARTIES = 20;
const W_PAYMENT = 20;
const W_SCOPE_PARTIAL = 10;
const W_SCOPE_COMPLETE = 20;
const W_TERM_PARTIAL = 10;
const W_TERM_COMPLETE = 20;
const W_GOVERNING_LAW = 10;
const W_TERMINATION = 10;
const W_LATE_FEE = 5;
const W_DISPUTE = 5;

/** Maximum achievable raw points (used to convert to a 0–100% display). */
export const MAX_RAW_TOTAL =
  W_PARTIES +
  W_PAYMENT +
  W_SCOPE_COMPLETE +
  W_TERM_COMPLETE +
  W_GOVERNING_LAW +
  W_TERMINATION +
  W_LATE_FEE +
  W_DISPUTE;

export const CONFIDENCE_DISPLAY_MIN = 40;

function hasGoverningLawMention(raw: string): boolean {
  return /\b(governing\s+law|jurisdiction|choice\s+of\s+law|laws\s+of\s+the\s+state|law\s+of\s+\w+|delaware|new\s+york|california|texas|florida|illinois|nevada|georgia|washington)\b/i.test(
    raw.trim(),
  );
}

function hasTerminationClauseMention(raw: string): boolean {
  return /\b(terminat(e|ion)|notice\s+period|either\s+party\s+may\s+(terminate|end)|for\s+cause|without\s+cause|term\s+may\s+be\s+ended)\b/i.test(
    raw,
  );
}

function mentionsLateFee(raw: string): boolean {
  return /\b(late\s+fee|past\s+due|overdue|interest\s+on\s+(unpaid|late|overdue)|penalt(y|ies)\s+for\s+late)\b/i.test(raw);
}

function mentionsDisputeResolution(raw: string): boolean {
  return /\b(mediation|arbitration|dispute\s+resolution|binding\s+arbitration|aaa\b|judicial\s+reference|small\s+claims\s+court)\b/i.test(
    raw,
  );
}

/** PARTIES complete: >= 2 distinct parties (deterministic string checks). */
export function hasAtLeastTwoParties(raw: string, model: LivePreviewModel): boolean {
  if (extractBetweenPartyPair(raw)) return true;
  const line = (model.partiesLine || "").trim();
  if (line.length >= 3) {
    const andParts = line.split(/\s+and\s+/i).map((s) => s.replace(/[.;:]+$/g, "").trim()).filter((s) => s.length >= 2);
    if (andParts.length >= 2) return true;
    const commas = line.split(",").map((s) => s.trim()).filter((s) => s.length >= 2);
    if (commas.length >= 2) return true;
    const amps = line.split(/\s*&\s*/).map((s) => s.trim()).filter((s) => s.length >= 2);
    if (amps.length >= 2) return true;
  }
  const r = raw.toLowerCase();
  if (/\bparty\s*1\b/.test(r) && /\bparty\s*2\b/.test(r)) return true;
  if (/\bfirst\s+party\b/.test(r) && /\bsecond\s+party\b/.test(r)) return true;
  return false;
}

function statesNoPayment(raw: string): boolean {
  return /\bno\s+payment|without\s+(?:compensation|payment)|pro\s+bono|free\s+of\s+charge|unpaid\s+volunteer|\$?\s*0\s*(?:\/|per|month|fee)?\b/i.test(
    raw.toLowerCase(),
  );
}

/** PAYMENT complete: parsed amount OR explicit “no payment”. */
export function paymentCompletionMet(raw: string, model: LivePreviewModel): boolean {
  const p = extractIntakePayment(raw);
  if (p.amount != null) return true;
  if (statesNoPayment(raw)) return true;
  const comp = (model.compensationLine || "").trim();
  if (comp && (/\$|\d/.test(comp) || /\bno\s+payment\b/i.test(comp))) return true;
  return false;
}

function scopeText(model: LivePreviewModel, raw: string): string {
  const fromModel = (model.scopeLine || model.servicesLine || "").trim();
  if (fromModel) return fromModel;
  const m = raw.match(/\b(?:scope|services?|work|deliverables?)\s*:\s*([^\n]+)/i);
  return m ? m[1].trim() : "";
}

/** >= 1 sentence describing work: non-trivial length or sentence punctuation. */
function scopeHasWorkSentence(text: string): boolean {
  const s = text.trim();
  if (s.length < 12) return false;
  if (/[.!?]/.test(s)) return true;
  return s.split(/\s+/).filter(Boolean).length >= 8;
}

/** Structured deliverables: lists, milestones, acceptance language, phased work, or multi-clause detail. */
function scopeIsStructuredDeliverables(text: string): boolean {
  const s = text.trim();
  if (s.length < 24) return false;
  const low = s.toLowerCase();
  if (/(\n|^)\s*(?:[\d•\-\*]|\([a-z]\))\s+/m.test(s)) return true;
  if (/\b(milestone|deliverable|acceptance\s+criteria|phase\s*\d|sla|in\s+scope|out\s+of\s+scope|exclusion)\b/i.test(low)) return true;
  if ((s.match(/;/g) || []).length >= 1 && s.length >= 50) return true;
  if (s.split(/\n/).filter((l) => l.trim().length > 20).length >= 2) return true;
  return false;
}

function scopePoints(model: LivePreviewModel, raw: string): number {
  const text = scopeText(model, raw);
  if (!scopeHasWorkSentence(text)) return 0;
  if (scopeIsStructuredDeliverables(text)) return W_SCOPE_COMPLETE;
  return W_SCOPE_PARTIAL;
}

function hasTermStartSignal(raw: string, model: LivePreviewModel): boolean {
  const tl = (model.termLine || "").trim();
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i.test(tl))
    return true;
  if (/\b(?:effective|start|starting|commence|as of)\b/i.test(tl) && /\d/.test(tl)) return true;
  const r = raw.toLowerCase();
  if (/\b(?:effective|start)\s+date\b/.test(r)) return true;
  if (/\b(?:commencing|begins?)\s+(?:on\s+)?(?:january|february|march|\d{1,2}\/\d{1,2})/.test(r)) return true;
  if (/\b(?:as of|effective)\s+(?:january|february|march|\d{1,2}\/\d{1,2}|\d{4})/.test(r)) return true;
  return false;
}

function hasTermDurationSignal(raw: string, model: LivePreviewModel): boolean {
  const tl = (model.termLine || "").trim();
  if (/\b(\d+)\s*(year|years|yr|yrs|month|months|mo|week|weeks|day|days)\b/i.test(tl)) return true;
  if (/\b(perpetual|indefinite|until\s+terminated)\b/i.test(tl)) return true;
  const r = raw;
  if (/\b(\d+)\s*(year|years|month|months|week|weeks|day|days)\b/i.test(r)) return true;
  if (/\b(?:one|1)\s*year\b/i.test(r)) return true;
  if (/\bterm\s*:\s*\d/i.test(r)) return true;
  return false;
}

function termPoints(raw: string, model: LivePreviewModel): number {
  const start = hasTermStartSignal(raw, model);
  const duration = hasTermDurationSignal(raw, model);
  if (start && duration) return W_TERM_COMPLETE;
  if (start || duration) return W_TERM_PARTIAL;
  return 0;
}

export type AgreementStrengthChecklistRow = {
  id: string;
  /** Shown with ✔ when satisfied. */
  completeLabel: string;
  /** Shown with ⚠ when action needed; ignored when satisfied. */
  actionLabel: string;
  satisfied: boolean;
  /** When not satisfied, append this clause on click (deterministic stub). */
  append?: string;
  /** Satisfied enough to continue, but worth a quick review — shows ⚠ with `completeLabel`. */
  warningComplete?: boolean;
};

export type IntakeConfidenceScore = {
  /** Sum of weighted points (max {@link MAX_RAW_TOTAL}). */
  rawTotal: number;
  /** True completion ratio 0–100 (no encouragement floor) — use for meter color and “Agreement strength”. */
  nominalPercent: number;
  /** 0–100, derived from raw / max; floored at {@link CONFIDENCE_DISPLAY_MIN} for legacy UI. */
  displayPercent: number;
  breakdown: {
    parties: number;
    payment: number;
    scope: number;
    term: number;
    governingLaw: number;
    termination: number;
    lateFee: number;
    disputeResolution: number;
  };
};

/**
 * Deterministic completion score from intake text + live preview model (no AI).
 */
export function computeIntakeConfidenceScore(model: LivePreviewModel, rawIntake: string): IntakeConfidenceScore {
  const raw = rawIntake.trim();

  const parties = hasAtLeastTwoParties(raw, model) ? W_PARTIES : 0;
  const payment = paymentCompletionMet(raw, model) ? W_PAYMENT : 0;
  const scope = scopePoints(model, raw);
  const term = termPoints(raw, model);

  const governingLaw = hasGoverningLawMention(raw) ? W_GOVERNING_LAW : 0;
  const termination = hasTerminationClauseMention(raw) ? W_TERMINATION : 0;
  const lateFee = mentionsLateFee(raw) ? W_LATE_FEE : 0;
  const disputeResolution = mentionsDisputeResolution(raw) ? W_DISPUTE : 0;

  let rawTotal =
    parties + payment + scope + term + governingLaw + termination + lateFee + disputeResolution;
  rawTotal = Math.min(MAX_RAW_TOTAL, rawTotal);

  const ratio = MAX_RAW_TOTAL > 0 ? rawTotal / MAX_RAW_TOTAL : 0;
  const nominalPercent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  const displayPercent = Math.max(CONFIDENCE_DISPLAY_MIN, Math.min(100, nominalPercent));

  return {
    rawTotal,
    nominalPercent,
    displayPercent,
    breakdown: {
      parties,
      payment,
      scope,
      term,
      governingLaw,
      termination,
      lateFee,
      disputeResolution,
    },
  };
}

const APPEND_PARTIES = "Parties: [Legal name 1] and [Legal name 2].";
const APPEND_PAYMENT = "Payment: [Amount, currency, and schedule — e.g. net 30 or monthly].";
const APPEND_SCOPE = "Scope: [Concrete deliverables, milestones, acceptance criteria, and exclusions.]";
const APPEND_SCOPE_DETAIL =
  "Scope (detail): [Numbered deliverables; acceptance tests; items explicitly out of scope.]";
const APPEND_TERM_START = "Effective date: [date].";
const APPEND_TERM_DURATION = "Term: [duration from effective date, e.g. 12 months].";
const APPEND_TERM_BOTH = `${APPEND_TERM_START}\n${APPEND_TERM_DURATION}`;
const APPEND_GOV = "Governing law: This agreement is governed by the laws of [State], without regard to conflict-of-law rules.";
const APPEND_TERMINATION =
  "Termination: Either party may terminate with [30] days’ prior written notice. Surviving obligations continue after termination.";
const APPEND_LATE_FEE =
  "Late payment: Overdue amounts accrue interest at 1.5% per month (or the maximum permitted by law) until paid.";
const APPEND_DISPUTE =
  "Dispute resolution: The parties will first attempt mediation; unresolved disputes will be resolved by binding arbitration in [venue].";

/**
 * Rows for the preview “Agreement strength” checklist — ✔ / ⚠ with optional append-on-click for gaps.
 */
export function buildAgreementStrengthChecklist(model: LivePreviewModel, rawIntake: string): AgreementStrengthChecklistRow[] {
  const raw = rawIntake.trim();
  const rows: AgreementStrengthChecklistRow[] = [];

  const partiesOk = hasAtLeastTwoParties(raw, model);
  rows.push({
    id: "strength-parties",
    completeLabel: "Parties defined",
    actionLabel: "Add a second party",
    satisfied: partiesOk,
    append: partiesOk ? undefined : APPEND_PARTIES,
  });

  const payOk = paymentCompletionMet(raw, model);
  rows.push({
    id: "strength-payment",
    completeLabel: "Payment set",
    actionLabel: "Set payment or state no payment",
    satisfied: payOk,
    append: payOk ? undefined : APPEND_PAYMENT,
  });

  const st = scopeText(model, raw);
  const scopeSentence = scopeHasWorkSentence(st);
  const scopeStructured = scopeIsStructuredDeliverables(st);
  const scopeOk = scopeSentence && scopeStructured;
  const scopePartialOnly = scopeSentence && !scopeStructured;
  const scopeFuzzyPresent = Boolean(model.extraction?.scopeSignalPresent && st.length > 6);
  const scopeRelaxedOk = scopeOk || scopeFuzzyPresent;
  const scopeNeedsReview = scopeRelaxedOk && !scopeOk;
  rows.push({
    id: "strength-scope",
    completeLabel: scopeNeedsReview ? "⚠️ Scope detected (needs review)" : "Scope defined",
    actionLabel: scopeSentence ? "Add structured deliverables" : "Describe scope of work",
    satisfied: scopeRelaxedOk,
    warningComplete: scopeNeedsReview,
    append: scopeRelaxedOk ? undefined : scopePartialOnly ? APPEND_SCOPE_DETAIL : APPEND_SCOPE,
  });

  const tStart = hasTermStartSignal(raw, model);
  const tDur = hasTermDurationSignal(raw, model);
  const termOk = tStart && tDur;
  const termFuzzyPresent = Boolean(model.extraction?.termSignalPresent);
  const termRelaxedOk = termOk || termFuzzyPresent;
  const termNeedsReview = termRelaxedOk && !termOk;
  let termAppend: string | undefined;
  let termAction = "Add term (start date and duration)";
  if (!termRelaxedOk) {
    if (!tStart && !tDur) termAppend = APPEND_TERM_BOTH;
    else if (!tStart) {
      termAppend = APPEND_TERM_START;
      termAction = "Add effective / start date";
    } else {
      termAppend = APPEND_TERM_DURATION;
      termAction = "Add duration";
    }
  }
  rows.push({
    id: "strength-term",
    completeLabel: termNeedsReview ? "⚠️ Term / timing detected (needs review)" : "Term complete",
    actionLabel: termAction,
    satisfied: termRelaxedOk,
    warningComplete: termNeedsReview,
    append: termRelaxedOk ? undefined : termAppend,
  });

  const govOk = hasGoverningLawMention(raw);
  rows.push({
    id: "strength-governing-law",
    completeLabel: "Governing law set",
    actionLabel: "Add governing law",
    satisfied: govOk,
    append: govOk ? undefined : APPEND_GOV,
  });

  const termClauseOk = hasTerminationClauseMention(raw);
  rows.push({
    id: "strength-termination",
    completeLabel: "Termination addressed",
    actionLabel: "Add termination clause",
    satisfied: termClauseOk,
    append: termClauseOk ? undefined : APPEND_TERMINATION,
  });

  const lateOk = mentionsLateFee(raw);
  rows.push({
    id: "strength-late-fee",
    completeLabel: "Late payment terms",
    actionLabel: "Add late fee / interest",
    satisfied: lateOk,
    append: lateOk ? undefined : APPEND_LATE_FEE,
  });

  const disputeOk = mentionsDisputeResolution(raw);
  rows.push({
    id: "strength-dispute",
    completeLabel: "Dispute resolution",
    actionLabel: "Add dispute resolution",
    satisfied: disputeOk,
    append: disputeOk ? undefined : APPEND_DISPUTE,
  });

  return rows;
}

/** Pre-send checklist above “Send agreement” (simple create). */
export type PreSendTrustGapKey = "governing_law" | "termination";

export type PreSendTrustLayer = {
  partiesDefined: boolean;
  paymentIncluded: boolean;
  durationSet: boolean;
  missingItems: { key: PreSendTrustGapKey; label: string }[];
  nominalPercent: number;
};

export function computePreSendTrustLayer(rawIntake: string, model: LivePreviewModel): PreSendTrustLayer {
  const raw = rawIntake.trim();
  const sc = computeIntakeConfidenceScore(model, raw);
  const missing: PreSendTrustLayer["missingItems"] = [];
  if (!hasGoverningLawMention(raw)) missing.push({ key: "governing_law", label: "Governing law" });
  if (!hasTerminationClauseMention(raw)) missing.push({ key: "termination", label: "Termination clause" });
  return {
    partiesDefined: hasAtLeastTwoParties(raw, model),
    paymentIncluded: paymentCompletionMet(raw, model),
    durationSet: hasTermDurationSignal(raw, model),
    missingItems: missing,
    nominalPercent: sc.nominalPercent,
  };
}
