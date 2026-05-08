/** @vitest-environment jsdom */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK } from "./portableReviewCopy";

const pdfHarness = vi.hoisted(() => {
  const pdfState = {
    textItems: [] as { str: string }[],
    rejectLoad: false,
  };
  const getDocument = vi.fn(() => ({
    promise: (async () => {
      if (pdfState.rejectLoad) {
        throw new Error("InvalidPDFException");
      }
      return {
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({ items: [...pdfState.textItems] }),
        }),
        destroy: vi.fn().mockResolvedValue(undefined),
      };
    })(),
  }));
  const loadPdfJsWithWorker = vi.fn(async () => ({
    GlobalWorkerOptions: { workerSrc: "" as string },
    getDocument,
  }));
  return { pdfState, getDocument, loadPdfJsWithWorker };
});

vi.mock("./recipientRevisedDraftPdfJs", () => ({
  loadPdfJs: vi.fn(),
  loadPdfWorkerUrl: vi.fn(),
  loadPdfJsWithWorker: pdfHarness.loadPdfJsWithWorker,
  resetPdfWorkerForTests: vi.fn(),
}));

let extractRevisedDraftPlainText: (file: File) => Promise<
  | { ok: true; text: string }
  | { ok: false; error: string }
>;

describe("extractRevisedDraftPlainText (PDF, mocked pdf.js loader)", () => {
  beforeAll(async () => {
    vi.resetModules();
    const mod = await import("./recipientRevisedDraftImportText");
    extractRevisedDraftPlainText = mod.extractRevisedDraftPlainText;
  });

  beforeEach(() => {
    pdfHarness.pdfState.textItems = [{ str: "Mocked layer" }];
    pdfHarness.pdfState.rejectLoad = false;
    pdfHarness.loadPdfJsWithWorker.mockClear();
  });

  it("returns parse fallback for scanned / empty text-layer PDF", async () => {
    pdfHarness.pdfState.textItems = [];
    const file = new File([new Uint8Array([1, 2, 3, 4])], "scan.pdf", { type: "application/pdf" });
    const r = await extractRevisedDraftPlainText(file);
    expect(r).toEqual({ ok: false, error: RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK });
    expect(pdfHarness.loadPdfJsWithWorker).toHaveBeenCalled();
  });

  it("returns parse fallback when pdf.js load fails", async () => {
    pdfHarness.pdfState.rejectLoad = true;
    const file = new File([new Uint8Array([1])], "bad.pdf", { type: "application/pdf" });
    const r = await extractRevisedDraftPlainText(file);
    expect(r).toEqual({ ok: false, error: RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK });
    expect(pdfHarness.loadPdfJsWithWorker).toHaveBeenCalled();
  });
});
