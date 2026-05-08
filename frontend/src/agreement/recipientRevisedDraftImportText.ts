import {
  RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK,
  RECIPIENT_DRAFT_IMPORT_READ_ERROR,
} from "./portableReviewCopy";
import { loadPdfJsWithWorker } from "./recipientRevisedDraftPdfJs";

/** File input `accept` for revised-draft import (strip + revise workspace). */
export const REVISED_DRAFT_FILE_INPUT_ACCEPT =
  ".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

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

/**
 * Extracts plain text from a recipient revised-draft upload.
 * TXT/Markdown and PDF (selectable text) are supported. DOC/DOCX: import not wired yet — graceful error copy.
 */
export async function extractRevisedDraftPlainText(
  file: File,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();

  const isTxtMd =
    name.endsWith(".txt") ||
    name.endsWith(".text") ||
    name.endsWith(".md") ||
    type === "text/plain" ||
    type === "text/markdown";
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
      const text = await readPlainFileText(file);
      return { ok: true, text };
    } catch {
      return { ok: false, error: RECIPIENT_DRAFT_IMPORT_READ_ERROR };
    }
  }

  if (isPdf) {
    try {
      const text = await extractPdfPlainText(file);
      if (!text.trim()) {
        return { ok: false, error: RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK };
      }
      return { ok: true, text };
    } catch {
      return { ok: false, error: RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK };
    }
  }

  return { ok: false, error: RECIPIENT_DRAFT_IMPORT_READ_ERROR };
}
