import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { escapeHtml } from "../components/agreements/premiumAgreementDocumentHtml";
import { NOT_LEGAL_ADVICE } from "../compliance/disclosureCopy";
import type { LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import type { HumanReviewStructuredForPdf } from "./recipientHumanReviewSummaryModel";
import { recipientReviewerSlugFromDisplayName, recipientTextDownloadFilename } from "./recipientExportFilenames";
import {
  RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE,
  downloadRecipientPreviewPdf,
  humanizeRecipientPdfExportErrorMessage,
} from "./recipientPreviewPdfDownload";
import type { RecipientCompareConfidenceLevel } from "./recipientCompareConfidence";
import {
  buildRecipientRedlinePdfHtml,
  type RecipientPreviewPdfExportKind,
  type RecipientRedlinePdfHumanExtras,
  wrapRecipientVersionPdfHtml,
} from "./recipientPreviewPdfHtml";
import type { RecipientSemanticRedlinePresentation } from "./recipientWholeDocSemanticRender";
import {
  RECIPIENT_EXPORT_REVIEW_DOWNLOAD_ORIGINAL_DRAFT_PDF,
  RECIPIENT_EXPORT_REVIEW_DOWNLOAD_REDLINE_PDF,
  RECIPIENT_EXPORT_REVIEW_DOWNLOAD_REVISED_AGREEMENT_PDF,
  RECIPIENT_IMPORT_NO_CHANGE_PLAINTEXT_EXPORT,
} from "./portableReviewCopy";
import {
  finalizeUserVisibleAgreementPlainText,
  stripHtmlAgreementScanText,
} from "../components/agreements/agreementTemplatePlaceholderSafety";

const RECIPIENT_PLACEHOLDER_EXPORT_BLOCKED =
  "This export is blocked because drafting placeholders still appear in the agreement text. Resolve them before exporting or copying.";

/** Plain-text summary of block redline for copy/export (no HTML). */
export function legalRedlineDocumentVmToPlainSummary(vm: LegalRedlineDocumentViewModel): string {
  const parts: string[] = [];
  for (const b of vm.blocks) {
    const label = (b.label || b.heading || b.clauseNumber || "Section").trim();
    parts.push(`--- ${label} ---`);
    let line = "";
    for (const s of b.segments) {
      if (s.type === "same") line += s.text;
      else if (s.type === "insert") line += `[+${s.text}]`;
      else line += `[-${s.text}]`;
    }
    parts.push(line.trimEnd());
    parts.push("");
  }
  return parts.join("\n").trim();
}

export type RecipientPreviewVersionPlainSource = {
  currentPlain: string;
  proposedPlain: string;
};

export type RecipientPreviewPdfReadContext = {
  agreementId: string;
  readHeaders: Record<string, string>;
  scrubbedOriginalHtml: string;
  scrubbedProposedHtml: string;
  /** Slug basename for PDF and text downloads (from agreement title + id). */
  exportBasename: string;
  /** Optional — audit metadata and filename segment for export. */
  reviewerDisplayName?: string | null;
  reviewerEmail?: string | null;
  agreementTitleDisplay?: string | null;
};

type Props = {
  plainSource: RecipientPreviewVersionPlainSource;
  legalRedlineVm: LegalRedlineDocumentViewModel;
  pdfReadContext: RecipientPreviewPdfReadContext | null;
  /** Screen-reader / programmatic only — parent shows a matching “Download redline” control. */
  detachRedlinePdfButton?: boolean;
  /** Optional human-readable redline PDF summary (not the machine diff). */
  redlinePdfSummarySentence?: string | null;
  redlinePdfSummaryBullets?: readonly string[];
  redlinePdfReviewerNotesPlain?: string | null;
  /** Structured human-first page for redline PDF (overrides legacy summary when set). */
  redlinePdfStructuredHumanReview?: HumanReviewStructuredForPdf | null;
  redlinePdfTechnicalAppendixPlain?: string | null;
  /** Drives export-side dedupe / collapse when not `high`. */
  redlinePdfCompareConfidenceLevel?: RecipientCompareConfidenceLevel | null;
  /** Aligns PDF detailed redline with UI semantic prior/revised panels when set. */
  redlinePdfSemanticPresentation?: RecipientSemanticRedlinePresentation | null;
  /** Condensed clean-revision export bundle (human-first PDF; omit in full redline mode). */
  redlinePdfCondensedCleanRevision?: RecipientRedlinePdfHumanExtras["condensedCleanRevisionPdf"];
  /** Import matched current draft — redline PDF is a short “no changes” summary only. */
  redlinePdfImportMaterialNoChange?: boolean;
};

/**
 * Original / proposed / redline PDFs and copy helpers. PDF actions stay visible (not hidden in a collapsed disclosure).
 */
function buildRedlinePdfSummaryHtml(sentence: string | null | undefined, bullets: readonly string[] | undefined): string {
  const parts: string[] = [];
  const s = (sentence ?? "").trim();
  if (s) {
    parts.push(`<p style="margin:0 0 10px;">${escapeHtml(s)}</p>`);
  }
  const bs = bullets?.filter((b) => b.trim()) ?? [];
  if (bs.length > 0) {
    parts.push(
      `<ul style="margin:0;padding-left:18px;">${bs.map((b) => `<li style="margin:0 0 6px;">${escapeHtml(b.trim())}</li>`).join("")}</ul>`,
    );
  }
  return parts.join("");
}

export function RecipientPreviewVersionsExport({
  plainSource,
  legalRedlineVm,
  pdfReadContext,
  detachRedlinePdfButton = false,
  redlinePdfSummarySentence = null,
  redlinePdfSummaryBullets,
  redlinePdfReviewerNotesPlain = null,
  redlinePdfStructuredHumanReview = null,
  redlinePdfTechnicalAppendixPlain = null,
  redlinePdfCompareConfidenceLevel = null,
  redlinePdfSemanticPresentation = null,
  redlinePdfCondensedCleanRevision = null,
  redlinePdfImportMaterialNoChange = false,
}: Props) {
  const [copyAck, setCopyAck] = useState<"original" | "proposed" | "redline" | null>(null);
  const [pdfErrors, setPdfErrors] = useState<Partial<Record<RecipientPreviewPdfExportKind, string | null>>>({});
  const [copyFlowError, setCopyFlowError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<RecipientPreviewPdfExportKind | null>(null);
  const [a11yStatus, setA11yStatus] = useState("");
  const pdfInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const pdfReadContextRef = useRef(pdfReadContext);
  const legalRedlineVmRef = useRef(legalRedlineVm);
  const pdfErrorTimersRef = useRef<Partial<Record<RecipientPreviewPdfExportKind, ReturnType<typeof setTimeout>>>>({});
  const copyErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pdfExportErrorRegionRef = useRef<HTMLDivElement>(null);

  pdfReadContextRef.current = pdfReadContext;
  legalRedlineVmRef.current = legalRedlineVm;

  const redlinePdfHumanExtras = useMemo((): RecipientRedlinePdfHumanExtras => {
    if (redlinePdfImportMaterialNoChange) {
      return { importMaterialNoChange: true };
    }
    const structured = redlinePdfStructuredHumanReview;
    return {
      structuredHumanReview: structured ?? null,
      summaryHtml:
        structured && (structured.headlinePlain.trim() || structured.importantBullets.length > 0)
          ? null
          : buildRedlinePdfSummaryHtml(redlinePdfSummarySentence, redlinePdfSummaryBullets ?? []) || null,
      reviewerNotesPlain: redlinePdfReviewerNotesPlain?.trim() || null,
      technicalAppendixPlain: redlinePdfTechnicalAppendixPlain?.trim() || null,
      exportCompareConfidenceLevel: redlinePdfCompareConfidenceLevel ?? null,
      semanticRedlinePresentation: redlinePdfSemanticPresentation ?? null,
      condensedCleanRevisionPdf: redlinePdfCondensedCleanRevision ?? null,
    };
  }, [
    redlinePdfImportMaterialNoChange,
    redlinePdfStructuredHumanReview,
    redlinePdfSummarySentence,
    redlinePdfSummaryBullets,
    redlinePdfReviewerNotesPlain,
    redlinePdfTechnicalAppendixPlain,
    redlinePdfCompareConfidenceLevel,
    redlinePdfSemanticPresentation,
    redlinePdfCondensedCleanRevision,
  ]);

  const redlinePlain = useCallback(() => {
    if (redlinePdfImportMaterialNoChange) return RECIPIENT_IMPORT_NO_CHANGE_PLAINTEXT_EXPORT;
    return legalRedlineDocumentVmToPlainSummary(legalRedlineVmRef.current);
  }, [redlinePdfImportMaterialNoChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pdfInFlightRef.current = false;
      for (const k of Object.keys(pdfErrorTimersRef.current) as RecipientPreviewPdfExportKind[]) {
        const t = pdfErrorTimersRef.current[k];
        if (t) clearTimeout(t);
      }
      pdfErrorTimersRef.current = {};
      if (copyErrorTimerRef.current) {
        clearTimeout(copyErrorTimerRef.current);
        copyErrorTimerRef.current = null;
      }
    };
  }, []);

  const safeSet = useCallback((fn: () => void) => {
    if (mountedRef.current) fn();
  }, []);

  const clearCopyAckSoon = useCallback(() => {
    window.setTimeout(() => safeSet(() => setCopyAck(null)), 2000);
  }, [safeSet]);

  const schedulePdfErrorClear = useCallback(
    (kind: RecipientPreviewPdfExportKind) => {
      const prev = pdfErrorTimersRef.current[kind];
      if (prev) clearTimeout(prev);
      pdfErrorTimersRef.current[kind] = setTimeout(() => {
        pdfErrorTimersRef.current[kind] = undefined;
        safeSet(() => setPdfErrors((p) => ({ ...p, [kind]: null })));
      }, 3200);
    },
    [safeSet],
  );

  const copyText = useCallback(
    async (label: "original" | "proposed" | "redline", text: string) => {
      safeSet(() => setCopyFlowError(null));
      const ph = finalizeUserVisibleAgreementPlainText(text, {
        intakeRaw: "",
        partyNames: [],
        agreementFamily: null,
        surface: `recipient_preview_copy_${label}`,
      });
      if (!ph.ok) {
        safeSet(() => setCopyFlowError(RECIPIENT_PLACEHOLDER_EXPORT_BLOCKED));
        if (copyErrorTimerRef.current) clearTimeout(copyErrorTimerRef.current);
        copyErrorTimerRef.current = setTimeout(() => {
          copyErrorTimerRef.current = null;
          safeSet(() => setCopyFlowError(null));
        }, 4500);
        return;
      }
      try {
        await navigator.clipboard.writeText(ph.text);
        safeSet(() => setCopyAck(label));
        clearCopyAckSoon();
      } catch {
        safeSet(() => setCopyFlowError("Could not copy."));
        if (copyErrorTimerRef.current) clearTimeout(copyErrorTimerRef.current);
        copyErrorTimerRef.current = setTimeout(() => {
          copyErrorTimerRef.current = null;
          safeSet(() => setCopyFlowError(null));
        }, 2500);
      }
    },
    [clearCopyAckSoon, safeSet],
  );

  const downloadTextFile = useCallback(
    (kind: RecipientPreviewPdfExportKind, body: string) => {
      const ph = finalizeUserVisibleAgreementPlainText(body, {
        intakeRaw: "",
        partyNames: [],
        agreementFamily: null,
        surface: `recipient_preview_download_text_${kind}`,
      });
      if (!ph.ok) {
        safeSet(() => setCopyFlowError(RECIPIENT_PLACEHOLDER_EXPORT_BLOCKED));
        if (copyErrorTimerRef.current) clearTimeout(copyErrorTimerRef.current);
        copyErrorTimerRef.current = setTimeout(() => {
          copyErrorTimerRef.current = null;
          safeSet(() => setCopyFlowError(null));
        }, 4500);
        return;
      }
      const ctx = pdfReadContextRef.current;
      const base = ctx?.exportBasename ?? "agreement";
      const blob = new Blob([ph.text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const at = new Date();
      const rev = recipientReviewerSlugFromDisplayName(ctx?.reviewerDisplayName ?? undefined);
      a.download = recipientTextDownloadFilename(base, kind, { exportedAt: at, reviewerSlug: rev });
      a.click();
      URL.revokeObjectURL(url);
    },
    [],
  );

  const onPdf = useCallback(
    async (kind: RecipientPreviewPdfExportKind) => {
      const ctx = pdfReadContextRef.current;
      if (!ctx || pdfBusy !== null || pdfInFlightRef.current) return;
      const vm = legalRedlineVmRef.current;
      const exportedAt = new Date();
      const reviewerSlug = recipientReviewerSlugFromDisplayName(ctx.reviewerDisplayName ?? undefined);
      const html =
        kind === "original"
          ? wrapRecipientVersionPdfHtml(ctx.scrubbedOriginalHtml)
          : kind === "proposed"
            ? wrapRecipientVersionPdfHtml(ctx.scrubbedProposedHtml)
            : buildRecipientRedlinePdfHtml(
                vm,
                {
                  agreementId: ctx.agreementId,
                  agreementTitle: ctx.agreementTitleDisplay ?? null,
                  reviewerDisplayName: ctx.reviewerDisplayName ?? null,
                  reviewerEmail: ctx.reviewerEmail ?? null,
                  generatedAt: exportedAt,
                },
                redlinePdfHumanExtras,
              );
      if (!html.trim()) {
        safeSet(() => setPdfErrors((p) => ({ ...p, [kind]: "Nothing to export yet." })));
        schedulePdfErrorClear(kind);
        return;
      }
      const scanPlain = stripHtmlAgreementScanText(html);
      const ph = finalizeUserVisibleAgreementPlainText(scanPlain, {
        intakeRaw: "",
        partyNames: [],
        agreementFamily: null,
        surface: `recipient_preview_export_pdf_${kind}`,
      });
      if (!ph.ok) {
        safeSet(() => {
          setPdfErrors((p) => ({ ...p, [kind]: RECIPIENT_PLACEHOLDER_EXPORT_BLOCKED }));
          setA11yStatus(RECIPIENT_PLACEHOLDER_EXPORT_BLOCKED);
        });
        schedulePdfErrorClear(kind);
        return;
      }
      const announce =
        kind === "original"
          ? "Preparing original PDF."
          : kind === "proposed"
            ? "Preparing proposed PDF."
            : "Preparing redline PDF.";
      pdfInFlightRef.current = true;
      safeSet(() => {
        setPdfBusy(kind);
        setPdfErrors((p) => ({ ...p, [kind]: null }));
        setA11yStatus(announce);
      });
      try {
        await downloadRecipientPreviewPdf({
          agreementId: ctx.agreementId,
          readHeaders: ctx.readHeaders,
          exportKind: kind,
          html,
          fileBasename: ctx.exportBasename,
          reviewerSlug,
          exportedAt,
        });
        safeSet(() => setA11yStatus("PDF download started."));
      } catch (e: unknown) {
        const raw = e instanceof Error ? e.message : String(e ?? "");
        const msg = humanizeRecipientPdfExportErrorMessage(raw.trim() || RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE);
        safeSet(() => {
          setPdfErrors((p) => ({ ...p, [kind]: msg }));
          setA11yStatus(`PDF export failed. ${msg}`);
        });
        schedulePdfErrorClear(kind);
      } finally {
        pdfInFlightRef.current = false;
        safeSet(() => setPdfBusy(null));
        window.setTimeout(() => safeSet(() => setA11yStatus("")), 900);
      }
    },
    [pdfBusy, redlinePdfHumanExtras, safeSet, schedulePdfErrorClear],
  );

  const linkBtn =
    "min-w-0 max-w-full break-words text-left text-[11px] font-semibold text-sky-300/95 underline decoration-sky-500/40 decoration-1 underline-offset-2 hover:text-sky-200 sm:text-xs";
  const pdfBtnBase =
    "min-w-0 max-w-full break-words rounded border px-2 py-1.5 text-left text-[11px] transition-colors border-slate-600/60 bg-slate-900/35 text-slate-200 hover:bg-slate-900/65 hover:border-slate-500/70 disabled:cursor-not-allowed disabled:opacity-45 sm:text-xs";

  const pdfReady = Boolean(pdfReadContext);
  const anyPdfErr = Boolean(pdfErrors.original || pdfErrors.proposed || pdfErrors.redline || copyFlowError);

  useLayoutEffect(() => {
    if (!anyPdfErr) return;
    const id = window.requestAnimationFrame(() => {
      pdfExportErrorRegionRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [anyPdfErr]);

  return (
    <div
      className="mt-2 rounded-md border border-slate-600/50 bg-slate-950/35 px-2.5 py-2 sm:px-3 sm:py-2.5"
      data-testid="recipient-preview-versions-export"
    >
      <p className="sr-only" aria-live="polite">
        {a11yStatus}
      </p>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-300 sm:text-xs">
        Export review versions
      </h3>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-400 sm:text-xs">
        Save the original, proposed version, or redline before sending.{" "}
        <span className="text-slate-500">{NOT_LEGAL_ADVICE}</span>
      </p>

      <div
        className="mt-2 grid grid-cols-1 gap-1 min-[400px]:grid-cols-2 min-[400px]:gap-1.5"
        role="group"
        aria-label="Download PDF versions"
      >
        <button
          type="button"
          disabled={!pdfReady || pdfBusy === "original"}
          aria-busy={pdfBusy === "original"}
          className={pdfBtnBase}
          data-testid="recipient-preview-download-original-pdf"
          onClick={() => {
            safeSet(() => setPdfErrors((p) => ({ ...p, original: null })));
            void onPdf("original");
          }}
        >
          {pdfBusy === "original" ? "Preparing PDF…" : RECIPIENT_EXPORT_REVIEW_DOWNLOAD_ORIGINAL_DRAFT_PDF}
        </button>
        <button
          type="button"
          disabled={!pdfReady || pdfBusy === "proposed"}
          aria-busy={pdfBusy === "proposed"}
          className={pdfBtnBase}
          data-testid="recipient-preview-download-proposed-pdf"
          onClick={() => {
            safeSet(() => setPdfErrors((p) => ({ ...p, proposed: null })));
            void onPdf("proposed");
          }}
        >
          {pdfBusy === "proposed" ? "Preparing PDF…" : RECIPIENT_EXPORT_REVIEW_DOWNLOAD_REVISED_AGREEMENT_PDF}
        </button>
        <button
          type="button"
          disabled={!pdfReady || pdfBusy === "redline"}
          aria-busy={pdfBusy === "redline"}
          className={`${pdfBtnBase} min-[400px]:col-span-2${detachRedlinePdfButton ? " sr-only" : ""}`}
          data-testid="recipient-preview-download-redline-pdf"
          onClick={() => {
            safeSet(() => setPdfErrors((p) => ({ ...p, redline: null })));
            void onPdf("redline");
          }}
        >
          {pdfBusy === "redline" ? "Preparing PDF…" : RECIPIENT_EXPORT_REVIEW_DOWNLOAD_REDLINE_PDF}
        </button>
      </div>

      {anyPdfErr ? (
        <div
          ref={pdfExportErrorRegionRef}
          tabIndex={-1}
          className="mt-1.5 space-y-0.5 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
          data-testid="recipient-pdf-export-error"
          role="alert"
        >
          {pdfErrors.original ? (
            <p className="text-[10px] text-amber-100/95 sm:text-[11px]">Original PDF: {pdfErrors.original}</p>
          ) : null}
          {pdfErrors.proposed ? (
            <p className="text-[10px] text-amber-100/95 sm:text-[11px]">Proposed PDF: {pdfErrors.proposed}</p>
          ) : null}
          {pdfErrors.redline ? (
            <p className="text-[10px] text-amber-100/95 sm:text-[11px]">Redline PDF: {pdfErrors.redline}</p>
          ) : null}
          {copyFlowError ? <p className="text-[10px] text-amber-100/95 sm:text-[11px]">{copyFlowError}</p> : null}
        </div>
      ) : null}

      <div className="mt-2 border-t border-slate-700/40 pt-2">
        <p className="text-[11px] font-medium text-slate-400 sm:text-xs">Copy text · Download text</p>
        <p className="mt-0.5 text-[10px] leading-snug text-slate-500 sm:text-[11px]">
          Optional plain-text copies for your files.
        </p>
        <div className="mt-1.5 grid grid-cols-1 gap-1 min-[400px]:grid-cols-2 min-[400px]:gap-1.5">
          <button
            type="button"
            className={linkBtn}
            data-testid="recipient-copy-original-draft"
            onClick={() => void copyText("original", plainSource.currentPlain)}
          >
            Copy text — original
          </button>
          <button
            type="button"
            className={linkBtn}
            data-testid="recipient-copy-proposed-draft"
            onClick={() => void copyText("proposed", plainSource.proposedPlain)}
          >
            Copy text — proposed
          </button>
          <button
            type="button"
            className={linkBtn}
            data-testid="recipient-copy-redline-summary"
            onClick={() => void copyText("redline", redlinePlain())}
          >
            Copy text — redline summary
          </button>
          <span className="hidden min-[400px]:block" aria-hidden />
          <button
            type="button"
            className="text-left text-[10px] font-medium text-slate-500 hover:text-slate-400 sm:text-[11px]"
            data-testid="recipient-download-original-text"
            onClick={() => downloadTextFile("original", plainSource.currentPlain)}
          >
            Download text — original
          </button>
          <button
            type="button"
            className="text-left text-[10px] font-medium text-slate-500 hover:text-slate-400 sm:text-[11px]"
            data-testid="recipient-download-proposed-text"
            onClick={() => downloadTextFile("proposed", plainSource.proposedPlain)}
          >
            Download text — proposed
          </button>
          <button
            type="button"
            className="text-left text-[10px] font-medium text-slate-500 hover:text-slate-400 sm:text-[11px]"
            data-testid="recipient-download-redline-text"
            onClick={() => downloadTextFile("redline", redlinePlain())}
          >
            Download text — redline
          </button>
        </div>
      </div>

      {copyAck ? (
        <p className="mt-1.5 text-[10px] text-emerald-200/90 sm:text-[11px]" role="status">
          {copyAck === "original"
            ? "Copied text — original."
            : copyAck === "proposed"
              ? "Copied text — proposed."
              : "Copied text — redline summary."}
        </p>
      ) : null}
    </div>
  );
}
