/**
 * Production checkout / post-checkout / retry intake corpus — longest user deal text,
 * never starter preview echo when a fuller original prompt exists in session or checkout-back.
 */

import { readCreateComplexityResume } from "./agreementCreateComplexityResume";
import { readAgreementCreatorIntakeStorage } from "./agreementIntakeStorage";
import { readCheckoutBackRestoreSnapshot } from "./checkoutBackRestore";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { stripPremiumUserNotesFromMergedIntake } from "./premiumCompletionPipeline";
import { buildReviewCoercionRawIntakeFromDraft } from "./premiumCheckoutRawIntake";
import {
  pickLongestPremiumIntakeCorpus,
  readOriginalUserIntakeRaw,
  writeOriginalUserIntakeRawIfRicher,
} from "./originalUserIntakeRawStorage";

export const PREMIUM_CHECKOUT_INTAKE_MIN_LEN = 48;
/** Structured draft coercion (~350–450) can be longer than a short homepage paste — still stale for Pro. */
export const SHORT_STALE_PREMIUM_INTAKE_THRESHOLD = 350;

export type PremiumCheckoutIntakeCorpusMeta = {
  corpus: string;
  chosenSource: string;
  sessionOriginalLen: number;
  resumeOriginalLen: number;
  resumeRawLen: number;
  checkoutBackLen: number;
  storageLen: number;
  intakeCombinedLen: number;
  finalTranscriptLen: number;
  agreementDocumentLen: number;
  coercedFromDraftLen: number;
};

export function resolvePremiumCheckoutIntakeCorpus(args: {
  structuredDraft?: ParsedDraftShape | null;
  intakeCombined?: string;
  agreementDocumentText?: string;
  finalTranscript?: string;
  minLen?: number;
  /** When false, never pick agreement document body (starter preview can beat coercion but is not deal intake). */
  allowDocumentFallback?: boolean;
}): PremiumCheckoutIntakeCorpusMeta {
  const minLen = args.minLen ?? PREMIUM_CHECKOUT_INTAKE_MIN_LEN;
  const resume = readCreateComplexityResume();
  const sessionOriginal = readOriginalUserIntakeRaw().trim();
  const resumeOriginal = (resume?.originalUserIntakeRaw ?? "").trim();
  const resumeRaw = (resume?.rawIntake ?? "").trim();
  const checkoutBack = (readCheckoutBackRestoreSnapshot()?.intakeText ?? "").trim();
  let storage = "";
  try {
    storage = readAgreementCreatorIntakeStorage().trim();
  } catch {
    /* ignore */
  }
  const intakeCombined = (args.intakeCombined ?? "").trim();
  const finalTranscript = (args.finalTranscript ?? "").trim();
  const doc = (args.agreementDocumentText ?? "").trim();

  const hint = pickLongestPremiumIntakeCorpus(
    12,
    finalTranscript,
    sessionOriginal,
    resumeOriginal,
    checkoutBack,
    storage,
    intakeCombined,
    resumeRaw,
  );
  const coerced = args.structuredDraft
    ? buildReviewCoercionRawIntakeFromDraft(args.structuredDraft, hint).trim()
    : "";

  const userOriginCandidates: Array<{ source: string; text: string }> = [
    { source: "session_original", text: sessionOriginal },
    { source: "resume_original", text: resumeOriginal },
    { source: "final_transcript", text: finalTranscript },
    { source: "checkout_back", text: checkoutBack },
    { source: "storage_intake", text: storage },
    { source: "intake_combined", text: intakeCombined },
    { source: "resume_raw", text: resumeRaw },
  ];

  const pickBest = (
    candidates: Array<{ source: string; text: string }>,
    threshold: number,
  ): { corpus: string; chosenSource: string } => {
    let corpus = "";
    let chosenSource = "none";
    for (const c of candidates) {
      const t = c.text.trim();
      if (t.length < threshold) continue;
      if (t.length > corpus.length) {
        corpus = t;
        chosenSource = c.source;
      }
    }
    if (!corpus) {
      for (const c of candidates) {
        const t = c.text.trim();
        if (t.length > corpus.length) {
          corpus = t;
          chosenSource = c.source;
        }
      }
    }
    return { corpus, chosenSource };
  };

  const userPick = pickBest(userOriginCandidates, minLen);
  if (userPick.corpus.length >= minLen) {
    return {
      corpus: userPick.corpus,
      chosenSource: userPick.chosenSource,
      sessionOriginalLen: sessionOriginal.length,
      resumeOriginalLen: resumeOriginal.length,
      resumeRawLen: resumeRaw.length,
      checkoutBackLen: checkoutBack.length,
      storageLen: storage.length,
      intakeCombinedLen: intakeCombined.length,
      finalTranscriptLen: finalTranscript.length,
      agreementDocumentLen: doc.length,
      coercedFromDraftLen: coerced.length,
    };
  }

  const derivedCandidates: Array<{ source: string; text: string }> = [
    { source: "structured_coercion", text: coerced },
  ];
  if (args.allowDocumentFallback && doc.length >= 200) {
    derivedCandidates.push({ source: "agreement_document", text: doc });
  }

  const derivedPick = pickBest([...userOriginCandidates, ...derivedCandidates], minLen);
  const corpus = derivedPick.corpus;
  const chosenSource = derivedPick.chosenSource;

  return {
    corpus,
    chosenSource,
    sessionOriginalLen: sessionOriginal.length,
    resumeOriginalLen: resumeOriginal.length,
    resumeRawLen: resumeRaw.length,
    checkoutBackLen: checkoutBack.length,
    storageLen: storage.length,
    intakeCombinedLen: intakeCombined.length,
    finalTranscriptLen: finalTranscript.length,
    agreementDocumentLen: doc.length,
    coercedFromDraftLen: coerced.length,
  };
}

export function ensurePremiumCheckoutIntakePreserved(corpus: string, minLen = 40): void {
  writeOriginalUserIntakeRawIfRicher(corpus, minLen);
}

export function isStaleShortPremiumIntake(
  corpus: string,
  threshold = SHORT_STALE_PREMIUM_INTAKE_THRESHOLD,
): boolean {
  const len = corpus.trim().length;
  return len > 0 && len < threshold;
}

/** Prefer full restored corpus over a short merged/retry intake passed from UI state. */
export function resolvePremiumRequestIntakeText(args: {
  mergedOrRetryIntake: string;
  structuredDraft?: ParsedDraftShape | null;
  intakeCombined?: string;
  agreementDocumentText?: string;
  finalTranscript?: string;
}): { intakeText: string; resolved: PremiumCheckoutIntakeCorpusMeta } {
  const resolved = resolvePremiumCheckoutIntakeCorpus({
    structuredDraft: args.structuredDraft,
    intakeCombined: args.intakeCombined,
    agreementDocumentText: args.agreementDocumentText,
    finalTranscript: args.finalTranscript,
    allowDocumentFallback: false,
  });
  const mergedBase = stripPremiumUserNotesFromMergedIntake(args.mergedOrRetryIntake || "");
  const userOnly = resolvePremiumCheckoutIntakeCorpus({
    structuredDraft: null,
    intakeCombined: args.intakeCombined,
    agreementDocumentText: "",
    finalTranscript: args.finalTranscript,
    minLen: 12,
    allowDocumentFallback: false,
  });
  const intakeText = pickLongestPremiumIntakeCorpus(
    PREMIUM_CHECKOUT_INTAKE_MIN_LEN,
    userOnly.corpus,
    resolved.corpus,
    mergedBase,
  );
  return { intakeText, resolved };
}
