/**
 * Thin wrapper around pdf.js dynamic imports so tests can mock PDF loading
 * without relying on vitest intercepting bare `import("pdfjs-dist")`.
 */
let workerConfigured = false;

export function loadPdfJs(): Promise<typeof import("pdfjs-dist")> {
  return import("pdfjs-dist");
}

export function loadPdfWorkerUrl(): Promise<{ default: string }> {
  return import("pdfjs-dist/build/pdf.worker.min.mjs?url");
}

export async function loadPdfJsWithWorker(): Promise<typeof import("pdfjs-dist")> {
  const pdfjs = await loadPdfJs();
  if (!workerConfigured) {
    const workerMod = await loadPdfWorkerUrl();
    pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
    workerConfigured = true;
  }
  return pdfjs;
}

/** Clears worker wiring between vitest cases (production ignores). */
export function resetPdfWorkerForTests(): void {
  workerConfigured = false;
}
