/**
 * Structured recipient instruction intents: extraction + post-patch accounting.
 * Every distinct request ends as applied, failed (user-safe reason), or unclear.
 */

import type { AgreementDraft } from "./agreementTypes";
import type { AgreementFieldChange } from "../vs01/agreementCompare";
import { pauseWorkInProposed } from "./recipientPreviewDiffModel";

export type RecipientInstructionIntentStatus = "pending" | "applied" | "failed" | "unclear";

export type RecipientInstructionIntentCategory =
  | "payment_timing"
  | "late_fee"
  | "suspend_pause_work"
  | "acceptance_criteria"
  | "termination"
  | "ip_ownership"
  | "governing_law"
  | "confidentiality"
  | "signature_execution"
  | "notices"
  | "delivery_timeline"
  | "dispute_process"
  /** Operational asks verified in preview text when possible; unverified rows are suppressed (no parser-noise cards). */
  | "scope_change_management"
  | "client_delay_timeline"
  | "post_launch_support"
  | "third_party_services"
  | "defect_correction_period"
  | "uncategorized";

export type RecipientInstructionIntent = {
  id: string;
  category: RecipientInstructionIntentCategory;
  originalText: string;
  normalizedIntent: string;
  status: RecipientInstructionIntentStatus;
  reason?: string;
};

const REASON_UNCLEAR = "This request was unclear.";
/** Signer-safe — avoid engine phrasing in recipient UI. */
const REASON_NO_SECTION = "Related wording was grouped into the summary above.";
const REASON_PAYMENT_SAFE = "Could not safely place this change in the payment section.";
const REASON_BOILERPLATE = "This change may affect signatures or legal boilerplate.";
const REASON_CONFLICT = "This request conflicts with existing terms.";

function slugId(prefix: string, i: number): string {
  return `${prefix}_${i}`;
}

/** Lanes before clause-intent extraction: keeps drafting / persona context out of amendment cards. */
export type RoutedInstructionLanes = {
  draftingGuidance: string[];
  reviewerNotes: string[];
  actionableSegments: string[];
};

const SOFT_VERIFICATION_CATEGORIES: ReadonlySet<RecipientInstructionIntentCategory> = new Set([
  "scope_change_management",
  "client_delay_timeline",
  "post_launch_support",
  "third_party_services",
  "defect_correction_period",
]);

function looksLikeActionableAmendmentSegment(s: string): boolean {
  const t = s.toLowerCase();
  if (/\bnet\s*\d+/i.test(t)) return true;
  if (/\bpause\s+work\b|\bsuspend\s+work\b|\bpause\b.*\bwork\b/i.test(t)) return true;
  if (/\blate\s+fee\b|\bpenalt(y|ies)\b|\boverdue\s+charge\b/i.test(t)) return true;
  if (/\bconvert\b/i.test(t) && /\b(invoice|invoicing|payment|net)\b/i.test(t)) return true;
  if (
    /\b(add|include)\b/i.test(t) &&
    /\b(\d+\s*day|bug|defect|post[-\s]?launch|third[-\s]?party|extension|window|notice|pause\s+work|developer)\b/i.test(t)
  ) {
    return true;
  }
  if (/\bclarify\b/i.test(t) && /\b(scope|change\s+request|creep|delay|support|third[-\s]?party|post[-\s]?launch|deadline|bug|defect)\b/i.test(t)) {
    return true;
  }
  return false;
}

function isDraftingGuidanceSegment(s: string): boolean {
  if (looksLikeActionableAmendmentSegment(s)) return false;
  const t = s.toLowerCase().replace(/\s+/g, " ").trim();
  if (t.length < 4) return false;
  return (
    /\bpreserve\s+(the\s+)?(structure|numbering|formatting)\b/.test(t) ||
    /\bpreserve\s+numbering\b/.test(t) ||
    /\bavoid\s+(broad\s+)?rewrites?\b/.test(t) ||
    /\bavoid\s+rewriting\b/.test(t) ||
    /\bunrelated\s+clauses\b/.test(t) ||
    /\bprefer\s+narrow\b/.test(t) ||
    /\bapply\s+changes\s+surgically\b/.test(t) ||
    /\b(surgically|surgical(ly)?)\b.{0,48}\b(minimal|minimally)\b/.test(t) ||
    (/\b(minimal|minimally)\b/.test(t) && /\b(edit|change|insertion|amendment)\b/.test(t)) ||
    /\bcommercially\s+reasonable\b/.test(t) ||
    /\bprofessional\s+and\s+balanced\b/.test(t) ||
    /\bkeep\s+.*\b(professional|balanced|reasonable)\b/.test(t) ||
    /\bdo\s+not\s+(rewrite|replace)\b/.test(t) ||
    /\bno\s+broad\s+rewrites?\b/.test(t) ||
    /\b(full|whole)[-\s]?document\s+rewrite\b/.test(t)
  );
}

function isReviewerNoteSegment(s: string): boolean {
  if (looksLikeActionableAmendmentSegment(s)) return false;
  const t = s.toLowerCase().replace(/\s+/g, " ").trim();
  return (
    /\bperspective\s+of\b/.test(t) ||
    /\bfrom\s+.{3,80}\s+perspective\b/.test(t) ||
    /\breviewer\s+notes?\b/.test(t) ||
    /\bincorporate\s+where\s+it\s+fits\b/.test(t) ||
    /\bwhere\s+it\s+fits\b/.test(t) ||
    (/\bstronger\s+(operational|payment)\b/.test(t) && /\bprotections?\b/.test(t) && !/\bclarify\b|\badd\b|\bconvert\b/i.test(t))
  );
}

/**
 * Split on numbered list lines (1. / 2.) then on punctuation / “and” (same as legacy, but list-aware).
 */
export function splitInstructionIntoSegments(instructionPlain: string): string[] {
  const t = String(instructionPlain ?? "").trim();
  if (!t) return [];
  const body = t;
  const numberedChunks = body
    .split(/(?:^|\n)\s*\d+[\.)]\s+/m)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  const seeds = numberedChunks.length > 1 || /(?:^|\n)\s*\d+[\.)]\s+/m.test(body) ? numberedChunks : [body];
  const out: string[] = [];
  for (const seed of seeds) {
    const parts = seed
      .split(/\s*(?:;|\||\n|—|–)\s*/)
      .flatMap((p) => p.split(/\s+and\s+/i))
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    out.push(...parts);
  }
  return out.length > 0 ? out : [t];
}

function isIgnorableInstructionPreamble(s: string): boolean {
  const t = s.trim();
  if (t.length > 120) return false;
  return /^\s*please\s+revise\b/i.test(t) && !looksLikeActionableAmendmentSegment(t);
}

/** Pull trailing meta lines off the last numbered item (e.g. “…window.” then “Preserve structure…”). */
function peelTrailingMetaLinesFromSegment(seg: string): { core: string; draftingTail: string[]; reviewerTail: string[] } {
  const rawLines = seg.split(/\n/).map((l) => l.trim());
  const lines = rawLines.filter((l) => l.length > 0);
  if (lines.length <= 1) {
    return { core: seg.trim(), draftingTail: [], reviewerTail: [] };
  }
  const draftingTail: string[] = [];
  const reviewerTail: string[] = [];
  let end = lines.length;
  while (end > 0) {
    const line = lines[end - 1]!.trim();
    if (isDraftingGuidanceSegment(line)) {
      draftingTail.unshift(line);
      end -= 1;
      continue;
    }
    if (isReviewerNoteSegment(line)) {
      reviewerTail.unshift(line);
      end -= 1;
      continue;
    }
    break;
  }
  const core = lines.slice(0, end).join("\n").trim();
  return { core: core || seg.trim(), draftingTail, reviewerTail };
}

function extractPerspectivePhrase(s: string): { rest: string; phrase: string | null } {
  const m = s.match(/\bfrom\s+[\w'.-]{2,90}\s+perspective\b/i);
  if (!m || m.index === undefined) return { rest: s, phrase: null };
  const phrase = m[0].trim();
  const rest = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim();
  return { rest, phrase };
}

/** Pull persona + “Please revise …:” preamble before segment splitting (colon is usually after meta block). */
function preprocessInstructionForRouting(raw: string): { body: string; preambleReviewerNotes: string[] } {
  const preambleReviewerNotes: string[] = [];
  let t = String(raw ?? "").trim();
  const pers = extractPerspectivePhrase(t);
  if (pers.phrase) {
    preambleReviewerNotes.push(pers.phrase);
    t = pers.rest;
  }
  const protect = t.match(/\bstronger\s+(?:operational\s+and\s+)?payment\s+protections\b[^.!?\n]*/i);
  if (protect) {
    preambleReviewerNotes.push(protect[0].trim());
  }
  if (/^\s*please\s+revise/i.test(t)) {
    t = t.replace(/^\s*please\s+revise[^:]*:\s*/i, "").trim();
  }
  return { body: t, preambleReviewerNotes };
}

export function routeRecipientInstructionLanes(instructionPlain: string): RoutedInstructionLanes {
  const draftingGuidance: string[] = [];
  const reviewerNotes: string[] = [];
  const actionableSegments: string[] = [];
  const { body, preambleReviewerNotes } = preprocessInstructionForRouting(instructionPlain);
  reviewerNotes.push(...preambleReviewerNotes);
  for (const seg of splitInstructionIntoSegments(body)) {
    let s = seg.trim();
    if (!s) continue;
    if (isIgnorableInstructionPreamble(s)) continue;
    const peeled = peelTrailingMetaLinesFromSegment(s);
    draftingGuidance.push(...peeled.draftingTail);
    reviewerNotes.push(...peeled.reviewerTail);
    s = peeled.core;
    if (!s) continue;
    if (isDraftingGuidanceSegment(s)) draftingGuidance.push(s);
    else if (isReviewerNoteSegment(s)) reviewerNotes.push(s);
    else actionableSegments.push(s);
  }
  return { draftingGuidance, reviewerNotes, actionableSegments };
}

/** One line for the preview panel (drafting + persona context; not amendment failures). */
export function formatRecipientInstructionContextSummary(lanes: RoutedInstructionLanes): string | null {
  const bits = [...lanes.reviewerNotes, ...lanes.draftingGuidance].map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!bits.length) return null;
  const short = bits.map((b) => (b.length > 100 ? `${b.slice(0, 97)}…` : b));
  return `Reviewer context considered: ${short.join(" · ")}`;
}

function operationalSoftCategorySatisfied(
  category: RecipientInstructionIntentCategory,
  proposedPlain: string,
  purpose: string,
  paymentTerms: string,
): boolean {
  const blob = `${proposedPlain}\n${purpose}\n${paymentTerms}`.toLowerCase();
  switch (category) {
    case "post_launch_support":
      return /post[-\s]?launch|support.{0,60}(exclud|not included|outside)|(exclud|outside).{0,60}support|separately agreed/.test(
        blob,
      );
    case "third_party_services":
      return /third[-\s]?party|subcontractor|vendor.{0,40}(outage|failure|unavail)|platform.{0,40}(failure|outage|unavail)/.test(
        blob,
      );
    case "client_delay_timeline":
      return /client.{0,50}delay|delay.{0,40}(extend|deadline)|extend.{0,30}deadline|timeline.{0,30}extend/.test(blob);
    case "defect_correction_period":
      return /\b14\b.{0,40}(day|business).{0,50}(bug|defect|correct|fix)/.test(blob) || /bug[-\s]?fix/.test(blob);
    case "scope_change_management":
      return /scope\s+(creep|change)|change\s+order|change\s+request/.test(blob);
    default:
      return false;
  }
}

function filterSoftOperationalDisplayNoise(intents: readonly RecipientInstructionIntent[]): RecipientInstructionIntent[] {
  return intents.filter((i) => {
    if (!SOFT_VERIFICATION_CATEGORIES.has(i.category)) return true;
    return i.status === "applied";
  });
}

function classifySegment(raw: string): RecipientInstructionIntentCategory {
  const t = raw.toLowerCase();
  if (t.length < 3) return "uncategorized";
  if (/\bpause\s+work\b|\bsuspend\s+work\b|\bpause\b.*\bwork\b.*\b(late|days)\b|\bwork\b.*\b(after|more\s+than)\b.*\bdays?\b.*\blate\b/i.test(t)) {
    return "suspend_pause_work";
  }
  if (/\bnet\s*\d+\b|\bupon\s+receipt\b|\bpayable\s+(within|in)\s+\d+\s*days?\b|\bdue\s+(on\s+)?receipt\b|\bpayment\s+timing\b/i.test(t)) {
    return "payment_timing";
  }
  if (/\blate\s+fee\b|\binterest\b|\bpenalt(y|ies)\b|\boverdue\s+charge\b/i.test(t)) return "late_fee";
  if (/\bscope\s+creep\b|\bchange\s+requests?\b|\bchange\s+order\b/i.test(t)) return "scope_change_management";
  if (/\bpost[-\s]?launch\b.*\bsupport\b|\bsupport\b.*\b(post[-\s]?launch|excluded|outside)\b|\bexcluded\b.*\bsupport\b/i.test(t)) {
    return "post_launch_support";
  }
  if (/\bthird[-\s]?party\b.*\b(service|services|platform|provider|failure)\b|\bplatform\s+failure\b/i.test(t)) {
    return "third_party_services";
  }
  if (/\bclient\b.*\bdelay|\bdelay(s)?\b.*\bextend|\bextend(s|ing)?\b.*\bdeadline/i.test(t)) return "client_delay_timeline";
  if (/\b14\b.*\bday.*\b(bug|defect|fix|correct)/i.test(t) || /\bbug[-\s]?fix\b.*\b(window|period|days?)\b/i.test(t)) {
    return "defect_correction_period";
  }
  if (/\bconfidential\b|\bconfidentiality\b|\bnda\b|\bnon[- ]?disclosure\b/i.test(t)) return "confidentiality";
  if (/\bgoverning\s+law\b|\bjurisdiction\b|\bchoice\s+of\s+law\b/i.test(t)) return "governing_law";
  if (/\bterminat(e|ion)\b|\bcancel(lation)?\b|\bnotice\s+period\b/i.test(t)) return "termination";
  if (/\bintellectual\s+property\b|\bip\s+ownership\b|\bwork\s+for\s+hire\b|\bassign(s|ment)?\b.*\bright(s)?\b/i.test(t)) {
    return "ip_ownership";
  }
  if (/\bacceptance\s+criteria\b|\bUAT\b|\bsign[- ]?off\b/i.test(t)) return "acceptance_criteria";
  if (/\bsignature\b|\bexecution\b|\bwitness\b|\bnotarize\b|\bin\s+witness\s+whereof\b/i.test(t)) return "signature_execution";
  if (/\bnotices?\b.*\b(address|provision|email)\b|\bnotice\s+information\b/i.test(t)) return "notices";
  if (/\bdeliverable(s)?\b|\bmilestone(s)?\b|\bdelivery\s+timeline\b|\bproject\s+schedule\b/i.test(t)) return "delivery_timeline";
  if (/\barbitrat(e|ion)\b|\bmediation\b|\bdispute\s+resolution\b|\bvenue\b/i.test(t)) return "dispute_process";
  return "uncategorized";
}

function normalizeIntentLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function extractRecipientInstructionIntents(
  instructionPlain: string,
  options?: { lanes?: RoutedInstructionLanes },
): RecipientInstructionIntent[] {
  const lanes = options?.lanes ?? routeRecipientInstructionLanes(instructionPlain);
  const segs = lanes.actionableSegments;
  if (segs.length === 0) return [];
  const out: RecipientInstructionIntent[] = [];
  const seen = new Set<string>();
  let i = 0;
  for (const seg of segs) {
    const cat = classifySegment(seg);
    if (cat === "uncategorized" && seg.length < 8) {
      const id = slugId("intent", i++);
      out.push({
        id,
        category: "uncategorized",
        originalText: seg,
        normalizedIntent: normalizeIntentLabel(seg),
        status: "unclear",
        reason: REASON_UNCLEAR,
      });
      continue;
    }
    const key = `${cat}:${seg.toLowerCase().slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = slugId("intent", i++);
    out.push({
      id,
      category: cat,
      originalText: seg,
      normalizedIntent: normalizeIntentLabel(seg),
      status: "pending",
    });
  }
  return out;
}

function netTimingPresentInText(plain: string): boolean {
  return /\bnet\s*\d+\b/i.test(plain) || /\bupon\s+receipt\b/i.test(plain);
}

function snapshotFieldChanged(rows: readonly AgreementFieldChange[], field: string): boolean {
  return rows.some((r) => r.field === field && r.changed);
}

export type FinalizeRecipientInstructionIntentsParams = {
  instructionPlain: string;
  currentPlain: string;
  proposedPlain: string;
  baselineDraft: AgreementDraft;
  proposedDraft: AgreementDraft;
  changedFields: readonly AgreementFieldChange[];
  paymentTermsInlinePlacementFailed: boolean;
  narrowRecipientTargetedRedline: boolean;
  /** True when display uses field patch (not full revise HTML compare). */
  fieldPatchDisplay: boolean;
};

/**
 * After patch generation: set each intent to applied | failed | unclear with user-safe reasons.
 */
export function postProcessIntentConflicts(intents: RecipientInstructionIntent[]): RecipientInstructionIntent[] {
  if (!detectConflictingPaymentTimingIntents(intents)) return intents;
  let keptFirstApplied = false;
  return intents.map((i) => {
    if (i.category !== "payment_timing") return i;
    if (i.status === "applied") {
      if (!keptFirstApplied) {
        keptFirstApplied = true;
        return i;
      }
      return { ...i, status: "failed" as const, reason: REASON_CONFLICT };
    }
    if (i.status === "failed" || i.status === "unclear") return i;
    return { ...i, status: "failed" as const, reason: REASON_CONFLICT };
  });
}

export function finalizeRecipientInstructionIntents(p: FinalizeRecipientInstructionIntentsParams): RecipientInstructionIntent[] {
  const lanes = routeRecipientInstructionLanes(p.instructionPlain);
  const intents = extractRecipientInstructionIntents(p.instructionPlain, { lanes });
  const propPlainLower = (p.proposedPlain || "").toLowerCase();
  const payAfter = String(p.proposedDraft.payment_terms ?? "").toLowerCase();
  const payBefore = String(p.baselineDraft.payment_terms ?? "").toLowerCase();

  const resolved = intents.map((intent) => {
    if (intent.status === "unclear") return intent;

    const next: RecipientInstructionIntent = { ...intent };

    if (intent.category === "payment_timing") {
      if (p.paymentTermsInlinePlacementFailed && p.narrowRecipientTargetedRedline) {
        next.status = "failed";
        next.reason = REASON_PAYMENT_SAFE;
        return next;
      }
      const fieldChanged = snapshotFieldChanged(p.changedFields, "payment_terms") && payAfter !== payBefore;
      const askedNet = intent.originalText.match(/\bnet\s*(\d+)/i);
      let timingSatisfied = false;
      if (askedNet) {
        const re = new RegExp(`\\bnet\\s*${askedNet[1]}\\b`, "i");
        timingSatisfied = re.test(p.proposedPlain) || re.test(payAfter);
      } else {
        const appliedInPlain = netTimingPresentInText(p.proposedPlain);
        timingSatisfied =
          appliedInPlain ||
          (fieldChanged && (netTimingPresentInText(payAfter) || netTimingPresentInText(p.proposedPlain)));
      }
      if (timingSatisfied) {
        next.status = "applied";
        return next;
      }
      next.status = "failed";
      next.reason = REASON_NO_SECTION;
      return next;
    }

    if (intent.category === "suspend_pause_work") {
      const hasPause = pauseWorkInProposed(p.proposedDraft.payment_terms || "", p.proposedPlain);
      if (hasPause) {
        next.status = "applied";
        return next;
      }
      if (p.fieldPatchDisplay && p.narrowRecipientTargetedRedline) {
        next.status = "failed";
        next.reason = REASON_PAYMENT_SAFE;
        return next;
      }
      next.status = "failed";
      next.reason = REASON_NO_SECTION;
      return next;
    }

    if (intent.category === "late_fee") {
      const hit = /\b(late\s+fee|interest|penalt(y|ies))\b/i.test(payAfter) && payAfter !== payBefore;
      next.status = hit ? "applied" : "failed";
      next.reason = hit ? undefined : REASON_NO_SECTION;
      return next;
    }

    if (SOFT_VERIFICATION_CATEGORIES.has(intent.category)) {
      const purpose = p.proposedDraft.purpose || "";
      const pay = p.proposedDraft.payment_terms || "";
      const hit = operationalSoftCategorySatisfied(intent.category, p.proposedPlain, purpose, pay);
      const material =
        snapshotFieldChanged(p.changedFields, "purpose") ||
        snapshotFieldChanged(p.changedFields, "payment_terms") ||
        snapshotFieldChanged(p.changedFields, "duration");
      const textHint = propPlainLower.includes(intent.normalizedIntent.slice(0, Math.min(22, intent.normalizedIntent.length)).toLowerCase());
      if (hit || (material && textHint)) {
        next.status = "applied";
        return next;
      }
      next.status = "failed";
      next.reason = REASON_NO_SECTION;
      return next;
    }

    if (intent.category === "confidentiality") {
      const purpose = p.proposedDraft.purpose || "";
      const hit = snapshotFieldChanged(p.changedFields, "purpose") && /\bconfidential(ity)?\b/i.test(purpose);
      next.status = hit ? "applied" : "failed";
      next.reason = hit ? undefined : REASON_NO_SECTION;
      return next;
    }

    if (intent.category === "governing_law") {
      const hit = snapshotFieldChanged(p.changedFields, "jurisdiction");
      next.status = hit ? "applied" : "failed";
      next.reason = hit ? undefined : REASON_NO_SECTION;
      return next;
    }

    if (intent.category === "signature_execution" || intent.category === "notices") {
      const parties = snapshotFieldChanged(p.changedFields, "parties");
      next.status = parties ? "applied" : "failed";
      next.reason = parties ? undefined : REASON_BOILERPLATE;
      return next;
    }

    if (
      intent.category === "termination" ||
      intent.category === "ip_ownership" ||
      intent.category === "acceptance_criteria" ||
      intent.category === "delivery_timeline" ||
      intent.category === "dispute_process"
    ) {
      const material =
        snapshotFieldChanged(p.changedFields, "purpose") ||
        snapshotFieldChanged(p.changedFields, "duration") ||
        snapshotFieldChanged(p.changedFields, "payment_terms");
      const textHint = propPlainLower.includes(intent.normalizedIntent.slice(0, 24).toLowerCase());
      if (material && textHint) {
        next.status = "applied";
        return next;
      }
      if (material) {
        next.status = "applied";
        return next;
      }
      next.status = "unclear";
      next.reason = REASON_UNCLEAR;
      return next;
    }

    if (intent.category === "uncategorized") {
      if (intent.originalText.length > 24) {
        next.status = "unclear";
        next.reason = REASON_UNCLEAR;
      } else {
        next.status = "failed";
        next.reason = REASON_NO_SECTION;
      }
      return next;
    }

    next.status = "failed";
    next.reason = REASON_NO_SECTION;
    return next;
  });

  return filterSoftOperationalDisplayNoise(postProcessIntentConflicts(resolved));
}

/** For chips / summaries: intents that need user attention. */
export function countRecipientIntentGaps(intents: readonly RecipientInstructionIntent[]): number {
  return intents.filter((i) => i.status === "failed" || i.status === "unclear").length;
}

/** Stable `data-testid` for request-status rows (scroll targets use {@link recipientRedlineAnchorForIntentCategory}). */
export function recipientIntentStatusTestId(category: RecipientInstructionIntentCategory): string {
  if (category === "suspend_pause_work") return "recipient-intent-status-pause_suspend_work";
  return `recipient-intent-status-${category}`;
}

/** `data-recipient-redline-anchor` value aligned with intent categories for narrow payment preview. */
export function recipientRedlineAnchorForIntentCategory(category: RecipientInstructionIntentCategory): string | null {
  if (category === "payment_timing") return "payment_timing";
  if (category === "suspend_pause_work") return "pause_suspend_work";
  return null;
}

/** Short label after “Added:” for applied intents. */
export function formatRecipientIntentAppliedLabel(it: RecipientInstructionIntent): string {
  switch (it.category) {
    case "payment_timing":
      return `${it.normalizedIntent} (payment timing)`;
    case "suspend_pause_work":
      return `${it.normalizedIntent} (pause / suspend work)`;
    case "late_fee":
      return `${it.normalizedIntent} (late fees)`;
    case "confidentiality":
      return `${it.normalizedIntent} (confidentiality)`;
    case "governing_law":
      return `${it.normalizedIntent} (governing law)`;
    case "termination":
      return `${it.normalizedIntent} (termination)`;
    case "ip_ownership":
      return `${it.normalizedIntent} (IP / ownership)`;
    case "scope_change_management":
      return `${it.normalizedIntent} (scope / change control)`;
    case "client_delay_timeline":
      return `${it.normalizedIntent} (client delays / timeline)`;
    case "post_launch_support":
      return `${it.normalizedIntent} (post-launch support)`;
    case "third_party_services":
      return `${it.normalizedIntent} (third-party services)`;
    case "defect_correction_period":
      return `${it.normalizedIntent} (defect / bug-fix period)`;
    default:
      return it.normalizedIntent;
  }
}

/** Deterministic conflict check (e.g. two different Net days in one instruction). */
export function detectConflictingPaymentTimingIntents(intents: readonly RecipientInstructionIntent[]): boolean {
  const nets = intents
    .filter((i) => i.category === "payment_timing")
    .map((i) => {
      const m = i.originalText.match(/\bnet\s*(\d+)\b/i);
      return m ? Number(m[1]) : null;
    })
    .filter((n): n is number => n != null);
  return new Set(nets).size > 1;
}
