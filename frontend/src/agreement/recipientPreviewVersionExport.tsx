import { useCallback, useState } from "react";
import { NOT_LEGAL_ADVICE } from "../compliance/disclosureCopy";
import type { LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { downloadRecipientPreviewPdf } from "./recipientPreviewPdfDownload";
import { buildRecipientRedlinePdfHtml, type RecipientPreviewPdfExportKind } from "./recipientPreviewPdfHtml";

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
};

type Props = {
  plainSource: RecipientPreviewVersionPlainSource;
  legalRedlineVm: LegalRedlineDocumentViewModel;
  pdfReadContext: RecipientPreviewPdfReadContext | null;
};

/**
 * Compact disclosure for reviewers who want copies outside LawDog.
 * PDFs: server-rendered (PyMuPDF Story) from the same HTML as the visible preview.
 */
export function RecipientPreviewVersionsExport({ plainSource, legalRedlineVm, pdfReadContext }: Props) {
  const [flash, setFlash] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<RecipientPreviewPdfExportKind | null>(null);
  const redlinePlain = useCallback(() => legalRedlineDocumentVmToPlainSummary(legalRedlineVm), [legalRedlineVm]);

  const copyText = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setFlash(label);
      window.setTimeout(() => setFlash(null), 2000);
    } catch {
      setFlash("Could not copy");
      window.setTimeout(() => setFlash(null), 2500);
    }
  }, []);

  const downloadTextFile = (filename: string, body: string) => {
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onPdf = useCallback(
    async (kind: RecipientPreviewPdfExportKind) => {
      const ctx = pdfReadContext;
      if (!ctx || pdfBusy) return;
      const html =
        kind === "original"
          ? ctx.scrubbedOriginalHtml
          : kind === "proposed"
            ? ctx.scrubbedProposedHtml
            : buildRecipientRedlinePdfHtml(legalRedlineVm);
      if (!html.trim()) {
        setFlash("Nothing to export yet.");
        window.setTimeout(() => setFlash(null), 2200);
        return;
      }
      setPdfBusy(kind);
      try {
        await downloadRecipientPreviewPdf({
          agreementId: ctx.agreementId,
          readHeaders: ctx.readHeaders,
          exportKind: kind,
          html,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "PDF export failed.";
        setFlash(msg);
        window.setTimeout(() => setFlash(null), 3200);
      } finally {
        setPdfBusy(null);
      }
    },
    [legalRedlineVm, pdfBusy, pdfReadContext],
  );

  const linkBtn =
    "text-left text-xs font-semibold text-sky-300/95 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-200 sm:text-[13px]";
  const pdfBtnBase =
    "block w-full rounded border px-2 py-1.5 text-left text-xs transition-colors border-slate-600/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/70 hover:border-slate-500/80 disabled:cursor-not-allowed disabled:opacity-45 sm:text-[13px]";

  const pdfReady = Boolean(pdfReadContext);

  return (
    <details
      className="mt-3 rounded-md border border-slate-600/60 bg-slate-950/40 px-3 py-2 [&_summary::-webkit-details-marker]:hidden"
      data-testid="recipient-preview-versions-export"
    >
      <summary className="cursor-pointer list-none text-xs font-semibold text-slate-300 hover:text-slate-200 sm:text-[13px]">
        Download / copy versions
      </summary>
      <div className="mt-2 border-t border-slate-700/50 pt-2">
        <p className="text-xs font-semibold text-slate-200" data-testid="recipient-preview-versions-export-title">
          Use outside LawDog
        </p>
        <p className="mt-1 text-[11px] leading-snug text-slate-400">
          Download or copy a version if you want to review it with counsel, another tool, or your own notes.{" "}
          <span className="text-slate-500">{NOT_LEGAL_ADVICE}</span>
        </p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          <button
            type="button"
            className={linkBtn}
            data-testid="recipient-copy-original-draft"
            onClick={() => void copyText("original", plainSource.currentPlain)}
          >
            Copy original draft
          </button>
          <button
            type="button"
            className={linkBtn}
            data-testid="recipient-copy-proposed-draft"
            onClick={() => void copyText("proposed", plainSource.proposedPlain)}
          >
            Copy proposed draft
          </button>
          <button
            type="button"
            className={linkBtn}
            data-testid="recipient-copy-redline-summary"
            onClick={() => void copyText("redline", redlinePlain())}
          >
            Copy redline preview
          </button>
          <span className="hidden sm:block" aria-hidden />
          <button
            type="button"
            className="text-left text-[11px] font-semibold text-slate-500"
            data-testid="recipient-download-original-text"
            onClick={() => downloadTextFile("lawdog-original-draft.txt", plainSource.currentPlain)}
          >
            Download text — Original
          </button>
          <button
            type="button"
            className="text-left text-[11px] font-semibold text-slate-500"
            data-testid="recipient-download-proposed-text"
            onClick={() => downloadTextFile("lawdog-proposed-draft.txt", plainSource.proposedPlain)}
          >
            Download text — Proposed
          </button>
          <button
            type="button"
            className="text-left text-[11px] font-semibold text-slate-500"
            data-testid="recipient-download-redline-text"
            onClick={() => downloadTextFile("lawdog-redline-preview.txt", redlinePlain())}
          >
            Download text — Redline
          </button>
        </div>
        <div className="mt-3 space-y-1 border-t border-slate-700/40 pt-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:text-[11px]">Download PDF</p>
          <button
            type="button"
            disabled={!pdfReady || pdfBusy !== null}
            className={pdfBtnBase}
            data-testid="recipient-download-original-pdf"
            onClick={() => void onPdf("original")}
          >
            {pdfBusy === "original" ? "Preparing PDF…" : "Download current PDF"}
          </button>
          <button
            type="button"
            disabled={!pdfReady || pdfBusy !== null}
            className={pdfBtnBase}
            data-testid="recipient-download-proposed-pdf"
            onClick={() => void onPdf("proposed")}
          >
            {pdfBusy === "proposed" ? "Preparing PDF…" : "Download proposed PDF"}
          </button>
          <button
            type="button"
            disabled={!pdfReady || pdfBusy !== null}
            className={pdfBtnBase}
            data-testid="recipient-download-redline-pdf"
            onClick={() => void onPdf("redline")}
          >
            {pdfBusy === "redline" ? "Preparing PDF…" : "Download redline PDF"}
          </button>
        </div>
        {flash ? (
          <p
            className={`mt-2 text-[11px] ${
              flash === "original" || flash === "proposed" || flash === "redline"
                ? "text-emerald-200/90"
                : "text-amber-100/95"
            }`}
            role="status"
          >
            {flash === "original"
              ? "Copied original."
              : flash === "proposed"
                ? "Copied proposed."
                : flash === "redline"
                  ? "Copied redline summary."
                  : flash}
          </p>
        ) : null}
      </div>
    </details>
  );
}
