import type { CreateComplexityResumeV1 } from "./agreementCreateComplexityResume";
import { readAgreementCreatorIntakeStorage } from "./agreementIntakeStorage";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildReviewCoercionRawIntakeFromDraft } from "./premiumCheckoutRawIntake";
import { pickLongestPremiumIntakeCorpus, readOriginalUserIntakeRaw } from "./originalUserIntakeRawStorage";

const MIN_LEN = 12;
/** When agreement preview is long, use as last-ditch (may be starter) — length gate avoids one-line noise. */
const MIN_DOC_FALLBACK = 200;

/**
 * Best-effort “source of truth” string for Pro upgrade / premium completion, in order:
 * 1) session original (written at create-draft commit), 2) resume.originalUserIntakeRaw, 3) resume rawIntake,
 * 4) localStorage create intake, 5) live `intakeCombined`, 6) structured draft fields, 7) long agreement body text.
 */
export function buildUpgradeSourceTextForPremium(args: {
  resume: CreateComplexityResumeV1 | null;
  intakeCombined: string;
  structuredDraft: ParsedDraftShape | null;
  agreementDocumentText: string;
}): string {
  const sessionOrig = readOriginalUserIntakeRaw().trim();
  const storage = (() => {
    try {
      return readAgreementCreatorIntakeStorage().trim();
    } catch {
      return "";
    }
  })();
  const r = args.resume;
  const resumeOrig = (r?.originalUserIntakeRaw || "").trim();
  const resumeRaw = (r?.rawIntake || "").trim();
  const c = args.intakeCombined.trim();
  const doc = args.agreementDocumentText.trim();
  const hint = c || resumeRaw || sessionOrig;
  const fromStructured = args.structuredDraft
    ? buildReviewCoercionRawIntakeFromDraft(args.structuredDraft, hint).trim()
    : "";

  const fromCorpus = pickLongestPremiumIntakeCorpus(
    MIN_LEN,
    sessionOrig,
    resumeOrig,
    resumeRaw,
    storage,
    c,
    fromStructured,
  );
  if (fromCorpus.length >= MIN_LEN) return fromCorpus;
  if (doc.length >= MIN_DOC_FALLBACK) return doc;
  return (fromCorpus || fromStructured || doc).trim();
}
