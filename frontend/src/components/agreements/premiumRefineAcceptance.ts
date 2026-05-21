import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PAID_PRO_REFINE_INSTRUCTION_PLACEHOLDER } from "./reviewRefineUserCopy";
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

export type PremiumRefineApplyDecision =
  | "accepted"
  | "rejected_short"
  | "rejected_empty"
  | "rejected_unchanged"
  /** LLM output passed length gates but failed clause-local surgical outcome checks (e.g. convenience notice days). */
  | "rejected_surgical_postcondition_failed";

export type PremiumRefineRevisionIntent =
  | "surgical_revision"
  | "transformational_revision"
  /** Add notes / review guidance — never replace the agreement body with a model rewrite. */
  | "advisory_note_or_comment";

export type PremiumRefineRequiredSectionsPresence = {
  title: boolean;
  parties: boolean;
  scope: boolean;
  payment: boolean;
  term: boolean;
  ownershipOrConfidentiality: boolean;
};

/** Paid Pro guided completion heading (Finalize + draft card). */
export const PRO_REFINE_REVISE_SECTION_HEADING = "Complete your agreement";

/** Neutral Pro review heading when guided questions are not mounted. */
export const PRO_REFINE_NEUTRAL_REVIEW_HEADING = "Draft ready to review";

export function proRefineSectionHeadingForRenderState(
  state: { shouldShowCompleteAgreementHeading: boolean } | null | undefined,
): string {
  return state?.shouldShowCompleteAgreementHeading
    ? PRO_REFINE_REVISE_SECTION_HEADING
    : PRO_REFINE_NEUTRAL_REVIEW_HEADING;
}

/** Short helper under the guided completion flow. */
export const PRO_REFINE_REVISE_HELPER =
  "Finish key business terms one at a time — we'll update your draft as you go.";

/** @deprecated Use guided completion panel; freeform refine still uses placeholder. */
export const PRO_REFINE_FREEFORM_PLACEHOLDER = PAID_PRO_REFINE_INSTRUCTION_PLACEHOLDER;

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

/** True when the user explicitly asked to remove, extract, or replace the whole agreement. */
export function instructionAllowsMaterialDocumentChange(userInstruction: string | undefined): boolean {
  if (instructionAllowsExtremeShrink(userInstruction)) return true;
  const t = (userInstruction || "").trim();
  if (!t) return false;
  return /\b(delete|extract\s+only|omit\s+sections?|remove\s+(?:the\s+)?(?:entire|whole)|replace\s+(?:the\s+)?(?:entire|whole)\s+document)\b/i.test(
    t,
  );
}

/** Bracket placeholders like [ADDRESS_1], [PARTY_2], [DATE_3]. */
const PREMIUM_REFINE_BRACKET_PLACEHOLDER_RE = /\[[A-Z][A-Z0-9_]*_\d+\]/g;
/** e.g. `1.[ADDRESS_1]` */
const PREMIUM_REFINE_SECTION_DOT_PLACEHOLDER_RE = /\b\d+\.\[[A-Z]/;
/** e.g. `US $4,[ADDRESS_6]` or `$ 4,500, [` (formatted amount then stray bracket). */
const PREMIUM_REFINE_MONEY_COMMA_BRACKET_RE =
  /\$\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*,\s*\[/i;

export function scanPremiumRefinePlaceholderCorruption(text: string): { count: number; samples: string[] } {
  const t = text || "";
  const matches = t.match(PREMIUM_REFINE_BRACKET_PLACEHOLDER_RE) || [];
  const samples = [...new Set(matches.map((x) => x.slice(0, 48)))].slice(0, 8);
  let count = matches.length;
  if (PREMIUM_REFINE_SECTION_DOT_PLACEHOLDER_RE.test(t)) {
    count += 1;
    if (samples.length < 8) samples.push("[pattern:section_dot_placeholder]");
  }
  if (PREMIUM_REFINE_MONEY_COMMA_BRACKET_RE.test(t)) {
    count += 1;
    if (samples.length < 8) samples.push("[pattern:money_comma_bracket]");
  }
  return { count, samples };
}

export function premiumRefineTextContainsPlaceholderCorruption(text: string): boolean {
  return scanPremiumRefinePlaceholderCorruption(text).count > 0;
}

const ADVISORY_SANITIZE_MIN_RETAIN_CHARS = 8;

function lineContainsAdvisoryPlaceholderCorruption(line: string): boolean {
  /** Same rules as {@link premiumRefineTextContainsPlaceholderCorruption} — applies anywhere on the line (e.g. `* 2.[A…`). */
  return premiumRefineTextContainsPlaceholderCorruption(line);
}

/**
 * Strip LawDog-style placeholder corruption from advisory / checklist / model-excerpt text.
 * Removes whole lines that contain bracket tokens, section-dot corruption, or money+bracket corruption.
 */
export function sanitizeAdvisoryNoteTextForAppend(text: string): string {
  const raw = (text || "").replace(/\r\n/g, "\n");
  if (!raw.trim()) return "";
  const kept: string[] = [];
  for (const line of raw.split("\n")) {
    if (lineContainsAdvisoryPlaceholderCorruption(line)) continue;
    kept.push(line);
  }
  const out = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (out.length < ADVISORY_SANITIZE_MIN_RETAIN_CHARS) return "";
  return out;
}

/** Deterministic reviewer bullets — never echo user, checklist, or model text. */
export const STRUCTURED_ADVISORY_ITEMS = {
  payment_timing: "Confirm payment amounts, timing, due dates, and trigger conditions.",
  invoicing: "Clarify invoicing process, delivery method, and payment instructions.",
  acceptance: "Clarify acceptance criteria, review window, and what constitutes final delivery.",
  scope: "Review scope of services, included deliverables, revisions, and out-of-scope handling.",
  confidentiality: "Confirm confidentiality obligations, permitted disclosures, and return or deletion of confidential information.",
  ip_ownership: "Review ownership of final deliverables, background materials, licenses, and third-party materials.",
  termination: "Confirm termination rights, refund treatment, payment for work performed, and handoff obligations.",
  support: "Decide whether any post-delivery support, bug-fix window, or maintenance obligation should be included.",
  access_credentials: "Confirm who provides account access, credentials, third-party tools, and related fees.",
  governing_law: "Confirm governing law, venue, notice method, and dispute-resolution process.",
} as const;

export type StructuredAdvisoryKey = keyof typeof STRUCTURED_ADVISORY_ITEMS;

/** Stable canonical key order for sorting and truncation. */
export const STRUCTURED_ADVISORY_KEY_ORDER = Object.keys(STRUCTURED_ADVISORY_ITEMS) as StructuredAdvisoryKey[];

export const STRUCTURED_ADVISORY_DEFAULT_KEYS: StructuredAdvisoryKey[] = ["acceptance", "payment_timing", "scope"];

/**
 * Lowercase and strip placeholder / malformed fragments so keyword derivation never keys off raw corruption.
 */
export function normalizeTextForStructuredAdvisoryDerivation(raw: string): string {
  let t = (raw || "").toLowerCase();
  t = t.replace(/\[[a-z][a-z0-9_]*_\d+\]/gi, " ");
  t = t.replace(/\[[A-Z][A-Z0-9_]*_\d+\]/g, " ");
  t = t.replace(/\b\d+\s*\.\s*\[[a-z]/gi, " ");
  t = t.replace(/\$\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*,\s*\[/gi, " ");
  t = t.replace(/[^a-z0-9\s%.-]/gi, " ");
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Derive advisory topic keys from instruction + optional checklist text only (no output text).
 * Returns keys in {@link STRUCTURED_ADVISORY_KEY_ORDER} (subset, deduped).
 */
export function deriveStructuredAdvisoryKeys(input: string, checklist?: string[] | undefined): StructuredAdvisoryKey[] {
  const parts = [input, ...((checklist || []).map((x) => String(x ?? "")) as string[])].filter((x) => x.trim().length);
  const corpus = parts.join("\n");
  const normalized = normalizeTextForStructuredAdvisoryDerivation(corpus);
  if (!normalized) return [];
  const found = new Set<StructuredAdvisoryKey>();

  const add = (key: StructuredAdvisoryKey, re: RegExp) => {
    if (re.test(normalized)) found.add(key);
  };

  add("payment_timing", /\b(payments?|payment|fees?|fee|late|deposit|upfront|final balance|pricing|due)\b/i);
  add("invoicing", /\b(invoice|invoicing|bill|billing)\b/i);
  add("acceptance", /\b(accept|acceptance|delivery|final delivery|review window)\b/i);
  add("scope", /\b(scope|deliverable|deliverables|revisions?|out-of-scope|out of scope|change request)\b/i);
  add("confidentiality", /\b(confidential|confidentiality|nda|non-disclosure|secret|non-public)\b/i);
  add(
    "ip_ownership",
    /\b(intellectual property|\bips?\b|licenses?|licensing|background materials|work product|third-party materials)\b|\bip\s+assignment\b/i,
  );
  add(
    "termination",
    /\b(terminate|termination|cancel|cancellation|refund|non-refundable|stop work|stops?|mid[-\s]?project)\b/i,
  );
  add("support", /\b(support|bugs?|maintenance|warranty|fix period)\b/i);
  add("access_credentials", /\b(access|credentials|hosting|analytics|third-party tools)\b/i);
  add(
    "governing_law",
    /\b(governing law|applicable law|venue|jurisdiction|dispute-resolution|dispute resolution|disputes?|arbitration|mediation|courts?|notices?)\b/i,
  );

  return STRUCTURED_ADVISORY_KEY_ORDER.filter((k) => found.has(k));
}

/**
 * Resolves 3–7 deterministic bullets: defaults when nothing matched; fills to at least three using canonical order;
 * truncates to seven in canonical order.
 */
export function resolveStructuredAdvisoryKeysForAppend(
  input: string,
  checklist?: string[] | undefined,
): StructuredAdvisoryKey[] {
  const derived = deriveStructuredAdvisoryKeys(input, checklist);
  const selected = new Set<StructuredAdvisoryKey>(derived);
  if (selected.size === 0) {
    return [...STRUCTURED_ADVISORY_DEFAULT_KEYS];
  }
  if (selected.size < 3) {
    for (const k of STRUCTURED_ADVISORY_KEY_ORDER) {
      if (selected.size >= 3) break;
      selected.add(k);
    }
  }
  let ordered = STRUCTURED_ADVISORY_KEY_ORDER.filter((k) => selected.has(k));
  if (ordered.length > 7) {
    ordered = ordered.slice(0, 7);
  }
  return ordered;
}

export function buildStructuredAdvisoryInnerMarkdown(keys: readonly StructuredAdvisoryKey[]): string {
  const bullets = keys.map((k) => `- ${STRUCTURED_ADVISORY_ITEMS[k]}`).join("\n");
  return (
    "**Requested by drafting party:** Reviewer requested a list of items the other party should review.\n\n" +
    "**Flagged / readiness items (from LawDog review):**\n" +
    bullets
  );
}

/** Dev / CI invariant for structured advisory append (baseline must be corruption-free for prefix check). */
export function assertStructuredAdvisoryAppendInvariants(baselineText: string, finalDoc: string): void {
  if (premiumRefineTextContainsPlaceholderCorruption(baselineText)) return;
  const base = baselineText.trimEnd();
  if (!finalDoc.startsWith(base)) {
    throw new Error("[advisory-append] baseline prefix invariant failed");
  }
  if (!finalDoc.includes("REVIEWER NOTE / REQUESTED REVIEW ITEMS")) {
    throw new Error("[advisory-append] reviewer header invariant failed");
  }
  if (premiumRefineTextContainsPlaceholderCorruption(finalDoc)) {
    throw new Error("[advisory-append] corruption invariant failed");
  }
}

/**
 * Explicit operative edits — must stay {@link PremiumRefineRevisionIntent} `surgical_revision`, not advisory.
 * Kept conservative so "add some notes for review" does not match late-fee / clause-add patterns.
 */
function hasStrongOperativeEditIntent(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (!t) return false;

  if (/\badd\s+(?:a|an)?\s*\d+(?:\.\d+)?\s*%\b.*\b(?:late|fee|overdue|days?)\b/i.test(t)) return true;
  if (/\badd\s+(?:a|an)?\s*(?:late[-\s]?payment\s+)?fee\b.*\b\d+(?:\.\d+)?\s*%/i.test(t)) return true;
  if (/\badd\s+(?:a|an)?\s*\d+(?:\.\d+)?\s*%\s*(?:late|fee|if)\b/i.test(t)) return true;

  if (/\badd\s+(?:a|an)?\s*(?:confidentiality|non[-\s]?disclosure|nda)\s+clause\b/i.test(t)) return true;
  if (/\badd\s+(?:a|an)?\s*(?:mutual\s+)?(?:indemnity|non[-\s]?compete|liquidated\s+damages)\s+clause\b/i.test(t))
    return true;

  if (/\bchange\s+governing\s+law\b/i.test(t)) return true;
  if (/\bchange\s+(?:the\s+)?deadline\b/i.test(t)) return true;
  if (/\bmake\s+the\s+deadline\b/i.test(t)) return true;

  if (/\breplace\s+(?:the\s+)?(?:payment|confidentiality|indemnity|entire|whole)\s+section\b/i.test(t)) return true;
  if (/\breplace\s+section\s+\d+/i.test(t)) return true;

  if (/\bdelete\s+section\b/i.test(t)) return true;
  if (/\bremove\s+section\b/i.test(t)) return true;
  if (/\bamend\s+section\b/i.test(t)) return true;
  if (/\binsert\s+(?:a|an)?\s+clause\b/i.test(t)) return true;

  return false;
}

/**
 * Advisory / comment / reviewer guidance — preserve agreement bytes and append notes, never treat as surgical rewrite.
 */
export function isAdvisoryNoteOrCommentIntent(userInstruction: string | undefined): boolean {
  const raw = (userInstruction || "").trim();
  if (raw.length < 8) return false;
  if (hasStrongOperativeEditIntent(raw)) return false;
  const t = raw.toLowerCase();

  /** Realistic hand-off / pre-send review language (not operative rewrites). */
  const humanReviewAsk =
    /\bnotes?\s+for\s+review\b/i.test(raw) ||
    /\badd\s+(?:some\s+)?notes?\s+for\s+review\b/i.test(raw) ||
    /\bcan\s+you\s+add\s+(?:some\s+)?notes?\s+for\s+review\b/i.test(raw) ||
    /\bflag\s+anything\??\b/i.test(t) ||
    /\bflag\s+what(?:ever)?\b/i.test(t) ||
    /\banything\s+i\s+should\s+double[-\s]?check\b/i.test(t) ||
    /\bbefore\s+i\s+send\b/i.test(t) ||
    /\bbefore\s+sending(?:\s+this)?\b/i.test(t) ||
    /\bwhat\s+should\s+(?:the\s+)?(?:other\s+party|counterparty)\s+review\b/i.test(t) ||
    /\banything\s+unclear\b/i.test(t) ||
    /\banything\s+i\s+missed\b/i.test(t) ||
    /\bdouble[-\s]?check\b/i.test(t) &&
      /\b(before\s+send|sending|this|review|anything|unclear|party|agreement|contract)\b/i.test(t) ||
    (/\bfeels\s+like\b/i.test(t) && /\bflag\b/i.test(t)) ||
    (/\b(can\s+you\s+)?flag\b/i.test(t) &&
      /\b(anything|unclear|open|missing|risks?|gaps?|concerns?)\b/i.test(t)) ||
    (/\b(risks?|gaps?|concerns?)\b/i.test(t) &&
      /\b(for\s+review|to\s+review|before\s+i\s+send|notes?\b|flag|double[-\s]?check|reviewer)\b/i.test(t));

  if (humanReviewAsk) return true;

  /** Conversational review bullets (questions / open points), usually after a review ask or "like:". */
  const hasReviewishBulletQuestions =
    /\n\s*[-*•]\s*[^\n]{2,120}\?/m.test(raw) &&
    /\b(like|review|notes?|flag|check|unclear|timing|launch|project|party|happen|bugs?|support|cancel|delivery|acceptance|mid[-\s]?project)\b/i.test(
      t,
    );
  if (hasReviewishBulletQuestions) return true;

  const noteVerb =
    /\b(make\s+(?:a\s+)?notes?|noted?|note\s+(?:of|that|to)|add\s+(?:some\s+)?(?:a\s+)?notes?\b|capture\s+(?:a\s+)?notes?|jot\s+down|leave\s+(?:a\s+)?notes?|note\s+this)\b/i.test(
      raw,
    );
  const reviewLens = /\b(reviewer|reviewer's|for\s+the\s+reviewer|review\s+notes?|peer\s+review|comments?\s+for|requested\s+review)\b/i.test(
    raw,
  );
  const practiceOrItems =
    /\b(best\s+practices?|best\s+for|flagged|needs\s+details|unresolved|these|those|issues?|comments?|checklist)\b/i.test(
      t,
    );
  if (noteVerb && (reviewLens || practiceOrItems)) return true;
  if (reviewLens && /\b(notes?|summarize|capture|record)\b/i.test(t)) return true;
  if (/\bbest\s+practices?\b/i.test(t) && /\b(notes?|reviewer|comment)\b/i.test(t)) return true;
  if (/\bapply\b/i.test(t) && /\b(issues?|comments?|flags?|best)\b/i.test(t) && (noteVerb || /\breviewer\b/i.test(t)))
    return true;

  // QA + universal review / improvement phrasing (not clause edits like "Add late fee…")
  if (/\bmake\s+notes?\b/i.test(raw) && /\b(review|improv|agreement|contract|anything)\b/i.test(t)) return true;
  if (/\b(anything|everything)\s+that\s+should\s+be\s+(reviewed|improved)\b/i.test(t)) return true;
  if (/\banything\s+to\s+review\b/i.test(t)) return true;

  // List / review-item handoffs for another party — no "note" or "comment" required
  if (/\blist\s+items\b/i.test(t) && /\b(?:the\s+)?(?:other\s+party|counterparty|signer)\b/i.test(t) && /\breview\b/i.test(t))
    return true;
  if (/\bitems\s+the\s+other\s+party\s+should\s+review\b/i.test(t)) return true;
  if (/\bother\s+party\s+should\s+review\b/i.test(t)) return true;
  if (/\blist\s+review\s+items\b/i.test(t)) return true;
  if (/\bcounterparty\s+should\s+review\b/i.test(t)) return true;
  if (/\bsigner\s+should\s+review\b/i.test(t)) return true;
  if (/\b(?:the\s+)?party\s+should\s+review\b/i.test(t)) return true;

  if (/\bfor\s+review\b/i.test(t) && /\b(notes?|list|items?|checklist|comments?|instruction)\b/i.test(t)) return true;
  if (/\b(add|leave)\s+(?:a\s+)?comments?\b/i.test(t) && /\b(review|reviewer|agreement|counterparty)\b/i.test(t))
    return true;
  if (/\bflag\s+(?:the\s+)?(risks?|issues?|gaps?|concerns?|open\s+items?)\b/i.test(t)) return true;
  if (/\bred\s+flags?\b/i.test(t) && /\b(list|notes?|add|capture|flag)\b/i.test(t)) return true;
  if (/\bbest\s+practic(es?|e)\b/i.test(t) && /\b(suggest|recommended|review|change)\b/i.test(t)) return true;
  if (/\bfor\s+(?:the\s+)?(?:reviewer|other\s+party|counterparty|signer)\b/i.test(t) && /\b(notes?|comment|list|checklist)\b/i.test(t))
    return true;
  if (/\b(review\s+checklist|negotiation\s+checklist|add\s+(?:a\s+)?checklist)\b/i.test(t)) return true;
  if (/\b(summarize|list)\s+what\s+to\s+review\b/i.test(t)) return true;
  if (/\b(flag\s+what\s+matters)\b/i.test(t)) return true;
  if (/\b(recommended\s+changes|improvement\s+suggestions|negotiation\s+flags)\b/i.test(t)) return true;
  if (/\bopen\s+issues?\b/i.test(t) && /\b(notes?|add|list|capture|flag)\b/i.test(t)) return true;

  return false;
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
  if (isAdvisoryNoteOrCommentIntent(userInstruction)) return "advisory_note_or_comment";
  return "surgical_revision";
}

/**
 * @deprecated Prefer {@link isAdvisoryNoteOrCommentIntent} (same behavior, expanded patterns).
 * Reviewer-note / comment / best-practice capture — not a full agreement rewrite.
 */
export function looksLikeReviewerNoteOrCommentIntent(userInstruction: string | undefined): boolean {
  return isAdvisoryNoteOrCommentIntent(userInstruction);
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

/** Synthetic instruction so length gate treats append-only output as surgical preserve expansion. */
export const PREMIUM_REFINE_EVAL_APPEND_ONLY_INSTR =
  "Precise surgical wording tweak in section 2 only; preserve all other agreement text.";

/**
 * When {@link classifyPremiumRefineRevisionIntent} is advisory, accept append-preserve output that
 * keeps the baseline clean, prefixes the baseline, includes the reviewer heading, and has no
 * placeholder corruption — even if generic length gates would reject.
 */
export function tryPremiumRefineAdvisoryAppendAcceptance(args: {
  userInstruction: string;
  finalAppendDoc: string;
  baselineText: string;
  baselineLen: number;
}): {
  decision: "accepted";
  refinedLen: number;
  ratio: number;
  requiredSectionsPresent: boolean;
  revisionIntent: PremiumRefineRevisionIntent;
  headingPreservationRatio: number;
} | null {
  if (classifyPremiumRefineRevisionIntent(args.userInstruction) !== "advisory_note_or_comment") {
    return null;
  }
  const base = args.baselineText;
  const doc = (args.finalAppendDoc || "").trim();
  if (!base.trim().length || !doc.length) return null;
  if (premiumRefineTextContainsPlaceholderCorruption(base)) return null;
  if (premiumRefineTextContainsPlaceholderCorruption(doc)) return null;
  if (!doc.includes("REVIEWER NOTE / REQUESTED REVIEW ITEMS")) return null;
  if (!doc.startsWith(base)) return null;

  const refinedLen = doc.length;
  const ratio = args.baselineLen > 0 ? refinedLen / args.baselineLen : 1;
  return {
    decision: "accepted",
    refinedLen,
    ratio,
    requiredSectionsPresent: premiumRefineRequiredSectionsAllPresent(doc),
    revisionIntent: "advisory_note_or_comment",
    headingPreservationRatio: computeMajorHeadingPreservationRatio(base.trim(), doc),
  };
}

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
  if (revisionIntent === "advisory_note_or_comment") {
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

  const {
    decision: lengthDecision,
    ratio,
    requiredSectionsPresent,
    revisionIntent: ri,
    headingPreservationRatio: hpr,
  } = decideLengthAgainstBaseline(refined, refinedLen, baselineText, currentProLen, userInstruction);
  let decision = lengthDecision;
  if (decision === "accepted") {
    if (premiumRefineTextContainsPlaceholderCorruption(refined)) {
      const st = scanPremiumRefinePlaceholderCorruption(refined);
      if (typeof console !== "undefined" && typeof console.info === "function") {
        // eslint-disable-next-line no-console
        console.info("[premium_candidate_rejected_placeholder_tokens]", {
          tokenCount: st.count,
          samples: st.samples,
        });
      }
      decision = "rejected_short";
    } else if (
      ri === "surgical_revision" &&
      currentProLen >= 8000 &&
      ratio < 0.55 &&
      !instructionAllowsMaterialDocumentChange(userInstruction)
    ) {
      if (typeof console !== "undefined" && typeof console.info === "function") {
        // eslint-disable-next-line no-console
        console.info("[premium_refine_rejected_material_collapse]", {
          authoritativeLen: currentProLen,
          candidateLen: refinedLen,
          ratio,
          revisionIntent: ri,
        });
      }
      decision = "rejected_short";
    }
  }
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

/**
 * After surgical preserve retry + deterministic fallbacks, shrink/unsafe output — document unchanged.
 */
export const PRO_REFINE_SURGICAL_REJECTED_SHORT_EXHAUSTED =
  "LawDog could not safely apply that change automatically. Use Edit wording for a precise manual change.";

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
  const m = (message || "").trim();
  if (!m) return false;
  return m.includes("LawDog tried to change too much") || m.includes("could not safely apply that change automatically");
}

/** Surgical path exhausted (retry + fallbacks); document unchanged. */
export function isProRefineSurgicalExhaustedMessage(message: string | undefined): boolean {
  return Boolean((message || "").includes("could not safely apply that change automatically"));
}

/** Shown inline after a premium refine is accepted and applied. */
export const PRO_REFINE_CHANGE_APPLIED_USER_MESSAGE = "Revision applied. Review before sending.";

/** Model changed text but did not perform the requested termination-for-convenience notice edit. */
export const PRO_REFINE_SURGICAL_POSTCONDITION_FAILED_MESSAGE =
  "That change was not applied because the termination-for-convenience notice period in the draft still does not match your request. Try a narrower instruction or use Edit wording.";

/** Success line for advisory / reviewer-note append (What changed + Latest update + toast). */
export const PRO_REFINE_ADVISORY_APPEND_SUCCESS_SUMMARY =
  "Appended reviewer note; full agreement preserved.";

/** After append-only reviewer note path (full agreement preserved). */
export const PRO_REFINE_REVIEWER_NOTE_APPLIED_USER_MESSAGE = PRO_REFINE_ADVISORY_APPEND_SUCCESS_SUMMARY;

/** True when UI should not surface generic `summary_changes` / model lines for this refine. */
export function isAppendReviewerRefineDecision(decision: string | null | undefined): boolean {
  const t = (decision || "").trim();
  return (
    t === "append_reviewer_note_preserve_document" ||
    t === "append_reviewer_note_advisory_forced_after_eval_miss" ||
    t === "fallback_forced_append_reviewer_header"
  );
}

/**
 * UI / console diagnostics: never show `surgical_revision` for a successful advisory append when the
 * user prompt is classified as advisory (eval historically used a synthetic instruction for length gates).
 */
export function effectivePremiumRefineApplyLogRevisionIntent(args: {
  userInstruction: string;
  acceptance: { decision: PremiumRefineApplyDecision; revisionIntent: PremiumRefineRevisionIntent };
  refineApplyDecision: string | null;
  usedAppendReviewerNotePreserve: boolean;
}): PremiumRefineRevisionIntent {
  const classified = classifyPremiumRefineRevisionIntent(args.userInstruction);
  if (
    args.acceptance.decision === "accepted" &&
    classified === "advisory_note_or_comment" &&
    (args.usedAppendReviewerNotePreserve || isAppendReviewerRefineDecision(args.refineApplyDecision))
  ) {
    return "advisory_note_or_comment";
  }
  return args.acceptance.revisionIntent;
}

export function shouldUseProRefineAdvisoryAppendSuccessCopy(args: {
  userInstruction: string;
  usedAppendReviewerNotePreserve: boolean;
  refineApplyDecision: string | null;
}): boolean {
  if (args.usedAppendReviewerNotePreserve) return true;
  if (isAppendReviewerRefineDecision(args.refineApplyDecision)) return true;
  return classifyPremiumRefineRevisionIntent(args.userInstruction) === "advisory_note_or_comment";
}
