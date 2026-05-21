import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildSourceComparisonView,
  filterSourceComparisonSections,
  type SourceComparisonSection,
} from "./sourceComparisonReview";
import {
  logSourceCompareExtractionFailed,
  logSourceCompareStats,
  MIN_SOURCE_COMPARE_TEXT_CHARS,
} from "./agreementReviewMode";
import { extractRevisedDraftPlainText, REVISED_DRAFT_FILE_INPUT_ACCEPT } from "../../agreement/recipientRevisedDraftImportText";
import { downloadExportDraftDocx, downloadExportDraftTxt } from "../../agreement/proRedlineReviewApi";

export type SourceComparisonExtractionState =
  | { ok: true }
  | { ok: false; reason: string };

type Props = {
  agreementId?: string | null;
  sourceText: string;
  revisedText: string;
  extractionState?: SourceComparisonExtractionState;
  onSourceTextChange?: (text: string, fileName?: string) => void;
  onAcceptChanges?: () => void;
  onEditWording?: () => void;
  onSendForSignature?: () => void;
  onContinueAsNewDraft?: () => void;
  disabled?: boolean;
};

function SectionBlock({ section, defaultOpen }: { section: SourceComparisonSection; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const statusLabel =
    section.status === "unchanged"
      ? "unchanged"
      : section.status === "changed"
        ? "changed"
        : section.status === "added"
          ? "added"
          : "removed";

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-lg border border-stone-300/80 bg-white/90"
    >
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-stone-800 sm:px-4">
        {section.label}
        <span
          className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            section.status === "unchanged"
              ? "bg-stone-200 text-stone-600"
              : section.status === "changed"
                ? "bg-amber-100 text-amber-900"
                : section.status === "added"
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-rose-100 text-rose-900"
          }`}
        >
          {statusLabel}
        </span>
      </summary>
      <div className="border-t border-stone-200/90 px-3 py-3 sm:px-4">
        {section.status === "unchanged" ? (
          <p className="text-xs text-stone-600">No changes in this section.</p>
        ) : (
          <div className="space-y-3 text-xs leading-relaxed sm:text-sm">
            {section.redlineSegments?.length ? (
              <p className="whitespace-pre-wrap font-serif text-stone-900">
                {section.redlineSegments.map((seg, i) => {
                  if (seg.type === "same") return <span key={i}>{seg.text}</span>;
                  if (seg.type === "insert")
                    return (
                      <mark key={i} className="bg-emerald-200/80 text-emerald-950">
                        {seg.text}
                      </mark>
                    );
                  return (
                    <mark key={i} className="bg-rose-200/80 text-rose-950 line-through">
                      {seg.text}
                    </mark>
                  );
                })}
              </p>
            ) : (
              <>
                {section.sourceExcerpt ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-rose-700">From uploaded file</p>
                    <pre className="mt-1 whitespace-pre-wrap font-serif text-stone-800">{section.sourceExcerpt}</pre>
                  </div>
                ) : null}
                {section.revisedExcerpt ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-emerald-700">In current draft</p>
                    <pre className="mt-1 whitespace-pre-wrap font-serif text-stone-800">{section.revisedExcerpt}</pre>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

export function SourceComparisonReviewPanel({
  agreementId,
  sourceText,
  revisedText,
  extractionState,
  onSourceTextChange,
  onAcceptChanges,
  onEditWording,
  onSendForSignature,
  onContinueAsNewDraft,
  disabled = false,
}: Props) {
  const [showChangedOnly, setShowChangedOnly] = useState(true);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const sourceOk = sourceText.trim().length >= MIN_SOURCE_COMPARE_TEXT_CHARS;
  const revisedOk = revisedText.trim().length >= MIN_SOURCE_COMPARE_TEXT_CHARS;
  const extractionFailed = extractionState?.ok === false;

  const view = useMemo(() => {
    if (!sourceOk || !revisedOk) return null;
    return buildSourceComparisonView(sourceText, revisedText);
  }, [sourceOk, revisedOk, sourceText, revisedText]);

  useEffect(() => {
    if (!view) return;
    logSourceCompareStats({
      sourceChars: sourceText.length,
      revisedChars: revisedText.length,
      changedSections: view.summary.changedSections,
    });
  }, [view, sourceText.length, revisedText.length]);

  const visibleSections = useMemo(
    () => (view ? filterSourceComparisonSections(view.sections, showChangedOnly) : []),
    [view, showChangedOnly],
  );

  const onPickFile = useCallback(
    async (file: File | null) => {
      if (!file || !onSourceTextChange) return;
      setUploadBusy(true);
      setUploadErr(null);
      try {
        const result = await extractRevisedDraftPlainText(file);
        if (!result.ok) {
          const reason = result.error || "extraction_failed";
          setUploadErr(reason);
          logSourceCompareExtractionFailed(reason);
          return;
        }
        onSourceTextChange(result.text, file.name);
      } catch (e) {
        const reason = e instanceof Error ? e.message : "read_failed";
        setUploadErr(reason);
        logSourceCompareExtractionFailed(reason);
      } finally {
        setUploadBusy(false);
      }
    },
    [onSourceTextChange],
  );

  const handleDownloadComparison = useCallback(async () => {
    if (!agreementId) return;
    const r = await downloadExportDraftTxt(agreementId);
    if (!r.ok) await downloadExportDraftDocx(agreementId);
  }, [agreementId]);

  if (extractionFailed || !sourceOk) {
    return (
      <div
        className="rounded-2xl border border-amber-500/40 bg-amber-50/95 p-4 sm:p-5"
        role="region"
        aria-label="Review changes"
      >
        <h3 className="text-base font-semibold text-stone-900">Review changes</h3>
        <p className="mt-1 text-sm text-stone-700">
          We could not reliably read enough text from the uploaded file to compare changes.
        </p>
        {uploadErr ? <p className="mt-2 text-xs text-amber-900">{uploadErr}</p> : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {onSourceTextChange ? (
            <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-stone-400 bg-white px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50">
              <span>Upload a clearer file</span>
              <input
                type="file"
                accept={REVISED_DRAFT_FILE_INPUT_ACCEPT}
                className="sr-only"
                disabled={disabled || uploadBusy}
                onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
              />
            </label>
          ) : null}
          {onEditWording ? (
            <button
              type="button"
              className="rounded-lg border border-stone-400 bg-white px-3 py-2 text-sm font-semibold text-stone-800"
              onClick={onEditWording}
            >
              Paste agreement text
            </button>
          ) : null}
          {onContinueAsNewDraft ? (
            <button
              type="button"
              className="rounded-lg bg-stone-800 px-3 py-2 text-sm font-semibold text-white"
              onClick={onContinueAsNewDraft}
            >
              Continue as new draft
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-stone-300/90 bg-[#f8f6f0] p-4 shadow-sm sm:p-5"
      role="region"
      aria-label="Review changes"
      data-testid="source-comparison-review-panel"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-stone-900 sm:text-lg">Review changes</h3>
          <p className="mt-1 text-xs leading-relaxed text-stone-600 sm:text-sm">
            LawDog is showing only what changed from the uploaded document. No AI legal review is being applied.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg border border-sky-600/30 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-900">
            Change comparison
          </span>
          <span className="rounded-lg border border-stone-400/60 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-600">
            No legal analysis
          </span>
        </div>
      </div>

      {view ? (
        <p className="mt-3 text-sm font-medium text-stone-800">
          {view.summary.additions} additions · {view.summary.deletions} deletions · {view.summary.changedSections}{" "}
          changed sections
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-700">
          <input
            type="checkbox"
            checked={showChangedOnly}
            onChange={(e) => setShowChangedOnly(e.target.checked)}
            className="rounded border-stone-400"
          />
          Changed only
        </label>
        <button
          type="button"
          className="text-xs font-medium text-stone-600 underline hover:text-stone-900"
          onClick={() => setShowChangedOnly((v) => !v)}
        >
          {showChangedOnly ? "Show all" : "Changed only"}
        </button>
      </div>

      <div className="mt-4 max-h-[min(50vh,28rem)] space-y-2 overflow-y-auto">
        {visibleSections.length === 0 ? (
          <p className="text-sm text-stone-600">No differences detected between the uploaded file and the current draft.</p>
        ) : (
          visibleSections.map((sec) => (
            <SectionBlock key={sec.id} section={sec} defaultOpen={sec.status !== "unchanged"} />
          ))
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-stone-300/70 pt-4 sm:flex-row sm:flex-wrap">
        {onAcceptChanges ? (
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            disabled={disabled}
            onClick={onAcceptChanges}
          >
            Accept changes
          </button>
        ) : null}
        {onEditWording ? (
          <button
            type="button"
            className="rounded-lg border border-stone-400 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
            disabled={disabled}
            onClick={onEditWording}
          >
            Edit wording
          </button>
        ) : null}
        {onSendForSignature ? (
          <button
            type="button"
            className="rounded-lg border border-emerald-600/50 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
            disabled={disabled}
            onClick={onSendForSignature}
          >
            Send for signature
          </button>
        ) : null}
        {agreementId ? (
          <button
            type="button"
            className="rounded-lg border border-stone-400 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            disabled={disabled}
            onClick={() => void handleDownloadComparison()}
          >
            Download comparison
          </button>
        ) : null}
      </div>
    </div>
  );
}
