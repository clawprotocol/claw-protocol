import {
  assertStructuredAdvisoryAppendInvariants,
  buildStructuredAdvisoryInnerMarkdown,
  classifyPremiumRefineRevisionIntent,
  evaluatePremiumRefineCandidate,
  isAdvisoryNoteOrCommentIntent,
  looksLikeReviewerNoteOrCommentIntent,
  normalizePremiumRefineTextForCompare,
  premiumRefineSummaryIsUnchangedFailOpen,
  premiumRefineTextContainsPlaceholderCorruption,
  PRO_REFINE_ADVISORY_APPEND_SUCCESS_SUMMARY,
  resolveStructuredAdvisoryKeysForAppend,
  scanPremiumRefinePlaceholderCorruption,
  tryPremiumRefineAdvisoryAppendAcceptance,
} from "./premiumRefineAcceptance";
import { postPremiumRefine, type PremiumRefineResponse } from "./premiumRefineApi";

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

/** Mirrors backend `CLIENT_DELIVERABLES_FINAL_PAYMENT_CLAUSE` for deterministic insert. */
export const CLIENT_DELIVERABLES_FINAL_PAYMENT_CLAUSE =
  "Final payment is due after final delivery and Client approval of the deliverables, " +
  "or deemed acceptance under Section 3.4. Client may not unreasonably withhold approval " +
  "for deliverables that materially conform to the agreed scope.";

const CLIENT_DELIVERABLES_INSTR_RE =
  /\b(?:final\s+payment|before\s+final\s+payment|payment\s+is\s+due)\b/i;
const CLIENT_DELIVERABLES_DELIV_RE = /\b(?:deliverable|deliverables)\b/i;
const CLIENT_DELIVERABLES_APPROVAL_RE = /\b(?:approve|approval|accept|acceptance)\b/i;

/** Instruction class that maps to deterministic client-approval-before-final-payment insert. */
export function looksLikeClientDeliverablesFinalPaymentInstruction(instr: string): boolean {
  const t = instr.trim();
  if (t.length < 12) return false;
  return (
    CLIENT_DELIVERABLES_INSTR_RE.test(t) &&
    CLIENT_DELIVERABLES_DELIV_RE.test(t) &&
    CLIENT_DELIVERABLES_APPROVAL_RE.test(t)
  );
}

export function documentHasClientDeliverablesFinalPaymentLanguage(doc: string): boolean {
  const low = (doc || "").toLowerCase();
  return (
    low.includes("deliverables") &&
    low.includes("final payment") &&
    (low.includes("approval") || low.includes("approve") || low.includes("acceptance"))
  );
}

/**
 * Deterministic insert (mirrors server `premium_refine_narrow._insert_client_deliverables_final_payment_clause`).
 * Preserves full document and signature block when possible.
 */
export function tryPremiumRefineClientDeliverablesFinalPaymentLocalFallback(args: {
  currentDocumentText: string;
  userInstruction: string;
}): { text: string; summaryLine: string } | null {
  const doc = args.currentDocumentText;
  const instr = args.userInstruction.trim();
  if (!doc.trim() || !instr) return null;
  if (!looksLikeClientDeliverablesFinalPaymentInstruction(instr)) return null;
  if (documentHasClientDeliverablesFinalPaymentLanguage(doc)) return null;

  const block =
    "\n\n### Client approval of deliverables before final payment\n\n" +
    CLIENT_DELIVERABLES_FINAL_PAYMENT_CLAUSE +
    "\n\n";

  const witness = doc.search(/\n\s*(IN WITNESS WHEREOF|EXECUTED AS OF|EXECUTION PAGE|SIGNATURES?)\b/i);
  if (witness >= 0) {
    const head = doc.slice(0, witness).trimEnd();
    const tail = doc.slice(witness);
    return {
      text: `${head}${block}${tail}`,
      summaryLine:
        "Added client approval of deliverables before final payment, preserving the full agreement.",
    };
  }
  const payM = doc.match(
    /^(?:#{1,3}\s*|\d+\.)?\s*(?:4[\.\s][^\n]*Final[^\n]*Payment|Final\s+Payment)[^\n]*\s*$/im,
  );
  if (payM && payM.index !== undefined) {
    const pos = payM.index + payM[0].length;
    const tail = doc.slice(pos);
    const dbl = tail.indexOf("\n\n");
    const insertAt = pos + (dbl >= 0 ? dbl + 2 : 0);
    return {
      text: `${doc.slice(0, insertAt).trimEnd()}${block}${doc.slice(insertAt)}`,
      summaryLine:
        "Added client approval of deliverables before final payment, preserving the full agreement.",
    };
  }
  const accM = doc.match(/^(?:#{1,3}\s*|\d+\.)?\s*3\.4[^\n]*Acceptance[^\n]*\s*$/im);
  if (accM && accM.index !== undefined) {
    const pos = accM.index + accM[0].length;
    const tail = doc.slice(pos);
    const dbl = tail.indexOf("\n\n");
    const insertAt = pos + (dbl >= 0 ? dbl + 2 : Math.min(tail.length, 400));
    return {
      text: `${doc.slice(0, insertAt).trimEnd()}${block}${doc.slice(insertAt)}`,
      summaryLine:
        "Added client approval of deliverables before final payment, preserving the full agreement.",
    };
  }
  return {
    text: `${doc.trimEnd()}${block}`,
    summaryLine:
      "Added client approval of deliverables before final payment, preserving the full agreement.",
  };
}

export function augmentPremiumRefineUserPrompt(instruction: string): string {
  const t = instruction.trim();
  if (!t) return t;
  return `${t}\n\n[Preserve-first editing: Return the COMPLETE agreement. Do not summarize, replace the agreement, or omit sections. Make only the requested change. If adding a clause, insert it into the most relevant existing section and preserve all other text. Apply this to the full document; preserve existing sections, headings, numbering, parties, signature blocks, and material clauses unless the user explicitly asked to shorten, simplify, summarize, rewrite from scratch, convert format, or replace the document. Return the complete updated document text only.]`;
}

/**
 * Deterministic advisory appendix (structured defaults) — no user/model/checklist text echoed.
 * Built from {@link resolveStructuredAdvisoryKeysForAppend} with empty input.
 */
export const STATIC_MINIMAL_SAFE_BLOCK = (() => {
  const keys = resolveStructuredAdvisoryKeysForAppend("", undefined);
  return `## REVIEWER NOTE / REQUESTED REVIEW ITEMS\n\n${buildStructuredAdvisoryInnerMarkdown(keys)}`.trim();
})();

const ADVISORY_APPEND_ADMIN_FOOTER =
  "\n*This section is administrative / reviewer-facing. It does not amend the operative agreement text above unless the parties separately agree in writing.*\n";

/** Baseline + static block + admin footer (placeholder-safe). */
export function appendStaticAdvisoryMinimalSafeBlock(base: string): string {
  return `${base.trimEnd()}\n\n${STATIC_MINIMAL_SAFE_BLOCK}${ADVISORY_APPEND_ADMIN_FOOTER}`;
}

function finalizeAdvisoryAppendDocGuard(base: string, candidate: string, context: string): string {
  let out = candidate;
  if (premiumRefineTextContainsPlaceholderCorruption(out)) {
    // eslint-disable-next-line no-console
    console.info("[premium-refine-advisory-final-corruption-blocked]", {
      context,
      priorLen: out.length,
    });
    out = appendStaticAdvisoryMinimalSafeBlock(base);
  }
  if (premiumRefineTextContainsPlaceholderCorruption(out)) {
    // eslint-disable-next-line no-console
    console.error("[premium-refine-advisory-final-corruption-invariant]", { context });
  }
  return out;
}

function appendLog(finalDoc: string, base: string): void {
  // eslint-disable-next-line no-console
  console.info("[premium-refine-append]", {
    appended: true,
    baselineLen: base.length,
    finalLen: finalDoc.length,
    hasReviewerHeader: finalDoc.includes("## REVIEWER NOTE"),
  });
}

/**
 * Prefix-preserves the authoritative agreement and appends a structured reviewer section.
 * User instruction, checklist, and model output are used only for keyword → topic mapping; bullets are always
 * fixed `STRUCTURED_ADVISORY_ITEMS` copy from `premiumRefineAcceptance`.
 */
export function buildAdvisoryAppendPreserveDocument(args: {
  currentDocumentText: string;
  userInstruction: string;
  /** Unused for appendix body — kept for call-site compatibility. */
  modelOut: string;
  checklistLines?: string[] | undefined;
  /** @deprecated No-op: output is always the structured template. */
  forceMinimalSafeReviewerBody?: boolean;
}): string {
  const base = args.currentDocumentText;

  if (args.forceMinimalSafeReviewerBody) {
    const out = finalizeAdvisoryAppendDocGuard(base, appendStaticAdvisoryMinimalSafeBlock(base), "force_minimal");
    appendLog(out, base);
    return out;
  }

  const keys = resolveStructuredAdvisoryKeysForAppend(args.userInstruction, args.checklistLines);
  const inner = buildStructuredAdvisoryInnerMarkdown(keys);
  const isAdditional = base.includes("REVIEWER NOTE / REQUESTED REVIEW ITEMS");
  const block = isAdditional
    ? `### Additional reviewer note (same session)\n\n${inner}`
    : `## REVIEWER NOTE / REQUESTED REVIEW ITEMS\n\n${inner}`;
  const finalDoc = `${base.trimEnd()}\n\n---\n\n${block}${ADVISORY_APPEND_ADMIN_FOOTER}`;

  const guarded = finalizeAdvisoryAppendDocGuard(base, finalDoc, "build_advisory_append");
  if (!premiumRefineTextContainsPlaceholderCorruption(base)) {
    assertStructuredAdvisoryAppendInvariants(base, guarded);
  }
  appendLog(guarded, base);
  return guarded;
}

/** Merge LawDog premium-review / route bullets into the refine prompt when available. */
export function buildPremiumRefineChecklistBullets(
  review:
    | {
        missing_or_weak_terms?: string[];
        questions_for_user?: string[];
        suggested_clause_upgrades?: string[];
      }
    | null
    | undefined,
  reviewRoute: { unresolved_items?: string[] } | null | undefined,
): string[] {
  const out: string[] = [];
  if (review) {
    for (const x of review.missing_or_weak_terms ?? []) {
      const s = String(x ?? "").trim();
      if (s) out.push(s);
    }
    for (const x of review.questions_for_user ?? []) {
      const s = String(x ?? "").trim();
      if (s) out.push(s);
    }
    for (const x of review.suggested_clause_upgrades ?? []) {
      const s = String(x ?? "").trim();
      if (s) out.push(s);
    }
  }
  for (const x of reviewRoute?.unresolved_items ?? []) {
    const s = String(x ?? "").trim();
    if (s) out.push(s);
  }
  return [...new Set(out)].slice(0, 24);
}

export function augmentPremiumRefineUserPromptWithChecklist(
  instruction: string,
  checklistLines: string[] | undefined,
): string {
  const core = augmentPremiumRefineUserPrompt(instruction);
  const lines = (checklistLines || []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 20);
  if (!lines.length) return core;
  return `${core}\n\n[LawDog / readiness context — use only where relevant to the user's request; do not invent economics or parties. If the user asked for reviewer notes, comments, or to capture best-practice / flagged issues, append a clearly labeled reviewer-note section at the end instead of replacing the agreement:]\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

/**
 * When the model returns a too-short body but the user asked for reviewer notes, preserve the
 * full agreement bytes and append an administrative section.
 */
export function tryAppendReviewerNotePreserveDocument(args: {
  currentDocumentText: string;
  userInstruction: string;
  shortCandidate: string;
  checklistLines?: string[] | undefined;
}): { text: string; summaryLine: string } | null {
  if (!isAdvisoryNoteOrCommentIntent(args.userInstruction)) return null;
  const base = args.currentDocumentText;
  if (!base || base.length < 500) return null;
  const shortRaw = (args.shortCandidate || "").trim();
  if (shortRaw.length >= base.length * 0.92) return null;

  const text = buildAdvisoryAppendPreserveDocument({
    currentDocumentText: base,
    userInstruction: args.userInstruction,
    modelOut: shortRaw,
    checklistLines: args.checklistLines,
  });
  return {
    text,
    summaryLine: PRO_REFINE_ADVISORY_APPEND_SUCCESS_SUMMARY,
  };
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

export type PremiumRefineExecuteOutcome = PremiumRefineResolveOutcome & {
  usedClientDeliverablesFinalPaymentFallback: boolean;
  usedSurgicalPreserveRetry: boolean;
  surgicalRejectedShortExhausted: boolean;
  lastRefineResponse: PremiumRefineResponse | null;
  usedAppendReviewerNotePreserve: boolean;
  /** Prefer for QA logs when a fallback path applied (e.g. append reviewer note). */
  refineApplyDecision: string | null;
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
  if (classifyPremiumRefineRevisionIntent(inst) === "advisory_note_or_comment" && acc.decision === "accepted") {
    acc = { ...acc, decision: "rejected_short" };
  }

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

function toExecuteExtras(
  base: PremiumRefineResolveOutcome,
  extras: {
    usedClientDeliverablesFinalPaymentFallback: boolean;
    usedSurgicalPreserveRetry: boolean;
    surgicalRejectedShortExhausted: boolean;
    lastRefineResponse: PremiumRefineResponse | null;
    usedAppendReviewerNotePreserve: boolean;
    refineApplyDecision: string | null;
  },
): PremiumRefineExecuteOutcome {
  return { ...base, ...extras };
}

function logPremiumRefineDebugLine(args: {
  userInstruction: string;
  intent: ReturnType<typeof classifyPremiumRefineRevisionIntent>;
  currentDocLen: number;
  candidateLen: number;
  outputLen: number;
  applyDecision: string | null;
  usedAppendReviewerNotePreserve: boolean;
}): void {
  const promptPreview = args.userInstruction.slice(0, 120);
  // eslint-disable-next-line no-console
  console.info("[premium-refine-debug]", {
    promptPreview,
    intent: args.intent,
    isAdvisory: args.intent === "advisory_note_or_comment",
    currentDocLen: args.currentDocLen,
    candidateLen: args.candidateLen,
    outputLen: args.outputLen,
    applyDecision: args.applyDecision,
    usedAppendReviewerNotePreserve: args.usedAppendReviewerNotePreserve,
  });
}

/**
 * Single exit: QA logs + advisory visibility fallback when the pipeline returns “accepted”
 * without a reviewer heading (prod classification / UI drift diagnosis).
 */
function finalizePremiumRefineExecuteOutcome(args: {
  userInstruction: string;
  baselineText: string;
  baselineLen: number;
  refineChecklistBullets: string[] | undefined;
  candidateLen: number;
  outcome: PremiumRefineExecuteOutcome;
}): PremiumRefineExecuteOutcome {
  const inst = args.userInstruction.trim();
  const intent = classifyPremiumRefineRevisionIntent(inst);
  const applyDecision = args.outcome.refineApplyDecision ?? args.outcome.acceptance.decision;
  logPremiumRefineDebugLine({
    userInstruction: inst,
    intent,
    currentDocLen: args.baselineLen,
    candidateLen: args.candidateLen,
    outputLen: args.outcome.finalText.length,
    applyDecision,
    usedAppendReviewerNotePreserve: args.outcome.usedAppendReviewerNotePreserve,
  });

  if (
    intent === "advisory_note_or_comment" &&
    args.outcome.acceptance.decision === "accepted" &&
    !args.outcome.finalText.includes("## REVIEWER NOTE")
  ) {
    const appendBase =
      args.outcome.finalText.length >= args.baselineLen * 0.92 ? args.outcome.finalText : args.baselineText;
    const patched = buildAdvisoryAppendPreserveDocument({
      currentDocumentText: appendBase,
      userInstruction: inst,
      modelOut: "",
      checklistLines: args.refineChecklistBullets,
    });
    // eslint-disable-next-line no-console
    console.info("[premium-refine-fallback-forced-append]", {
      appendBaseLen: appendBase.length,
      patchedLen: patched.length,
      containsReviewerAfterPatch: patched.includes("## REVIEWER NOTE"),
    });
    const accPatched = evaluatePremiumRefineCandidate(patched, args.baselineText, args.baselineLen, undefined, inst);
    if (accPatched.decision !== "accepted") {
      // eslint-disable-next-line no-console
      console.info("[premium-refine-fallback-forced-append]", {
        note: "patched_eval_not_accepted",
        decision: accPatched.decision,
      });
      return args.outcome;
    }
    return {
      ...args.outcome,
      finalText: patched,
      acceptance: accPatched,
      usedAppendReviewerNotePreserve: true,
      refineApplyDecision: "fallback_forced_append_reviewer_header",
      whatChangedLine:
        args.outcome.whatChangedLine?.trim() || PRO_REFINE_ADVISORY_APPEND_SUCCESS_SUMMARY,
    };
  }
  return args.outcome;
}

type PremiumRefineEvalResult = ReturnType<typeof evaluatePremiumRefineCandidate>;

/** Advisory append-preserve: accept when baseline is clean and append is a safe prefix extension. */
function mergeAdvisoryAppendEvaluate(
  userInstruction: string,
  built: string,
  baselineText: string,
  baselineLen: number,
  acc: PremiumRefineEvalResult,
): PremiumRefineEvalResult {
  if (classifyPremiumRefineRevisionIntent(userInstruction) === "advisory_note_or_comment") {
    return (
      tryPremiumRefineAdvisoryAppendAcceptance({
        userInstruction,
        finalAppendDoc: built,
        baselineText,
        baselineLen,
      }) ??
      tryPremiumRefineAdvisoryAppendAcceptance({
        userInstruction,
        finalAppendDoc: appendStaticAdvisoryMinimalSafeBlock(baselineText),
        baselineText,
        baselineLen,
      }) ??
      acc
    );
  }
  if (acc.decision === "accepted") return acc;
  return (
    tryPremiumRefineAdvisoryAppendAcceptance({
      userInstruction,
      finalAppendDoc: built,
      baselineText,
      baselineLen,
    }) ?? acc
  );
}

/**
 * Paid Pro refine: POST → accept gate → optional surgical preserve retry → deterministic deliverables clause.
 */
export async function executePremiumRefineUpdate(args: {
  baselineText: string;
  baselineLen: number;
  intakeText: string;
  userInstruction: string;
  signal?: AbortSignal;
  /** LawDog premium-review + route bullets, appended to refine prompt and reviewer-note section. */
  refineChecklistBullets?: string[] | undefined;
}): Promise<PremiumRefineExecuteOutcome> {
  const { baselineText, baselineLen, intakeText, userInstruction, signal, refineChecklistBullets } = args;
  const inst = userInstruction.trim();
  const userPrompt = augmentPremiumRefineUserPromptWithChecklist(inst, refineChecklistBullets);
  const promptIntent = classifyPremiumRefineRevisionIntent(inst);

  const runResolve = (r: PremiumRefineResponse): PremiumRefineResolveOutcome =>
    resolvePremiumRefineApplyOutcome({
      apiOut: r.updated_document_text,
      baselineText,
      baselineLen,
      summaryChanges: r.summary_changes,
      userInstruction: inst,
    });

  let lastR: PremiumRefineResponse | null = null;
  let usedSurgicalPreserveRetry = false;

  const r0 = await postPremiumRefine(
    {
      current_document_text: baselineText,
      intake_text: intakeText,
      user_refinement_prompt: userPrompt,
      action: "update",
    },
    signal,
  );
  lastR = r0;

  if (promptIntent === "advisory_note_or_comment") {
    const raw = (r0.updated_document_text || "").trim();
    const ph = scanPremiumRefinePlaceholderCorruption(raw);
    if (ph.count > 0) {
      // eslint-disable-next-line no-console
      console.info("[premium_candidate_rejected_placeholder_tokens]", {
        tokenCount: ph.count,
        samples: ph.samples,
      });
    }
    let modelExcerpt = raw;
    if (
      modelExcerpt &&
      normalizePremiumRefineTextForCompare(modelExcerpt) === normalizePremiumRefineTextForCompare(baselineText)
    ) {
      modelExcerpt = "";
    }
    /** API fail-open summaries must not block client-side append (deterministic preserve). */
    const summaryForAdvisoryAppendEval = premiumRefineSummaryIsUnchangedFailOpen(r0.summary_changes)
      ? undefined
      : r0.summary_changes;
    let built = buildAdvisoryAppendPreserveDocument({
      currentDocumentText: baselineText,
      userInstruction: inst,
      modelOut: modelExcerpt,
      checklistLines: refineChecklistBullets,
    });
    if (
      !tryPremiumRefineAdvisoryAppendAcceptance({
        userInstruction: inst,
        finalAppendDoc: built,
        baselineText,
        baselineLen,
      })
    ) {
      built = appendStaticAdvisoryMinimalSafeBlock(baselineText);
    }
    let accBuilt = evaluatePremiumRefineCandidate(
      built,
      baselineText,
      baselineLen,
      summaryForAdvisoryAppendEval,
      inst,
    );
    accBuilt = mergeAdvisoryAppendEvaluate(inst, built, baselineText, baselineLen, accBuilt);
    // eslint-disable-next-line no-console
    console.info("[premium-refine-apply]", {
      intent: promptIntent,
      revisionIntent: accBuilt.revisionIntent,
      authoritativeLen: baselineLen,
      candidateLen: raw.length,
      outputLen: built.length,
      applyDecision:
        accBuilt.decision === "accepted" ? "append_reviewer_note_preserve_document" : accBuilt.decision,
      preservationFallbackUsed: true,
      placeholderTokenCount: ph.count,
    });
    if (accBuilt.decision === "accepted") {
      return finalizePremiumRefineExecuteOutcome({
        userInstruction: inst,
        baselineText,
        baselineLen,
        refineChecklistBullets,
        candidateLen: raw.length,
        outcome: toExecuteExtras(
          {
            finalText: built,
            acceptance: accBuilt,
            usedLocalLateFeeFallback: false,
            whatChangedLine: PRO_REFINE_ADVISORY_APPEND_SUCCESS_SUMMARY,
            unchangedDuplicateLateFee: false,
          },
          {
            usedClientDeliverablesFinalPaymentFallback: false,
            usedSurgicalPreserveRetry,
            surgicalRejectedShortExhausted: false,
            lastRefineResponse: lastR,
            usedAppendReviewerNotePreserve: true,
            refineApplyDecision: "append_reviewer_note_preserve_document",
          },
        ),
      });
    }
    let builtMinimal = buildAdvisoryAppendPreserveDocument({
      currentDocumentText: baselineText,
      userInstruction: inst,
      modelOut: "",
      checklistLines: refineChecklistBullets,
    });
    if (
      !tryPremiumRefineAdvisoryAppendAcceptance({
        userInstruction: inst,
        finalAppendDoc: builtMinimal,
        baselineText,
        baselineLen,
      })
    ) {
      builtMinimal = appendStaticAdvisoryMinimalSafeBlock(baselineText);
    }
    let accMin = evaluatePremiumRefineCandidate(
      builtMinimal,
      baselineText,
      baselineLen,
      summaryForAdvisoryAppendEval,
      inst,
    );
    accMin = mergeAdvisoryAppendEvaluate(inst, builtMinimal, baselineText, baselineLen, accMin);
    if (accMin.decision === "accepted") {
      return finalizePremiumRefineExecuteOutcome({
        userInstruction: inst,
        baselineText,
        baselineLen,
        refineChecklistBullets,
        candidateLen: raw.length,
        outcome: toExecuteExtras(
          {
            finalText: builtMinimal,
            acceptance: accMin,
            usedLocalLateFeeFallback: false,
            whatChangedLine: PRO_REFINE_ADVISORY_APPEND_SUCCESS_SUMMARY,
            unchangedDuplicateLateFee: false,
          },
          {
            usedClientDeliverablesFinalPaymentFallback: false,
            usedSurgicalPreserveRetry,
            surgicalRejectedShortExhausted: false,
            lastRefineResponse: lastR,
            usedAppendReviewerNotePreserve: true,
            refineApplyDecision: "append_reviewer_note_preserve_document",
          },
        ),
      });
    }
    let forcedAdvisory = buildAdvisoryAppendPreserveDocument({
      currentDocumentText: baselineText,
      userInstruction: inst,
      modelOut: "",
      checklistLines: refineChecklistBullets,
    });
    if (
      !tryPremiumRefineAdvisoryAppendAcceptance({
        userInstruction: inst,
        finalAppendDoc: forcedAdvisory,
        baselineText,
        baselineLen,
      })
    ) {
      forcedAdvisory = appendStaticAdvisoryMinimalSafeBlock(baselineText);
    }
    let accForced = evaluatePremiumRefineCandidate(
      forcedAdvisory,
      baselineText,
      baselineLen,
      undefined,
      inst,
    );
    accForced = mergeAdvisoryAppendEvaluate(inst, forcedAdvisory, baselineText, baselineLen, accForced);
    if (accForced.decision === "accepted") {
      return finalizePremiumRefineExecuteOutcome({
        userInstruction: inst,
        baselineText,
        baselineLen,
        refineChecklistBullets,
        candidateLen: raw.length,
        outcome: toExecuteExtras(
          {
            finalText: forcedAdvisory,
            acceptance: accForced,
            usedLocalLateFeeFallback: false,
            whatChangedLine: PRO_REFINE_ADVISORY_APPEND_SUCCESS_SUMMARY,
            unchangedDuplicateLateFee: false,
          },
          {
            usedClientDeliverablesFinalPaymentFallback: false,
            usedSurgicalPreserveRetry,
            surgicalRejectedShortExhausted: false,
            lastRefineResponse: lastR,
            usedAppendReviewerNotePreserve: true,
            refineApplyDecision: "append_reviewer_note_advisory_forced_after_eval_miss",
          },
        ),
      });
    }
    // eslint-disable-next-line no-console
    console.warn("[premium-refine-advisory]", {
      note: "append_eval_paths_exhausted_non_accept",
      accBuilt: accBuilt.decision,
      accMin: accMin.decision,
      accForced: accForced.decision,
    });
  }

  let resolved = runResolve(r0);

  if (resolved.acceptance.decision === "accepted") {
    // eslint-disable-next-line no-console
    console.info("[premium-refine-apply]", {
      intent: promptIntent,
      authoritativeLen: baselineLen,
      candidateLen: (r0.updated_document_text || "").trim().length,
      outputLen: resolved.finalText.length,
      applyDecision: "accepted_replacement",
      preservationFallbackUsed: false,
      placeholderTokenCount: scanPremiumRefinePlaceholderCorruption(resolved.finalText).count,
    });
    return finalizePremiumRefineExecuteOutcome({
      userInstruction: inst,
      baselineText,
      baselineLen,
      refineChecklistBullets,
      candidateLen: (r0.updated_document_text || "").trim().length,
      outcome: toExecuteExtras(resolved, {
        usedClientDeliverablesFinalPaymentFallback: false,
        usedSurgicalPreserveRetry,
        surgicalRejectedShortExhausted: false,
        lastRefineResponse: lastR,
        usedAppendReviewerNotePreserve: false,
        refineApplyDecision: null,
      }),
    });
  }

  if (
    resolved.acceptance.decision === "rejected_short" &&
    classifyPremiumRefineRevisionIntent(inst) !== "transformational_revision"
  ) {
    usedSurgicalPreserveRetry = true;
    const r1 = await postPremiumRefine(
      {
        current_document_text: baselineText,
        intake_text: intakeText,
        user_refinement_prompt: userPrompt,
        action: "update",
        surgical_preserve_retry: true,
      },
      signal,
    );
    lastR = r1;
    resolved = runResolve(r1);
    if (resolved.acceptance.decision === "accepted") {
      // eslint-disable-next-line no-console
      console.info("[premium-refine-apply]", {
        intent: promptIntent,
        authoritativeLen: baselineLen,
        candidateLen: (r1.updated_document_text || "").trim().length,
        outputLen: resolved.finalText.length,
        applyDecision: "accepted_replacement_after_surgical_retry",
        preservationFallbackUsed: false,
        placeholderTokenCount: scanPremiumRefinePlaceholderCorruption(resolved.finalText).count,
      });
      return finalizePremiumRefineExecuteOutcome({
        userInstruction: inst,
        baselineText,
        baselineLen,
        refineChecklistBullets,
        candidateLen: (r1.updated_document_text || "").trim().length,
        outcome: toExecuteExtras(resolved, {
          usedClientDeliverablesFinalPaymentFallback: false,
          usedSurgicalPreserveRetry,
          surgicalRejectedShortExhausted: false,
          lastRefineResponse: lastR,
          usedAppendReviewerNotePreserve: false,
          refineApplyDecision: null,
        }),
      });
    }
  }

  if (resolved.acceptance.decision === "rejected_short" && looksLikeClientDeliverablesFinalPaymentInstruction(inst)) {
    const cdf = tryPremiumRefineClientDeliverablesFinalPaymentLocalFallback({
      currentDocumentText: baselineText,
      userInstruction: inst,
    });
    if (cdf) {
      const out2 = cdf.text.trim();
      const acc2 = evaluatePremiumRefineCandidate(out2, baselineText, baselineLen, lastR?.summary_changes, inst);
      if (acc2.decision === "accepted") {
        // eslint-disable-next-line no-console
        console.info("[premium-refine-apply]", {
          intent: promptIntent,
          authoritativeLen: baselineLen,
          candidateLen: out2.length,
          outputLen: out2.length,
          applyDecision: "client_deliverables_fallback",
          preservationFallbackUsed: true,
          placeholderTokenCount: scanPremiumRefinePlaceholderCorruption(out2).count,
        });
        return finalizePremiumRefineExecuteOutcome({
          userInstruction: inst,
          baselineText,
          baselineLen,
          refineChecklistBullets,
          candidateLen: out2.length,
          outcome: toExecuteExtras(
            {
              finalText: out2,
              acceptance: acc2,
              usedLocalLateFeeFallback: false,
              whatChangedLine: cdf.summaryLine,
              unchangedDuplicateLateFee: false,
            },
            {
              usedClientDeliverablesFinalPaymentFallback: true,
              usedSurgicalPreserveRetry,
              surgicalRejectedShortExhausted: false,
              lastRefineResponse: lastR,
              usedAppendReviewerNotePreserve: false,
              refineApplyDecision: null,
            },
          ),
        });
      }
    }
  }

  if (resolved.acceptance.decision === "rejected_short" && looksLikeReviewerNoteOrCommentIntent(inst)) {
    const note = tryAppendReviewerNotePreserveDocument({
      currentDocumentText: baselineText,
      userInstruction: inst,
      shortCandidate: (lastR?.updated_document_text || "").trim(),
      checklistLines: refineChecklistBullets,
    });
    if (note) {
      const out3 = note.text;
      const summaryForNoteEval = premiumRefineSummaryIsUnchangedFailOpen(lastR?.summary_changes)
        ? undefined
        : lastR?.summary_changes;
      const acc3 = evaluatePremiumRefineCandidate(out3, baselineText, baselineLen, summaryForNoteEval, inst);
      if (acc3.decision === "accepted") {
        // eslint-disable-next-line no-console
        console.info("[premium-refine-apply]", {
          intent: promptIntent,
          authoritativeLen: baselineLen,
          candidateLen: (lastR?.updated_document_text || "").trim().length,
          outputLen: out3.length,
          applyDecision: "append_reviewer_note_preserve_document",
          preservationFallbackUsed: true,
          placeholderTokenCount: scanPremiumRefinePlaceholderCorruption(out3).count,
        });
        return finalizePremiumRefineExecuteOutcome({
          userInstruction: inst,
          baselineText,
          baselineLen,
          refineChecklistBullets,
          candidateLen: (lastR?.updated_document_text || "").trim().length,
          outcome: toExecuteExtras(
            {
              finalText: out3,
              acceptance: acc3,
              usedLocalLateFeeFallback: false,
              whatChangedLine: note.summaryLine,
              unchangedDuplicateLateFee: false,
            },
            {
              usedClientDeliverablesFinalPaymentFallback: false,
              usedSurgicalPreserveRetry,
              surgicalRejectedShortExhausted: false,
              lastRefineResponse: lastR,
              usedAppendReviewerNotePreserve: true,
              refineApplyDecision: "append_reviewer_note_preserve_document",
            },
          ),
        });
      }
    }
  }

  const surgicalExhausted =
    resolved.acceptance.decision === "rejected_short" &&
    classifyPremiumRefineRevisionIntent(inst) !== "transformational_revision" &&
    usedSurgicalPreserveRetry;

  // eslint-disable-next-line no-console
  console.info("[premium-refine-apply]", {
    intent: promptIntent,
    authoritativeLen: baselineLen,
    candidateLen: (lastR?.updated_document_text || "").trim().length,
    outputLen: resolved.finalText.length,
    applyDecision: resolved.acceptance.decision,
    preservationFallbackUsed: false,
    placeholderTokenCount: scanPremiumRefinePlaceholderCorruption(resolved.finalText).count,
  });

  return finalizePremiumRefineExecuteOutcome({
    userInstruction: inst,
    baselineText,
    baselineLen,
    refineChecklistBullets,
    candidateLen: (lastR?.updated_document_text || "").trim().length,
    outcome: toExecuteExtras(resolved, {
      usedClientDeliverablesFinalPaymentFallback: false,
      usedSurgicalPreserveRetry,
      surgicalRejectedShortExhausted: surgicalExhausted,
      lastRefineResponse: lastR,
      usedAppendReviewerNotePreserve: false,
      refineApplyDecision: null,
    }),
  });
}
