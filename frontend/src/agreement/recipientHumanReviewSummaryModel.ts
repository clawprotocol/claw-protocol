/**
 * Human-readable recipient review summary (signer trust layer).
 * Maps semantic chips into calm bullets and important vs. clarification buckets.
 */

import { RECIPIENT_PREVIEW_NOTHING_SENT_UNTIL_SENDER_ACCEPTS } from "./portableReviewCopy";
import type { RecipientCompareConfidence } from "./recipientCompareConfidence";

export type HumanReviewChipBucket = "important" | "clarification";

/** Map friendly chip labels from {@link buildRecipientFriendlyRedlineChips} into buckets. */
export function classifyFriendlyChipBucket(chip: string): HumanReviewChipBucket {
  const c = chip.trim().toLowerCase();
  if (!c) return "clarification";

  const clarificationHints =
    /formatting|heading|restructur|cleanup|typo|grammar|style|capitalization|spacing|punctuation|professional standard|delivery method wording|wording cleanup/i;
  if (clarificationHints.test(chip)) return "clarification";

  const importantHints =
    /payment|invoice|net\s|timeline protection|pause|suspend|nonpayment|overdue|scope|ownership|intellectual property|ip\b|third-party|liability|indemnif|terminat|confidential|govern|venue|acceptance|obligation|fee|compensation|warranty|deliverable|milestone/i;
  if (importantHints.test(chip)) return "important";

  return "important";
}

/** Lowercase sentence-style bullet for lists (chips are already plain English). */
export function friendlyChipToReviewBullet(chip: string): string {
  const t = chip.trim();
  if (!t) return "";
  return t.charAt(0).toLowerCase() + t.slice(1);
}

export type HumanReviewGroupedChips = {
  important: string[];
  clarifications: string[];
};

export function groupFriendlyChipsForHumanReview(chips: readonly string[]): HumanReviewGroupedChips {
  const important: string[] = [];
  const clarifications: string[] = [];
  const seen = new Set<string>();
  for (const raw of chips) {
    const c = raw.trim();
    if (!c || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase());
    if (classifyFriendlyChipBucket(c) === "clarification") clarifications.push(c);
    else important.push(c);
  }
  return { important, clarifications };
}

export function humanReviewMeaningfulCount(
  chips: readonly string[],
  changedBlockCount: number,
): number {
  if (chips.length > 0) return chips.length;
  return Math.min(12, Math.max(1, changedBlockCount));
}

/**
 * Display name for headline — caller passes resolved reviewer label or "The reviewer".
 */
export function buildHumanReviewHeadline(reviewerDisplayLabel: string, meaningfulCount: number): string {
  const who = (reviewerDisplayLabel || "").trim() || "The reviewer";
  const n = Math.max(1, meaningfulCount);
  const unit = n === 1 ? "meaningful revision" : "meaningful revisions";
  return `${who} proposed ${n} ${unit}.`;
}

export function buildHumanReviewNegativeAssurances(
  instructionPlain: string,
  changedFieldKeys: readonly string[],
): string[] {
  const t = String(instructionPlain ?? "").toLowerCase();
  const fields = new Set(changedFieldKeys.map((k) => k.toLowerCase()));

  const out: string[] = [];

  const signingMention =
    /\b(sign|signature|witness|execute|notar|initials?|counterpart)\b/.test(t) || fields.has("parties");
  if (!signingMention) {
    out.push("No signing terms changed.");
  }

  const govMention = /\b(govern|jurisdiction|venue|choice of law|applicable law)\b/.test(t) || fields.has("jurisdiction");
  if (!govMention) {
    out.push("No governing law changes.");
  }

  const increaseMention =
    /\b(increase|raise|higher fee|additional fee|more than|mark-?up|markup|premium)\b/.test(t) ||
    /\b(rate|fee|price)\s+(increase|hike)\b/.test(t);
  if (!increaseMention) {
    out.push("No compensation increase requested.");
  }

  return out;
}

export type HumanReviewStructuredForPdf = {
  headlinePlain: string;
  importantBullets: string[];
  clarificationBullets: string[];
  negativeAssuranceLines: string[];
  confidenceHeadline: string;
  confidenceBody: string;
  nothingSentFootnote: string;
};

/**
 * Bundles copy for the first page of the redline PDF (human layer).
 */
export function buildHumanReviewStructuredForPdf(params: {
  reviewerHeadlineName: string;
  chips: readonly string[];
  changedBlockCount: number;
  instructionPlain: string;
  changedFieldKeys: readonly string[];
  confidence: RecipientCompareConfidence;
}): HumanReviewStructuredForPdf {
  const grouped = groupFriendlyChipsForHumanReview(params.chips);
  const meaningful = humanReviewMeaningfulCount(params.chips, params.changedBlockCount);
  const headlinePlain = buildHumanReviewHeadline(params.reviewerHeadlineName, meaningful);
  const importantBullets = grouped.important.map(friendlyChipToReviewBullet);
  const clarificationBullets = grouped.clarifications.map(friendlyChipToReviewBullet);
  return {
    headlinePlain,
    importantBullets,
    clarificationBullets,
    negativeAssuranceLines: buildHumanReviewNegativeAssurances(params.instructionPlain, params.changedFieldKeys),
    confidenceHeadline: params.confidence.headline,
    confidenceBody: params.confidence.body,
    nothingSentFootnote: RECIPIENT_PREVIEW_NOTHING_SENT_UNTIL_SENDER_ACCEPTS,
  };
}
