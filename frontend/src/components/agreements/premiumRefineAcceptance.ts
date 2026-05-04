import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PRO_REFINE_UNAVAILABLE_USER_MESSAGE } from "./premiumRefineApi";

/** Post-checkout pipeline / resolver pin for a committed full Pro body (see premiumCompletionStorage). */
export const PREMIUM_REFINE_AUTHORITATIVE_PIPELINE_SOURCE = "server_full_document_text";

/** Surgical (preserve-first): reject shrink below this length ratio vs current Pro. */
export const PREMIUM_REFINE_SURGICAL_MIN_LENGTH_RATIO = 0.8;

/**
 * Surgical: below this ratio (exclusive), require major-heading preservation at
 * {@link PREMIUM_REFINE_HEADING_PRESERVATION_MIN} vs baseline.
 */
export const PREMIUM_REFINE_SURGICAL_HEADING_CHECK_MAX_RATIO = 0.95;

/** Surgical: in the 0.80–&lt;0.95 band, minimum share of baseline major headings still present in the candidate. */
export const PREMIUM_REFINE_HEADING_PRESERVATION_MIN = 0.85;

/** Transformational: ratio at or above this generally passes without the agreement spine heuristic. */
export const PREMIUM_REFINE_TRANSFORMATIONAL_EASY_RATIO = 0.75;

/** Transformational: below this ratio requires {@link premiumRefineRequiredSectionsAllPresent}. */
export const PREMIUM_REFINE_TRANSFORMATIONAL_SECTION_FLOOR_RATIO = 0.5;

/** Transformational: below this ratio is rejected even with sections. */
export const PREMIUM_REFINE_TRANSFORMATIONAL_HARD_REJECT_RATIO = 0.35;

/** @deprecated Use {@link PREMIUM_REFINE_SURGICAL_HEADING_CHECK_MAX_RATIO} / transformational constants. */
export const PREMIUM_REFINE_FULL_ACCEPT_RATIO = PREMIUM_REFINE_SURGICAL_HEADING_CHECK_MAX_RATIO;

/** @deprecated Legacy QA constant; surgical gate is {@link PREMIUM_REFINE_SURGICAL_MIN_LENGTH_RATIO}. */
export const PREMIUM_REFINE_HARD_SHRINK_FLOOR = PREMIUM_REFINE_TRANSFORMATIONAL_SECTION_FLOOR_RATIO;

/** @deprecated Legacy QA constant. */
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

export type PremiumRefineRevisionIntent = "surgical_revision" | "transformational_revision";

export type PremiumRefineRequiredSectionsPresence = {
  title: boolean;
  parties: boolean;
  scope: boolean;
  payment: boolean;
  term: boolean;
  ownershipOrConfidentiality: boolean;
};

/** Paid Pro refine panel heading (Finalize + draft card). */
export const PRO_REFINE_REVISE_SECTION_HEADING = "Ask LawDog to revise.";

/** Short helper under the revise heading. */
export const PRO_REFINE_REVISE_HELPER =
  "LawDog preserves the document and only applies the change you request.";

/** Primary CTA label for applying a premium refine instruction. */
export const PRO_REFINE_APPLY_REVISION_BUTTON_LABEL = "Apply revision.";

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

export function classifyPremiumRefineRevisionIntent(userInstruction: string | undefined): PremiumRefineRevisionIntent {
  const t = (userInstruction || "").trim();
  if (!t) return "surgical_revision";
  if (instructionAllowsExtremeShrink(userInstruction)) return "transformational_revision";
  if (
    /\b(simplify|rewrite\s+(?:completely|entirely|from\s+scratch)|start\s+over|replace\s+(?:the\s+)?(?:entire\s+|whole\s+)?document|convert\s+(?:this\s+)?(?:to|into)|re-?outline|format\s+only|turn\s+into|new\s+version\s+of)\b/i.test(
      t,
    )
  ) {
    return "transformational_revision";
  }
  return "surgical_revision";
}

function normalizedDocForSections(doc: string): string {
  return doc.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeHeadingKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fingerprints for major headings (markdown ##, numbered article lines, ALL CAPS titles).
 * Universal across agreement / memo-style bodies without hard-coding clause names.
 */
export function extractMajorHeadingFingerprints(doc: string): string[] {
  const lines = doc.split(/\r?\n/);
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#{1,6}\s+(.+)$/))) {
      out.push(normalizeHeadingKey(m[1]));
      continue;
    }
    if ((m = line.match(/^\d+(?:\.\d+)*\.\s+([A-Za-z][^.]{2,80})(?:\.|\s+|$)/))) {
      out.push(normalizeHeadingKey(m[1]));
      continue;
    }
    if (
      line.length >= 10 &&
      line.length <= 100 &&
      line === line.toUpperCase() &&
      /[A-Z]/.test(line) &&
      !/^\d/.test(line) &&
      /^[A-Z0-9 &/(),'-]+$/.test(line)
    ) {
      out.push(normalizeHeadingKey(line));
    }
  }
  return [...new Set(out)].filter((k) => k.length >= 4);
}

export function computeMajorHeadingPreservationRatio(baseline: string, candidate: string): number {
  const keys = extractMajorHeadingFingerprints(baseline);
  if (keys.length === 0) return 1;
  const candNorm = normalizedDocForSections(candidate);
  let hit = 0;
  for (const k of keys) {
    if (k.length < 4) continue;
    if (candNorm.includes(k)) hit++;
  }
  return hit / keys.length;
}

export function getPremiumRefineRequiredSectionsPresence(doc: string): PremiumRefineRequiredSectionsPresence {
  const d = normalizedDocForSections(doc);
  const raw = doc;
  const title =
    /\bagreement\b|\bcontract\b|\bstatement of work\b|\bsow\b|\bnda\b|\bmemorandum\b|\bmemo\b|\bbrief\b/.test(d) ||
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

type LengthDecision = {
  decision: PremiumRefineApplyDecision;
  ratio: number;
  requiredSectionsPresent: boolean;
  revisionIntent: PremiumRefineRevisionIntent;
  headingPreservationRatio: number;
};

function decideTransformational(
  _refinedLen: number,
  currentProLen: number,
  ratio: number,
  requiredSectionsPresent: boolean,
  revisionIntent: PremiumRefineRevisionIntent,
  headingPreservationRatio: number,
): LengthDecision {
  const accept = (): LengthDecision => ({
    decision: "accepted",
    ratio,
    requiredSectionsPresent,
    revisionIntent,
    headingPreservationRatio,
  });
  const rejectShort = (): LengthDecision => ({
    decision: "rejected_short",
    ratio,
    requiredSectionsPresent,
    revisionIntent,
    headingPreservationRatio,
  });

  if (currentProLen < SHORT_BASELINE_LEN_THRESHOLD) {
    if (ratio > 1) return accept();
    if (ratio >= PREMIUM_REFINE_TRANSFORMATIONAL_EASY_RATIO) return accept();
    if (ratio >= PREMIUM_REFINE_TRANSFORMATIONAL_SECTION_FLOOR_RATIO && requiredSectionsPresent) return accept();
    if (ratio >= PREMIUM_REFINE_TRANSFORMATIONAL_HARD_REJECT_RATIO && requiredSectionsPresent) return accept();
    return rejectShort();
  }

  if (ratio > 1) return accept();
  if (ratio >= PREMIUM_REFINE_TRANSFORMATIONAL_EASY_RATIO) return accept();
  if (ratio >= PREMIUM_REFINE_TRANSFORMATIONAL_SECTION_FLOOR_RATIO && requiredSectionsPresent) return accept();
  if (ratio >= PREMIUM_REFINE_TRANSFORMATIONAL_HARD_REJECT_RATIO && requiredSectionsPresent) return accept();
  return rejectShort();
}

function decideSurgicalRefine(
  _refined: string,
  _refinedLen: number,
  baselineText: string,
  currentProLen: number,
  ratio: number,
  requiredSectionsPresent: boolean,
  revisionIntent: PremiumRefineRevisionIntent,
  headingPreservationRatio: number,
): LengthDecision {
  const accept = (): LengthDecision => ({
    decision: "accepted",
    ratio,
    requiredSectionsPresent,
    revisionIntent,
    headingPreservationRatio,
  });
  const rejectShort = (): LengthDecision => ({
    decision: "rejected_short",
    ratio,
    requiredSectionsPresent,
    revisionIntent,
    headingPreservationRatio,
  });

  const headingOk =
    headingPreservationRatio >= PREMIUM_REFINE_HEADING_PRESERVATION_MIN ||
    extractMajorHeadingFingerprints(baselineText).length === 0;

  if (currentProLen < SHORT_BASELINE_LEN_THRESHOLD) {
    if (ratio > 1) return accept();
    if (ratio >= PREMIUM_REFINE_SURGICAL_HEADING_CHECK_MAX_RATIO) return accept();
    if (ratio < PREMIUM_REFINE_SURGICAL_MIN_LENGTH_RATIO) return rejectShort();
    if (headingOk) return accept();
    return rejectShort();
  }

  if (ratio > 1) return accept();
  if (ratio >= PREMIUM_REFINE_SURGICAL_HEADING_CHECK_MAX_RATIO) return accept();
  if (ratio < PREMIUM_REFINE_SURGICAL_MIN_LENGTH_RATIO) return rejectShort();
  if (headingOk) return accept();
  return rejectShort();
}

function decideLengthAgainstBaseline(
  refined: string,
  refinedLen: number,
  baselineText: string,
  currentProLen: number,
  userInstruction: string | undefined,
): LengthDecision {
  const ratio = currentProLen > 0 ? refinedLen / currentProLen : 1;
  const requiredSectionsPresent = premiumRefineRequiredSectionsAllPresent(refined);
  const revisionIntent = classifyPremiumRefineRevisionIntent(userInstruction);
  const headingPreservationRatio = computeMajorHeadingPreservationRatio(baselineText, refined);

  if (revisionIntent === "transformational_revision") {
    return decideTransformational(
      refinedLen,
      currentProLen,
      ratio,
      requiredSectionsPresent,
      revisionIntent,
      headingPreservationRatio,
    );
  }
  return decideSurgicalRefine(
    refined,
    refinedLen,
    baselineText,
    currentProLen,
    ratio,
    requiredSectionsPresent,
    revisionIntent,
    headingPreservationRatio,
  );
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
  revisionIntent: PremiumRefineRevisionIntent;
  headingPreservationRatio: number;
} {
  const refined = refinedCandidate.trim();
  const refinedLen = refined.length;
  const baselineText = (currentProText || "").trim();
  const revisionIntent = classifyPremiumRefineRevisionIntent(userInstruction);
  const headingPreservationRatio = computeMajorHeadingPreservationRatio(baselineText, refined);

  if (refinedLen < 1) {
    return {
      decision: "rejected_empty",
      refinedLen,
      ratio: 0,
      requiredSectionsPresent: false,
      revisionIntent,
      headingPreservationRatio: 1,
    };
  }
  const ratioEarly = currentProLen > 0 ? refinedLen / currentProLen : 1;
  const sectionsForLog = premiumRefineRequiredSectionsAllPresent(refined);
  if (premiumRefineSummaryIsUnchangedFailOpen(responseSummary)) {
    return {
      decision: "rejected_unchanged",
      refinedLen,
      ratio: ratioEarly,
      requiredSectionsPresent: sectionsForLog,
      revisionIntent,
      headingPreservationRatio,
    };
  }
  if (
    currentProText !== undefined &&
    normalizePremiumRefineTextForCompare(currentProText) === normalizePremiumRefineTextForCompare(refined)
  ) {
    return {
      decision: "rejected_unchanged",
      refinedLen,
      ratio: ratioEarly,
      requiredSectionsPresent: sectionsForLog,
      revisionIntent,
      headingPreservationRatio,
    };
  }
  if (currentProLen < 1) {
    return {
      decision: "accepted",
      refinedLen,
      ratio: 1,
      requiredSectionsPresent: sectionsForLog,
      revisionIntent,
      headingPreservationRatio,
    };
  }

  const { decision, ratio, requiredSectionsPresent, revisionIntent: ri, headingPreservationRatio: hpr } =
    decideLengthAgainstBaseline(refined, refinedLen, baselineText, currentProLen, userInstruction);
  return {
    decision,
    refinedLen,
    ratio,
    requiredSectionsPresent,
    revisionIntent: ri,
    headingPreservationRatio: hpr,
  };
}

/** Primary line: rejected_short near refine UI (inline). */
export const PRO_REFINE_REJECTED_SHORT_PRIMARY =
  "LawDog tried to change too much, so your document was not changed. Try a narrower instruction or use Edit wording.";

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
  return Boolean((message || "").includes("LawDog tried to change too much"));
}

/** Shown inline after a premium refine is accepted and applied. */
export const PRO_REFINE_CHANGE_APPLIED_USER_MESSAGE = "Revision applied. Review before sending.";
