import type { PremiumRefineResolveOutcome } from "./premiumRefineLateFeeFallback";
import {
  classifyPremiumRefineRevisionIntent,
  evaluatePremiumRefineCandidate,
  isAdvisoryNoteOrCommentIntent,
} from "./premiumRefineAcceptance";
import {
  applyDeterministicSurgicalRevisionFallback,
  extractConvenienceTerminationPriorNoticeSentences,
  looksLikeTerminationConvenienceNoticeDaysInstruction,
  parseTargetNoticePhrase,
} from "./premiumRefineDeterministicSurgicalFallback";

/** Competing operative notice periods the user asked to replace (convenience clause only). */
const COMPETING_PRIOR_WRITTEN_NOTICE_IN_CONVENIENCE =
  /\b(?:fifteen|thirty)\s*\(\s*(?:15|30)\s*\)\s*days?[''\u2019]?\s+prior\s+written\s+notice/i;

function inferTerminationConvenienceTargetDaysFromInstruction(instr: string): number {
  if (/\(\s*45\s*\)|forty[-\s]?five|\b45\s+days/i.test(instr)) return 45;
  return 45;
}

function sentenceContainsTargetNoticePhrase(s: string, targetTail: string): boolean {
  if (targetTail === "forty-five (45) days' prior written notice") {
    return (
      /forty[-\s]?five\s*\(\s*45\s*\)\s*days?[''\u2019]?\s+prior\s+written\s+notice/i.test(s) ||
      (/forty[-\s]?five\s+days?[''\u2019]?\s+prior\s+written\s+notice/i.test(s) && /\(\s*45\s*\)/.test(s))
    );
  }
  if (targetTail === "45 days' prior written notice") {
    return /\b45\s+days?[''\u2019]?\s+prior\s+written\s+notice/i.test(s);
  }
  return s.toLowerCase().includes(targetTail.toLowerCase());
}

/**
 * When the user instruction is a high-confidence termination-for-convenience notice-day
 * surgical edit, require every extracted convenience notice sentence to show the target
 * period and not retain fifteen/thirty + prior written notice phrasing.
 */
export function candidatePassesTerminationConvenienceNoticeDaysPostcondition(
  candidateDoc: string,
  userInstruction: string,
): boolean {
  const inst = userInstruction.trim();
  if (!looksLikeTerminationConvenienceNoticeDaysInstruction(inst)) return true;
  const targetTail = parseTargetNoticePhrase(inst);
  if (!targetTail) return true;
  const sentences = extractConvenienceTerminationPriorNoticeSentences(candidateDoc);
  if (sentences.length === 0) return false;
  for (const s of sentences) {
    if (COMPETING_PRIOR_WRITTEN_NOTICE_IN_CONVENIENCE.test(s)) return false;
    if (!sentenceContainsTargetNoticePhrase(s, targetTail)) return false;
  }
  return true;
}

function joinSummaryOneLine(summary: string[] | undefined): string | null {
  const parts = (summary ?? []).map((x) => String(x || "").trim()).filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function logSurgicalPostcondition(payload: Record<string, unknown>): void {
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  // eslint-disable-next-line no-console
  console.info("[premium-refine-surgical-postcondition]", payload);
}

/**
 * When {@link evaluatePremiumRefineCandidate} returned `accepted`, optionally veto and/or
 * substitute deterministic output for termination-convenience notice-day surgical intents.
 *
 * @returns `null` when this gate does not apply or the candidate passes — caller keeps the
 * normal accepted path. Otherwise a full {@link PremiumRefineResolveOutcome}.
 */
export function resolveTerminationConvenienceNoticeDaysPostconditionIfNeeded(args: {
  apiCandidateText: string;
  baselineText: string;
  baselineLen: number;
  summaryChanges: string[] | undefined;
  userInstruction: string;
  preliminaryAcceptance: ReturnType<typeof evaluatePremiumRefineCandidate>;
}): PremiumRefineResolveOutcome | null {
  const inst = args.userInstruction.trim();
  if (args.preliminaryAcceptance.decision !== "accepted") return null;
  if (classifyPremiumRefineRevisionIntent(inst) !== "surgical_revision") return null;
  if (isAdvisoryNoteOrCommentIntent(inst)) return null;
  if (!looksLikeTerminationConvenienceNoticeDaysInstruction(inst)) return null;

  const targetDays = inferTerminationConvenienceTargetDaysFromInstruction(inst);
  const candidateOk = candidatePassesTerminationConvenienceNoticeDaysPostcondition(args.apiCandidateText, inst);

  if (candidateOk) {
    logSurgicalPostcondition({
      attempted: true,
      rule: "termination_convenience_notice_days",
      targetDays,
      candidateSatisfied: true,
      fallbackAttempted: false,
      fallbackApplied: false,
      decision: "accepted",
    });
    return null;
  }

  const surg = applyDeterministicSurgicalRevisionFallback({
    currentDocumentText: args.baselineText,
    userInstruction: inst,
  });
  // eslint-disable-next-line no-console
  console.info("[premium-refine-deterministic-surgical]", surg.log);

  let fallbackApplied = false;
  let patchedPasses = false;
  let accS: ReturnType<typeof evaluatePremiumRefineCandidate> | null = null;
  if (surg.applied && surg.text.trim() !== args.baselineText.trim()) {
    fallbackApplied = true;
    patchedPasses = candidatePassesTerminationConvenienceNoticeDaysPostcondition(surg.text, inst);
    accS = evaluatePremiumRefineCandidate(surg.text.trim(), args.baselineText, args.baselineLen, undefined, inst);
    if (patchedPasses && accS.decision === "accepted") {
      logSurgicalPostcondition({
        attempted: true,
        rule: "termination_convenience_notice_days",
        targetDays,
        candidateSatisfied: false,
        fallbackAttempted: true,
        fallbackApplied: true,
        decision: "accepted_deterministic_surgical_fallback",
      });
      return {
        finalText: surg.text.trim(),
        acceptance: accS,
        usedLocalLateFeeFallback: false,
        appliedDeterministicSurgicalFallback: true,
        deterministicSurgicalFallbackReason: surg.reason,
        whatChangedLine: `Applied local rule: ${surg.reason.replace(/_/g, " ")}.`,
        unchangedDuplicateLateFee: false,
      };
    }
  }

  logSurgicalPostcondition({
    attempted: true,
    rule: "termination_convenience_notice_days",
    targetDays,
    candidateSatisfied: false,
    fallbackAttempted: true,
    fallbackApplied,
    decision: "rejected_surgical_postcondition_failed",
  });

  return {
    finalText: args.baselineText.trim(),
    acceptance: {
      ...args.preliminaryAcceptance,
      decision: "rejected_surgical_postcondition_failed",
    },
    usedLocalLateFeeFallback: false,
    appliedDeterministicSurgicalFallback: false,
    deterministicSurgicalFallbackReason: null,
    whatChangedLine: joinSummaryOneLine(args.summaryChanges),
    unchangedDuplicateLateFee: false,
  };
}
