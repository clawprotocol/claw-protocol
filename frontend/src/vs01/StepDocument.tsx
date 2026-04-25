import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { finalizeDocument } from "./vs01Api";
import type { Vs01DocumentIntakeSource, Vs01FinalizeDocumentPayload, Vs01LoadingState } from "./types";

export type StepDocumentProps = {
  loading: Vs01LoadingState;
  setLoading: (next: Vs01LoadingState) => void;
  documentId: string | null;
  contentSha256: string | null;
  onFinalized: (payload: Vs01FinalizeDocumentPayload) => void;
  onError: (message: string | null) => void;
  onContinue?: () => void;
  /** Quick flow: `/app/quick?start=` — PDF may auto-open file picker once. */
  entryIntent?: "pdf" | "type" | "speak" | null;
  /** Quick flow: submit typed intake and continue to structured draft (`/app/create`). */
  onQuickHandoffTypedIntake?: (text: string) => void;
  /** Quick flow: continue to voice capture on `/app/create`. */
  onQuickHandoffSpeaking?: () => void;
};

const STEP_ID = "document" as const;

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fileTypeLabel(file: File): string {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "PDF";
  if (file.type.startsWith("image/")) {
    const sub = file.type.slice(6);
    return sub ? sub.toUpperCase() : "Image";
  }
  return file.type || "Document";
}

function isPdfFile(f: File): boolean {
  return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
}

/** User-facing finalize errors — avoid raw fetch / env strings in the banner. */
function mapFinalizeErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (raw.includes("VITE_CLAW_API_BASE") || lower.includes("vite_claw_api_base")) {
    return "The app is not configured to reach the LawDog backend. Ask your administrator to set the API URL.";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("connection refused") ||
    lower.includes("err_connection_refused") ||
    lower.includes("econnrefused")
  ) {
    return "We couldn't reach the LawDog service. Check your connection, confirm the backend is running if you're local, then try again.";
  }
  return raw;
}

/**
 * Step 0 — Document: PDF upload, preview, finalize.
 */
export function StepDocument({
  loading,
  setLoading,
  documentId,
  contentSha256,
  onFinalized,
  onError,
  onContinue,
  entryIntent = null,
  onQuickHandoffTypedIntake,
  onQuickHandoffSpeaking,
}: StepDocumentProps) {
  const busyFinalize = loading === "finalize";
  const loadingIdle = loading === "idle";
  const [file, setFile] = useState<File | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const pdfFileInputRef = useRef<HTMLInputElement | null>(null);
  const didAutoOpenPdfRef = useRef(false);
  /** How the current file was added — drives default agreement title on Details. */
  const [intakeSource, setIntakeSource] = useState<Vs01DocumentIntakeSource | null>(null);

  const showQuickEntryChoices = Boolean(onQuickHandoffTypedIntake && onQuickHandoffSpeaking);
  type QuickStartMode = "upload" | "typing" | "speaking";
  const [quickStartMode, setQuickStartMode] = useState<QuickStartMode>("upload");
  const [quickTypeText, setQuickTypeText] = useState("");

  const showQuickUploadModule = quickStartMode === "upload";
  const showQuickTypingModule = quickStartMode === "typing";
  const showQuickSpeakingModule = quickStartMode === "speaking";

  const hasFile = Boolean(file && fileLabel);
  /** Server returned document id + hash after finalize (or restored from parent). */
  const hasStoredDoc = Boolean(documentId?.trim() && contentSha256?.trim());
  /** Continue only when finalize is done and global loading is idle. */
  const canContinue = loadingIdle && hasStoredDoc;
  /** Empty flow only; hidden while finalizing request too. */
  const showChooser = !hasFile && !hasStoredDoc && !busyFinalize;
  const showSelectedCard = hasFile || hasStoredDoc;
  const showPreviewPanel = hasFile || hasStoredDoc;

  useEffect(() => {
    if (!showQuickEntryChoices) return;
    if (entryIntent !== "pdf") return;
    if (quickStartMode !== "upload") return;
    if (!showChooser || busyFinalize) return;
    if (didAutoOpenPdfRef.current) return;
    didAutoOpenPdfRef.current = true;
    requestAnimationFrame(() => pdfFileInputRef.current?.click());
  }, [showQuickEntryChoices, entryIntent, quickStartMode, showChooser, busyFinalize]);

  useEffect(() => {
    if (!showQuickEntryChoices) return;
    if (entryIntent === "type") setQuickStartMode("typing");
    else if (entryIntent === "speak") setQuickStartMode("speaking");
  }, [showQuickEntryChoices, entryIntent]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    setPreviewFailed(false);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPickFile = useCallback(
    (f: File | null, source?: Vs01DocumentIntakeSource) => {
      setFile(f);
      setFileLabel(f ? f.name : null);
      if (!f) {
        setIntakeSource(null);
      } else {
        setIntakeSource(source ?? "upload");
      }
      onError(null);
      onFinalized({ documentId: "", contentSha256: "", fileName: null, source: null });
    },
    [onError, onFinalized]
  );

  const handleChangeDocument = useCallback(() => {
    setDragOver(false);
    setPreviewFailed(false);
    if (pdfFileInputRef.current) {
      pdfFileInputRef.current.value = "";
    }
    onPickFile(null);
  }, [onPickFile]);

  const handleFinalize = useCallback(async () => {
    if (!file) {
      onError("Choose a PDF to finalize.");
      return;
    }
    onError(null);
    setLoading("finalize");
    try {
      const b64 = await fileToBase64(file);
      const ct = file.type?.trim() || undefined;
      const res = await finalizeDocument(b64, ct);
      const did = typeof res.document_id === "string" ? res.document_id.trim() : "";
      const hash = typeof res.content_sha256 === "string" ? res.content_sha256.trim() : "";
      if (!did || !hash) {
        throw new Error("Response missing document_id or content_sha256");
      }
      const src: Vs01DocumentIntakeSource = intakeSource ?? "upload";
      onFinalized({
        documentId: did,
        contentSha256: hash,
        fileName: file.name,
        source: src,
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      onError(mapFinalizeErrorMessage(raw));
    } finally {
      setLoading("idle");
    }
  }, [file, intakeSource, onError, onFinalized, setLoading]);

  const isPdf = !!file && isPdfFile(file);
  const isImage = !!file && file.type.startsWith("image/");

  const onDropFile = (f: File | null) => {
    if (!f) return;
    if (!isPdfFile(f)) {
      onError("Please upload a PDF file.");
      return;
    }
    onPickFile(f, "upload");
  };

  const heroDragProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!busyFinalize) setDragOver(true);
    },
    onDragLeave: (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (busyFinalize) return;
      onDropFile(e.dataTransfer.files?.[0] ?? null);
    },
  };

  const handleQuickTypingSubmit = useCallback(() => {
    const t = quickTypeText.trim();
    if (!t || !onQuickHandoffTypedIntake) return;
    onQuickHandoffTypedIntake(t);
  }, [quickTypeText, onQuickHandoffTypedIntake]);

  const workflowContinuityHint = (
    <p className="vs01-doc-entry-continuity-hint">
      Your input will be turned into a structured draft in the same send/sign/proof workflow.
    </p>
  );

  return (
    <section className="vs01-doc-step-root" data-vs01-step={STEP_ID} aria-labelledby="vs01-step-document-title">
      <div
        className={`vs01-doc-step${showChooser ? " vs01-doc-step--hero" : ""}${
          showChooser && showQuickEntryChoices ? " vs01-doc-step--hero-wide" : ""
        }`}
      >
        {showChooser ? (
          showQuickEntryChoices ? (
            <div className="vs01-doc-hero vs01-doc-hero--entry-wide">
              <div className="vs01-doc-quick-entry-stack">
                <h2 id="vs01-step-document-title" className="vs01-sr-only">
                  Start an agreement
                </h2>
                <div key={quickStartMode} className="vs01-doc-quick-module-fade">
                  {showQuickUploadModule ? (
                    <div
                      className={`vs01-doc-entry-primary${dragOver ? " vs01-doc-entry-primary--drag" : ""}${
                        entryIntent === "pdf" ? " vs01-doc-entry-primary--intent" : ""
                      }`}
                      {...heroDragProps}
                    >
                      <span className="vs01-doc-entry-primary-label">Fastest start</span>
                      <p className="vs01-doc-entry-drop-line">Drop your PDF here</p>
                      <input
                        ref={pdfFileInputRef}
                        className="vs01-doc-file-input-hidden"
                        type="file"
                        accept=".pdf,application/pdf"
                        disabled={busyFinalize}
                        tabIndex={-1}
                        aria-hidden
                        onChange={(ev) => {
                          onPickFile(ev.target.files?.[0] ?? null, "upload");
                          ev.target.value = "";
                        }}
                      />
                      <button
                        type="button"
                        className="vs01-doc-upload-cta"
                        disabled={busyFinalize}
                        onClick={() => pdfFileInputRef.current?.click()}
                      >
                        Upload PDF
                      </button>
                      <p className="vs01-doc-hero-drop-hint">PDF only · same workflow after upload</p>
                    </div>
                  ) : null}
                  {showQuickTypingModule ? (
                    <div className="vs01-doc-entry-intake-module">
                      <span className="vs01-doc-entry-intake-kicker">Starting by typing</span>
                      <label htmlFor="vs01-quick-type-intake" className="vs01-sr-only">
                        Describe your deal to structure a draft for send or sign
                      </label>
                      <textarea
                        id="vs01-quick-type-intake"
                        className="vs01-input vs01-doc-entry-intake-textarea"
                        rows={5}
                        value={quickTypeText}
                        onChange={(e) => setQuickTypeText(e.target.value)}
                        placeholder="Describe your deal to structure a draft for send or sign…"
                        disabled={busyFinalize}
                        autoComplete="off"
                      />
                      {workflowContinuityHint}
                      <button
                        type="button"
                        className="vs01-doc-upload-cta"
                        disabled={busyFinalize || !quickTypeText.trim()}
                        onClick={() => handleQuickTypingSubmit()}
                      >
                        Generate structured draft
                      </button>
                      <button
                        type="button"
                        className="vs01-doc-entry-switch-to-upload"
                        disabled={busyFinalize}
                        onClick={() => setQuickStartMode("upload")}
                      >
                        Upload a PDF instead
                      </button>
                      <button
                        type="button"
                        className="vs01-doc-entry-alt-link vs01-doc-entry-intake-cross-link"
                        disabled={busyFinalize}
                        onClick={() => setQuickStartMode("speaking")}
                      >
                        Start by speaking
                      </button>
                    </div>
                  ) : null}
                  {showQuickSpeakingModule ? (
                    <div className="vs01-doc-entry-intake-module">
                      <span className="vs01-doc-entry-intake-kicker">Starting by speaking</span>
                      {workflowContinuityHint}
                      <button
                        type="button"
                        className="vs01-doc-upload-cta"
                        disabled={busyFinalize}
                        onClick={() => onQuickHandoffSpeaking?.()}
                      >
                        Continue with microphone
                      </button>
                      <button
                        type="button"
                        className="vs01-doc-entry-switch-to-upload"
                        disabled={busyFinalize}
                        onClick={() => setQuickStartMode("upload")}
                      >
                        Upload a PDF instead
                      </button>
                      <button
                        type="button"
                        className="vs01-doc-entry-alt-link vs01-doc-entry-intake-cross-link"
                        disabled={busyFinalize}
                        onClick={() => setQuickStartMode("typing")}
                      >
                        Start by typing
                      </button>
                    </div>
                  ) : null}
                </div>
                {showQuickUploadModule ? (
                  <div className="vs01-doc-entry-alt" role="group" aria-labelledby="vs01-quick-alt-label">
                    <span id="vs01-quick-alt-label" className="vs01-doc-entry-alt-label">
                      No PDF? Start another way.
                    </span>
                    <div className="vs01-doc-entry-alt-actions">
                      <button
                        type="button"
                        className="vs01-doc-entry-alt-link"
                        disabled={busyFinalize}
                        onClick={() => setQuickStartMode("typing")}
                      >
                        Start by typing
                      </button>
                      <span className="vs01-doc-entry-alt-sep" aria-hidden>
                        ·
                      </span>
                      <button
                        type="button"
                        className="vs01-doc-entry-alt-link"
                        disabled={busyFinalize}
                        onClick={() => setQuickStartMode("speaking")}
                      >
                        Start by speaking
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="vs01-doc-hero">
              <div
                className={`vs01-doc-hero-card${dragOver ? " vs01-doc-hero-card--drag" : ""}`}
                {...heroDragProps}
              >
                <h2 id="vs01-step-document-title" className="vs01-doc-step-title vs01-doc-hero-title">
                  Start with a document
                </h2>
                <p className="vs01-doc-hero-subtitle">Upload a PDF to begin.</p>
                <input
                  ref={pdfFileInputRef}
                  className="vs01-doc-file-input-hidden"
                  type="file"
                  accept=".pdf,application/pdf"
                  disabled={busyFinalize}
                  tabIndex={-1}
                  aria-hidden
                  onChange={(ev) => {
                    onPickFile(ev.target.files?.[0] ?? null, "upload");
                    ev.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="vs01-doc-upload-cta"
                  disabled={busyFinalize}
                  onClick={() => pdfFileInputRef.current?.click()}
                >
                  Upload PDF
                </button>
                <p className="vs01-doc-hero-drop-hint">Drag &amp; drop supported</p>
              </div>
            </div>
          )
        ) : (
          <>
            {hasFile && !hasStoredDoc ? (
              <>
                {showQuickEntryChoices ? (
                  <p className="vs01-doc-picked-status" role="status" aria-live="polite">
                    PDF ready — lock it in with one tap.
                  </p>
                ) : (
                  <p className="vs01-doc-step-lead vs01-doc-step-lead--tight">Next: finalize to save on the server.</p>
                )}
              </>
            ) : null}

            {showSelectedCard ? (
              <div
                className="vs01-doc-work-card"
                aria-live="polite"
                aria-busy={busyFinalize && showQuickEntryChoices ? true : undefined}
              >
                <div className="vs01-doc-selected-row">
                  <div className="vs01-doc-selected-info">
                    {hasFile ? (
                      <>
                        <span className="vs01-doc-selected-eyebrow">Selected document</span>
                        <span className="vs01-doc-selected-name">{fileLabel}</span>
                        <span className="vs01-doc-selected-meta">{file && fileTypeLabel(file)}</span>
                      </>
                    ) : (
                      <>
                        <span className="vs01-doc-selected-eyebrow">Document on record</span>
                        <span className="vs01-doc-selected-mono">{documentId}</span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    className="vs01-doc-selected-change"
                    disabled={busyFinalize}
                    onClick={handleChangeDocument}
                  >
                    Change document
                  </button>
                </div>

                {showPreviewPanel ? (
                  <div className="vs01-doc-preview-inline" aria-label="Document preview">
                    <div className="vs01-doc-preview-body vs01-doc-preview-body--flush">
                      {!file || !previewUrl ? (
                        <p className="vs01-doc-preview-empty">No preview available for this document.</p>
                      ) : previewFailed ? (
                        <div className="vs01-doc-preview-fallback">
                          <p className="vs01-doc-preview-fallback-text">
                            Preview not available in this view — open the document below. You can still finalize.
                          </p>
                          <a
                            className="vs01-inline-link"
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open in new tab
                          </a>
                        </div>
                      ) : isPdf ? (
                        <iframe
                          title="Agreement PDF preview"
                          className="vs01-doc-preview-frame"
                          src={`${previewUrl}#view=FitH`}
                          onError={() => setPreviewFailed(true)}
                        />
                      ) : isImage ? (
                        <img
                          className="vs01-doc-preview-img"
                          src={previewUrl}
                          alt="Selected document preview"
                          onError={() => setPreviewFailed(true)}
                        />
                      ) : (
                        <div className="vs01-doc-preview-fallback">
                          <p className="vs01-doc-preview-fallback-text">
                            Preview not available here — open below if needed.
                          </p>
                          <a
                            className="vs01-inline-link"
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open in new tab
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {hasStoredDoc && !showQuickEntryChoices ? (
              <p className="vs01-doc-finalized-line vs01-doc-finalized-line--plain" role="status">
                Document saved. Ready for details.
                <span className="vs01-sr-only">
                  {" "}
                  Document ID {documentId}. Content SHA-256 {contentSha256}.
                </span>
              </p>
            ) : hasStoredDoc && showQuickEntryChoices ? (
              <p className="vs01-doc-saved-inline" role="status" aria-live="polite">
                Saved — moving you forward…
              </p>
            ) : null}

            <div className="vs01-doc-step-actions vs01-doc-step-actions--primary-block">
              {hasFile && !hasStoredDoc ? (
                <>
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--primary"
                    disabled={busyFinalize || !loadingIdle}
                    onClick={() => void handleFinalize()}
                  >
                    {busyFinalize
                      ? showQuickEntryChoices
                        ? "Saving…"
                        : "Finalizing…"
                      : showQuickEntryChoices
                        ? "Save & continue"
                        : "Finalize document"}
                  </button>
                  <p className="vs01-doc-cta-caption" aria-live="polite">
                    {showQuickEntryChoices
                      ? "Secures your file — still nothing sent."
                      : "Finalize to record the document on the server and continue."}
                  </p>
                </>
              ) : null}
              {hasStoredDoc && !showQuickEntryChoices ? (
                <button
                  type="button"
                  className="vs01-btn vs01-btn--primary"
                  disabled={!canContinue}
                  onClick={() => onContinue?.()}
                >
                  Continue to details
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
