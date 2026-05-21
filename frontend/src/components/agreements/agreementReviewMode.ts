/**
 * Review mode discriminator — prevents AI legal review from mixing with uploaded-source diff.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";

export type AgreementReviewMode = "source_comparison" | "generated_agreement_review";

export const MIN_SOURCE_COMPARE_TEXT_CHARS = 200;

export type ProRedlineSourceSnapshot = {
  base_document_text?: string | null;
  imported_document_text?: string | null;
  imported_text?: string | null;
};

export type ResolveAgreementReviewModeArgs = {
  explicitMode?: AgreementReviewMode | null;
  draft?: ParsedDraftShape | null;
  uploadedSourceText?: string | null;
  proRedlinePending?: ProRedlineSourceSnapshot | null;
  /** Current LawDog draft / revised body for comparison (B side). */
  currentRevisedText?: string | null;
};

export type ResolvedAgreementReviewMode = {
  mode: AgreementReviewMode;
  sourceText: string | null;
  revisedText: string | null;
  reason: string;
};

function readDraftReviewMode(draft: ParsedDraftShape | null | undefined): AgreementReviewMode | null {
  const m = (draft as { review_mode?: string } | null)?.review_mode;
  if (m === "source_comparison" || m === "generated_agreement_review") return m;
  return null;
}

function readDraftUploadedSource(draft: ParsedDraftShape | null | undefined): string {
  const t =
    (draft as { uploaded_source_document_text?: string } | null)?.uploaded_source_document_text ?? "";
  return String(t).trim();
}

export function readProRedlinePending(draft: unknown): ProRedlineSourceSnapshot | null {
  const pr = (draft as { pro_redline_v1?: { pending_import?: ProRedlineSourceSnapshot } } | null)?.pro_redline_v1;
  const pending = pr?.pending_import;
  if (!pending || typeof pending !== "object") return null;
  return pending;
}

export function resolveAgreementReviewMode(args: ResolveAgreementReviewModeArgs): ResolvedAgreementReviewMode {
  const explicit = args.explicitMode ?? readDraftReviewMode(args.draft);
  const revised = (args.currentRevisedText ?? "").trim();
  const uploaded = (args.uploadedSourceText ?? readDraftUploadedSource(args.draft)).trim();
  const pending = args.proRedlinePending ?? readProRedlinePending(args.draft);

  if (explicit === "generated_agreement_review") {
    return {
      mode: "generated_agreement_review",
      sourceText: null,
      revisedText: revised || null,
      reason: "explicit_generated",
    };
  }

  if (pending) {
    const base = String(pending.base_document_text ?? "").trim();
    const imported = String(
      pending.imported_document_text ?? pending.imported_text ?? "",
    ).trim();
    if (base.length >= MIN_SOURCE_COMPARE_TEXT_CHARS && imported.length >= MIN_SOURCE_COMPARE_TEXT_CHARS) {
      return {
        mode: "source_comparison",
        sourceText: base,
        revisedText: revised || imported,
        reason: "pro_redline_pending_import",
      };
    }
  }

  if (explicit === "source_comparison" || uploaded.length >= MIN_SOURCE_COMPARE_TEXT_CHARS) {
    if (uploaded.length >= MIN_SOURCE_COMPARE_TEXT_CHARS) {
      return {
        mode: "source_comparison",
        sourceText: uploaded,
        revisedText: revised || null,
        reason: explicit === "source_comparison" ? "explicit_source" : "uploaded_source_present",
      };
    }
    return {
      mode: "source_comparison",
      sourceText: null,
      revisedText: revised || null,
      reason: "source_mode_extraction_insufficient",
    };
  }

  return {
    mode: "generated_agreement_review",
    sourceText: null,
    revisedText: revised || null,
    reason: "generated_pro_draft",
  };
}

export function isSourceComparisonReviewMode(mode: AgreementReviewMode): boolean {
  return mode === "source_comparison";
}

export function shouldSuppressPremiumAdvisoryReview(mode: AgreementReviewMode): boolean {
  return isSourceComparisonReviewMode(mode);
}

export function logReviewMode(mode: AgreementReviewMode, reason: string): void {
  if (!import.meta.env.DEV) return;
  console.info("[review-mode]", mode, { reason });
}

export function logSourceCompareSuppressed(): void {
  if (!import.meta.env.DEV) return;
  console.info("[source-compare-ai-suppressed]", true);
}

export function logSourceCompareStats(args: {
  sourceChars: number;
  revisedChars: number;
  changedSections: number;
}): void {
  if (!import.meta.env.DEV) return;
  console.info("[source-compare]", args);
}

export function logSourceCompareExtractionFailed(reason: string): void {
  if (!import.meta.env.DEV) return;
  console.info("[source-compare-extraction-failed]", reason);
}
