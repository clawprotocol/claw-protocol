import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PRO_REFINE_UNAVAILABLE_USER_MESSAGE } from "./premiumRefineApi";

/** Post-checkout pipeline / resolver pin for a committed full Pro body (see premiumCompletionStorage). */
export const PREMIUM_REFINE_AUTHORITATIVE_PIPELINE_SOURCE = "server_full_document_text";

/**
 * Ratio at or above which a refined candidate is accepted without required-section checks.
 */
export const PREMIUM_REFINE_FULL_ACCEPT_RATIO = 0.75;

/**
 * Below this ratio vs current Pro length, shrinkage is treated as extreme unless the user
 * explicitly asked to shorten or summarize (and required sections are still present).
 */
export const PREMIUM_REFINE_HARD_SHRINK_FLOOR = 0.5;

/**
 * Documented soft floor for Pro refine length QA (between {@link PREMIUM_REFINE_HARD_SHRINK_FLOOR}
 * and {@link PREMIUM_REFINE_FULL_ACCEPT_RATIO}, acceptance depends on required-section presence).
 */
export const PREMIUM_REFINE_MIN_LENGTH_RATIO = 0.6;

const SHORT_BASELINE_LEN_THRESHOLD = 2000;

export type PremiumRefineCorpusSource =
  | "premium_full_document_text"
  | "premium_server_full_document_text"
  | "agreement_document_state"
  | "premium_readonly_plain"
  | "premium_snapshot_winner_plain"
  | "draft_purpose_fallback";

export type PremiumRefineCorpusPick = {
  text: string;
  chosenSource: PremiumRefineCorpusSource;
  len: number;
};

/**
 * Prefer the longest non-empty corpus among draft premium fields and live buffers so refine always
 * sends the full Pro agreement — never a short starter/live preview when draft holds the full body.
 */
export function pickAuthoritativeProCorpusForRefine(args: {
  draft: ParsedDraftShape | null;
  agreementDocumentText: string;
  premiumReadonlyPlain?: string;
  /** Session snapshot winner (often mirrors server_full_document_text). */
  premiumSnapshotWinnerPlain?: string;
}): PremiumRefineCorpusPick {
  const rows: { source: PremiumRefineCorpusSource; text: string }[] = [];
  const push = (source: PremiumRefineCorpusSource, raw: string | null | undefined) => {
    const t = (raw || "").trim();
    if (t.length > 0) rows.push({ source, text: t });
  };
  if (args.draft) {
    push("premium_full_document_text", args.draft.premium_full_document_text);
    push("premium_server_full_document_text", args.draft.premium_server_full_document_text);
  }
  push("agreement_document_state", args.agreementDocumentText);
  push("premium_readonly_plain", args.premiumReadonlyPlain);
  push("premium_snapshot_winner_plain", args.premiumSnapshotWinnerPlain);
  if (args.draft) push("draft_purpose_fallback", args.draft.purpose);

  if (rows.length === 0) return { text: "", chosenSource: "draft_purpose_fallback", len: 0 };

  let best = rows[0];
  for (const r of rows) {
    if (r.text.length > best.text.length) best = r;
  }
  return { text: best.text, chosenSource: best.source, len: best.text.length };
}

export type PremiumRefineApplyDecision = "accepted" | "rejected_short" | "rejected_empty" | "rejected_unchanged";

export type PremiumRefineRequiredSectionsPresence = {
  title: boolean;
  parties: boolean;
  scope: boolean;
  payment: boolean;
  term: boolean;
  ownershipOrConfidentiality: boolean;
};

/** Matches backend whitespace normalization for no-op refine detection. */
export function normalizePremiumRefineTextForCompare(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/** True when the API returned the paid update fail-open payload (unchanged document). */
export function premiumRefineSummaryIsUnchangedFailOpen(summary: string[] | undefined): boolean {
  const msg = PRO_REFINE_UNAVAILABLE_USER_MESSAGE.trim();
  return (summary || []).some((line) => line.trim() === msg);
}

export function instructionAllowsExtremeShrink(userInstruction: string | undefined): boolean {
  const t = (userInstruction || "").trim();
  if (!t) return false;
  return /\b(shorten|shorter|summarize|summary|condense|compress|brief(?:er)?|reduce\s+length|make\s+it\s+shorter|abbreviate)\b/i.test(
    t,
  );
}

function normalizedDocForSections(doc: string): string {
  return doc.trim().replace(/\s+/g, " ").toLowerCase();
}

export function getPremiumRefineRequiredSectionsPresence(doc: string): PremiumRefineRequiredSectionsPresence {
  const d = normalizedDocForSections(doc);
  const raw = doc;
  const title =
    /\bagreement\b|\bcontract\b|\bstatement of work\b|\bsow\b|\bnda\b|\bmemorandum\b/.test(d) ||
    /\bthis\s+\S+\s+agreement\b/.test(d);
  const parties =
    /\bby and between\b/.test(d) ||
    /\bbetween\s+[^,]{2,120},\s+/.test(d) ||
    /\b(?:client|vendor|disclosing party|receiving party)\b.*\band\b.*\b(?:client|vendor|disclosing party|receiving party)\b/i.test(
      d,
    ) ||
    (/\("client"\)/i.test(raw) && /\("vendor"\)/i.test(raw));
  const scope =
    /\bscope of services\b|\bservices to be\b|\bdeliverables\b|\bwork product\b|\bconsulting services\b|\bservices\s+description\b/.test(
      d,
    );
  const payment = /\bpayment\b|\bfees?\b|\bcompensation\b|\binvoice\b|\bamount due\b|\$\d/.test(d);
  const term =
    /\bterm\b|\beffective date\b|\bduration\b|\bmonths?\b|\bdays?\b|\btermination\b|\bcalendar days?\b/.test(d);
  const ownershipOrConfidentiality =
    /\bconfidential\b|\bnon-disclosure\b|\bproprietary\b|\bintellectual property\b|\bownership\b|\bwork for hire\b|\bip rights?\b/.test(
      d,
    );
  return { title, parties, scope, payment, term, ownershipOrConfidentiality };
}

export function premiumRefineRequiredSectionsAllPresent(doc: string): boolean {
  const p = getPremiumRefineRequiredSectionsPresence(doc);
  return (
    p.title &&
    p.parties &&
    p.scope &&
    p.payment &&
    p.term &&
    p.ownershipOrConfidentiality
  );
}

function decideLengthAgainstBaseline(
  refined: string,
  refinedLen: number,
  currentProLen: number,
  userInstruction: string | undefined,
): { decision: PremiumRefineApplyDecision; ratio: number; requiredSectionsPresent: boolean } {
  const ratio = currentProLen > 0 ? refinedLen / currentProLen : 1;
  const requiredSectionsPresent = premiumRefineRequiredSectionsAllPresent(refined);

  const accept = (): { decision: "accepted"; ratio: number; requiredSectionsPresent: boolean } => ({
    decision: "accepted",
    ratio,
    requiredSectionsPresent,
  });
  const rejectShort = (): { decision: "rejected_short"; ratio: number; requiredSectionsPresent: boolean } => ({
    decision: "rejected_short",
    ratio,
    requiredSectionsPresent,
  });

  if (currentProLen < SHORT_BASELINE_LEN_THRESHOLD) {
    if (refinedLen >= Math.max(500, Math.floor(currentProLen * PREMIUM_REFINE_FULL_ACCEPT_RATIO))) {
      return accept();
    }
    if (ratio >= PREMIUM_REFINE_FULL_ACCEPT_RATIO) {
      return accept();
    }
    if (ratio < PREMIUM_REFINE_HARD_SHRINK_FLOOR) {
      if (instructionAllowsExtremeShrink(userInstruction) && requiredSectionsPresent) return accept();
      return rejectShort();
    }
    if (requiredSectionsPresent) return accept();
    return rejectShort();
  }

  if (ratio >= PREMIUM_REFINE_FULL_ACCEPT_RATIO) return accept();
  if (ratio >= PREMIUM_REFINE_HARD_SHRINK_FLOOR) {
    if (requiredSectionsPresent) return accept();
    return rejectShort();
  }
  if (instructionAllowsExtremeShrink(userInstruction) && requiredSectionsPresent) return accept();
  return rejectShort();
}

export function evaluatePremiumRefineCandidate(
  refinedCandidate: string,
  currentProText: string | undefined,
  currentProLen: number,
  responseSummary?: string[],
  userInstruction?: string,
): {
  decision: PremiumRefineApplyDecision;
  refinedLen: number;
  ratio: number;
  requiredSectionsPresent: boolean;
} {
  const refined = refinedCandidate.trim();
  const refinedLen = refined.length;
  if (refinedLen < 1) {
    return { decision: "rejected_empty", refinedLen, ratio: 0, requiredSectionsPresent: false };
  }
  const ratioEarly = currentProLen > 0 ? refinedLen / currentProLen : 1;
  const sectionsForLog = premiumRefineRequiredSectionsAllPresent(refined);
  if (premiumRefineSummaryIsUnchangedFailOpen(responseSummary)) {
    return { decision: "rejected_unchanged", refinedLen, ratio: ratioEarly, requiredSectionsPresent: sectionsForLog };
  }
  if (
    currentProText !== undefined &&
    normalizePremiumRefineTextForCompare(currentProText) === normalizePremiumRefineTextForCompare(refined)
  ) {
    return { decision: "rejected_unchanged", refinedLen, ratio: ratioEarly, requiredSectionsPresent: sectionsForLog };
  }
  if (currentProLen < 1) {
    return { decision: "accepted", refinedLen, ratio: 1, requiredSectionsPresent: sectionsForLog };
  }

  const { decision, ratio, requiredSectionsPresent } = decideLengthAgainstBaseline(
    refined,
    refinedLen,
    currentProLen,
    userInstruction,
  );
  return { decision, refinedLen, ratio, requiredSectionsPresent };
}

/** Primary line: rejected_short near refine UI (inline). */
export const PRO_REFINE_REJECTED_SHORT_PRIMARY =
  "LawDog made a shorter version than expected, so your agreement was not changed. Try a narrower instruction or use Edit wording.";

/** Secondary hint — optional line shown below the primary. */
export const PRO_REFINE_REJECTED_SHORT_HINT = "";

/** Full inline message for textarea-adjacent alerts. */
export function formatProRefineRejectedShortInline(): string {
  const hint = PRO_REFINE_REJECTED_SHORT_HINT.trim();
  return hint ? `${PRO_REFINE_REJECTED_SHORT_PRIMARY}\n\n${hint}` : PRO_REFINE_REJECTED_SHORT_PRIMARY;
}

/** @deprecated Prefer {@link formatProRefineRejectedShortInline} or PRIMARY/HINT. */
export const PRO_REFINE_REJECTED_SHORT_USER_MESSAGE = PRO_REFINE_REJECTED_SHORT_PRIMARY;

/** Stable substring for alert role / UI branching when showing rejected_short copy. */
export function isProRefineRejectedShortMessage(message: string | undefined): boolean {
  return Boolean((message || "").includes("LawDog made a shorter version than expected"));
}

/** Shown inline after a premium refine is accepted and applied. */
export const PRO_REFINE_CHANGE_APPLIED_USER_MESSAGE = "Change applied.";
