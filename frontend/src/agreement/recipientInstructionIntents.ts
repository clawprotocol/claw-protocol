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
const REASON_NO_SECTION = "No matching section was found.";
const REASON_PAYMENT_SAFE = "Could not safely place this change in the payment section.";
const REASON_BOILERPLATE = "This change may affect signatures or legal boilerplate.";
const REASON_CONFLICT = "This request conflicts with existing terms.";

function slugId(prefix: string, i: number): string {
  return `${prefix}_${i}`;
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

/**
 * Split instruction into distinct request fragments (conjunction / punctuation aware).
 */
export function splitInstructionIntoSegments(instructionPlain: string): string[] {
  const t = String(instructionPlain ?? "").trim();
  if (!t) return [];
  const parts = t
    .split(/\s*(?:;|\||\n|—|–)\s*/)
    .flatMap((p) => p.split(/\s+and\s+/i))
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts : [t];
}

export function extractRecipientInstructionIntents(instructionPlain: string): RecipientInstructionIntent[] {
  const segs = splitInstructionIntoSegments(instructionPlain);
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
  const intents = extractRecipientInstructionIntents(p.instructionPlain);
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

  return postProcessIntentConflicts(resolved);
}

/** For chips / summaries: intents that need user attention. */
export function countRecipientIntentGaps(intents: readonly RecipientInstructionIntent[]): number {
  return intents.filter((i) => i.status === "failed" || i.status === "unclear").length;
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
