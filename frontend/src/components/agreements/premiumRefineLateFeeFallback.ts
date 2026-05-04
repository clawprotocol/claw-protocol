import { evaluatePremiumRefineCandidate, premiumRefineSummaryIsUnchangedFailOpen } from "./premiumRefineAcceptance";

type PremiumRefineAcceptanceResult = ReturnType<typeof evaluatePremiumRefineCandidate>;

/** Shown when refine returns no diff but the agreement already covers late/overdue fees. */
export const PRO_REFINE_LATE_FEE_ALREADY_PRESENT_MESSAGE =
  "Your agreement already includes a late-payment or overdue-fee provision. No change was applied.";

const LATE_FEE_INSTRUCTION_RE = /late\s*fee|late\s*payment|overdue|past\s*due|days?\s*(?:after|past)/i;

/** User text looks like “add X% late fee after N days” (used for local fallback + duplicate messaging). */
export function looksLikeLateFeeInstruction(instr: string): boolean {
  const t = instr.trim();
  return LATE_FEE_INSTRUCTION_RE.test(t) && /%/.test(t) && /\d+\s*days?/i.test(t);
}

/**
 * Heuristic: doc already expresses overdue/late payment with a percentage (avoid duplicate clauses).
 */
export function documentAlreadyHasLateFeeClause(doc: string): boolean {
  const d = doc.toLowerCase();
  const overdueish = /overdue|past due|not paid when due|late payment|late fee|late charge|delinquent/i.test(d);
  const pctToken =
    /\d+(?:\.\d+)?\s*%|\(\s*\d+(?:\.\d+)?\s*%\s*\)|(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+percent/i;
  const pctish = pctToken.test(d) && /overdue|past due|late|unpaid|amount due|not paid/i.test(d);
  return overdueish && pctish;
}

function parseLateFeeParams(instruction: string): { pct: number; days: number } | null {
  const pctM = instruction.match(/(\d+(?:\.\d+)?)\s*%/);
  const daysM = instruction.match(/(\d+)\s*days?/i);
  if (!pctM || !daysM) return null;
  return { pct: Number(pctM[1]), days: Number(daysM[1]) };
}

function insertClauseBeforeSignatures(doc: string, clauseBlock: string): string {
  const witness = doc.search(/\n\s*(IN WITNESS WHEREOF|EXECUTED AS OF|EXECUTION PAGE|SIGNATURES?)\b/i);
  if (witness < 0) return `${doc.trimEnd()}${clauseBlock}`;
  return `${doc.slice(0, witness).trimEnd()}${clauseBlock}\n${doc.slice(witness)}`;
}

/** Optional: place clause after a Payment/Fees heading when structure is obvious. */
function insertAfterPaymentHeading(doc: string, clauseBlock: string): string | null {
  const re = /\n(?:#{1,3}\s*|\d+\.\s*)?(Payment|Fees|Compensation|Pricing|Fee Schedule)\b[^\n]{0,160}\n/i;
  const m = doc.match(re);
  if (!m || m.index === undefined) return null;
  const start = m.index + m[0].length;
  const tail = doc.slice(start);
  const rel = tail.search(/\n\n(?:#{1,3}\s+|\d+\.\s+[A-Z0-9])/);
  const cut = rel >= 0 ? start + rel : start + Math.min(tail.length, 6000);
  return `${doc.slice(0, cut).trimEnd()}${clauseBlock}${doc.slice(cut)}`;
}

export function tryPremiumRefineLateFeeLocalFallback(args: {
  currentDocumentText: string;
  userInstruction: string;
}): { text: string; summaryLine: string } | null {
  const doc = args.currentDocumentText;
  const instr = args.userInstruction.trim();
  if (!doc.trim() || !instr) return null;
  if (!looksLikeLateFeeInstruction(instr)) return null;
  const params = parseLateFeeParams(instr);
  if (!params) return null;
  if (documentAlreadyHasLateFeeClause(doc)) return null;

  const clauseBody = `Late Payment. Any undisputed amount not paid within ${params.days} calendar days after the due date may accrue a late fee equal to ${params.pct}% of the overdue amount until paid in full. Except as expressly modified by this paragraph, all other terms of this agreement remain unchanged.`;
  const clauseBlock = `\n\n${clauseBody}\n\n`;

  const viaHeading = insertAfterPaymentHeading(doc, clauseBlock);
  const text = viaHeading ?? insertClauseBeforeSignatures(doc, clauseBlock);
  return {
    text,
    summaryLine: `Added a late-payment clause: ${params.pct}% after ${params.days} days overdue.`,
  };
}

export function augmentPremiumRefineUserPrompt(instruction: string): string {
  const t = instruction.trim();
  if (!t) return t;
  return `${t}\n\n[Preserve-first editing: apply this to the full document. Keep the document type; preserve existing sections, headings, numbering, and order; preserve parties, names, dates, amounts, signature blocks, governing law, confidentiality, liability, termination, payment, IP, and other material clauses unless the user explicitly asked to shorten, simplify, summarize, rewrite from scratch, convert format, or replace the document. Only add, revise, or clarify what is needed for this request — do not compress, summarize, remove, or re-outline unless they asked for that. Return the complete updated document text only.]`;
}

function joinSummaryChanges(summary: string[] | undefined): string | null {
  if (!summary?.length) return null;
  const j = summary.map((x) => String(x ?? "").trim()).filter(Boolean).join(" ").trim();
  return j.length ? j : null;
}

export type PremiumRefineResolveOutcome = {
  finalText: string;
  acceptance: PremiumRefineAcceptanceResult;
  usedLocalLateFeeFallback: boolean;
  whatChangedLine: string | null;
  unchangedDuplicateLateFee: boolean;
};

/**
 * Re-evaluate API output; if unchanged while user gave a substantive instruction, try late-fee local insert.
 */
export function resolvePremiumRefineApplyOutcome(args: {
  apiOut: string;
  baselineText: string;
  baselineLen: number;
  summaryChanges: string[] | undefined;
  userInstruction: string;
}): PremiumRefineResolveOutcome {
  const { apiOut, baselineText, baselineLen, summaryChanges, userInstruction } = args;
  const inst = userInstruction.trim();
  const out0 = (apiOut || "").trim();
  let acc = evaluatePremiumRefineCandidate(out0, baselineText, baselineLen, summaryChanges, inst);

  if (acc.decision === "accepted") {
    return {
      finalText: out0,
      acceptance: acc,
      usedLocalLateFeeFallback: false,
      whatChangedLine: joinSummaryChanges(summaryChanges),
      unchangedDuplicateLateFee: false,
    };
  }

  if (
    acc.decision === "rejected_unchanged" &&
    inst.length > 0 &&
    !premiumRefineSummaryIsUnchangedFailOpen(summaryChanges)
  ) {
    const fb = tryPremiumRefineLateFeeLocalFallback({
      currentDocumentText: baselineText,
      userInstruction: inst,
    });
    if (fb) {
      const out1 = fb.text.trim();
      const acc1 = evaluatePremiumRefineCandidate(out1, baselineText, baselineLen, summaryChanges, inst);
      if (acc1.decision === "accepted") {
        return {
          finalText: out1,
          acceptance: acc1,
          usedLocalLateFeeFallback: true,
          whatChangedLine: fb.summaryLine,
          unchangedDuplicateLateFee: false,
        };
      }
    }
    const dup = looksLikeLateFeeInstruction(inst) && documentAlreadyHasLateFeeClause(baselineText);
    return {
      finalText: out0,
      acceptance: acc,
      usedLocalLateFeeFallback: false,
      whatChangedLine: null,
      unchangedDuplicateLateFee: dup,
    };
  }

  return {
    finalText: out0,
    acceptance: acc,
    usedLocalLateFeeFallback: false,
    whatChangedLine: null,
    unchangedDuplicateLateFee: false,
  };
}
