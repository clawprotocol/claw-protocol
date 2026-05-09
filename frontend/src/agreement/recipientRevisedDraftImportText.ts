import {
  RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK,
  RECIPIENT_DRAFT_IMPORT_PDF_LOW_TEXT,
  RECIPIENT_DRAFT_IMPORT_READ_ERROR,
} from "./portableReviewCopy";
import { recipientUploadError, recipientUploadLogParseStart, recipientUploadLogParseSuccess } from "./recipientDraftUploadLog";
import { sanitizeRecipientImportedRevisionText } from "./recipientRevisedDraftExtractSanitize";
import { loadPdfJsWithWorker } from "./recipientRevisedDraftPdfJs";

/** Agreement body shorter than this after PDF import is treated as unusable for compare. */
const PDF_IMPORT_MIN_AGREEMENT_CHARS = 48;

/**
 * Single `accept` value for every revised-draft file input (want-a-copy strip + revise workspace).
 * Keep PDF + text/markdown only — including Word MIME types has been seen to grey out PDFs in macOS Finder/WebKit.
 */
export const REVISED_DRAFT_FILE_INPUT_ACCEPT =
  ".pdf,application/pdf,.txt,text/plain,.md,text/markdown,text/x-markdown";

function readFileAsTextFallback(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsText(file);
  });
}

async function readPlainFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }
  return readFileAsTextFallback(file);
}

async function extractPdfPlainText(file: File): Promise<string> {
  const pdfjs = await loadPdfJsWithWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  try {
    const chunks: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
        .join(" ");
      chunks.push(line);
    }
    return chunks.join("\n\n");
  } finally {
    try {
      await pdf.destroy();
    } catch {
      /* avoid throwing from cleanup — caller still gets parse fallback or text */
    }
  }
}

export type ExtractRevisedDraftPlainTextOk = {
  ok: true;
  /** Agreement-shaped body after import sanitization (page artifacts stripped, reviewer tail split). */
  text: string;
  /** Reviewer commentary split from the agreement body during import (merged into compare notes UI). */
  importReviewerNotesTail?: string | null;
  /** Short labels for QA (e.g. stripped page headers). */
  importArtifactsRemoved?: string[];
};

export type ExtractRevisedDraftPlainTextResult = ExtractRevisedDraftPlainTextOk | { ok: false; error: string };

/**
 * Extracts plain text from a recipient revised-draft upload.
 * TXT/Markdown and PDF (selectable text) are supported. Other types (e.g. dropped DOCX) get a graceful parse fallback.
 */
export async function extractRevisedDraftPlainText(file: File): Promise<ExtractRevisedDraftPlainTextResult> {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();

  const isTxtMd =
    name.endsWith(".txt") ||
    name.endsWith(".text") ||
    name.endsWith(".md") ||
    type === "text/plain" ||
    type === "text/markdown" ||
    type === "text/x-markdown";
  const isPdf = name.endsWith(".pdf") || type === "application/pdf";
  const isDocx =
    name.endsWith(".docx") ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isDoc = name.endsWith(".doc") || type === "application/msword";

  if (isDocx || isDoc) {
    return { ok: false, error: RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK };
  }

  if (isTxtMd) {
    try {
      recipientUploadLogParseStart({ name: file.name, type: file.type });
      const raw = await readPlainFileText(file);
      const san = sanitizeRecipientImportedRevisionText(raw);
      recipientUploadLogParseSuccess({
        name: file.name,
        bodyLen: san.agreementText.trim().length,
      });
      return {
        ok: true,
        text: san.agreementText,
        importReviewerNotesTail: san.reviewerNotes,
        importArtifactsRemoved: san.artifactsRemoved,
      };
    } catch (e) {
      recipientUploadError("txt-read-exception", e, { name: file.name });
      return { ok: false, error: RECIPIENT_DRAFT_IMPORT_READ_ERROR };
    }
  }

  if (isPdf) {
    try {
      recipientUploadLogParseStart({ name: file.name, type: file.type });
      const raw = await extractPdfPlainText(file);
      if (!raw.trim()) {
        recipientUploadError("pdf-empty-raw", "zero-length text layer", { name: file.name });
        return { ok: false, error: RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK };
      }
      const san = sanitizeRecipientImportedRevisionText(raw);
      const body = san.agreementText.trim();
      if (body.length < PDF_IMPORT_MIN_AGREEMENT_CHARS) {
        recipientUploadError("pdf-thin-body", "sanitized agreement text too short", {
          name: file.name,
          rawLen: raw.trim().length,
          bodyLen: body.length,
        });
        return { ok: false, error: RECIPIENT_DRAFT_IMPORT_PDF_LOW_TEXT };
      }
      recipientUploadLogParseSuccess({
        name: file.name,
        rawLen: raw.trim().length,
        bodyLen: body.length,
      });
      return {
        ok: true,
        text: san.agreementText,
        importReviewerNotesTail: san.reviewerNotes,
        importArtifactsRemoved: san.artifactsRemoved,
      };
    } catch (e) {
      recipientUploadError("pdf-parse-exception", e, { name: file.name });
      return { ok: false, error: RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK };
    }
  }

  return { ok: false, error: RECIPIENT_DRAFT_IMPORT_READ_ERROR };
}
