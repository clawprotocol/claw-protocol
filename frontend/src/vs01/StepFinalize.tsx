import { useCallback, useState } from "react";
import { finalizeDocument } from "./vs01Api";
import type { Vs01LoadingState } from "./types";

export type StepFinalizeProps = {
  loading: Vs01LoadingState;
  setLoading: (next: Vs01LoadingState) => void;
  documentId: string | null;
  contentSha256: string | null;
  onFinalized: (payload: { documentId: string; contentSha256: string }) => void;
  onError: (message: string | null) => void;
  onContinue?: () => void;
};

const STEP_ID = "finalize" as const;

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

/**
 * Step 0 — upload / finalize document via POST /v1/documents.
 */
export function StepFinalize({
  loading,
  setLoading,
  documentId,
  contentSha256,
  onFinalized,
  onError,
  onContinue,
}: StepFinalizeProps) {
  const busy = loading === "finalize";
  const [file, setFile] = useState<File | null>(null);

  const handleFinalize = useCallback(async () => {
    if (!file) {
      onError("Choose a file first.");
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
      onFinalized({ documentId: did, contentSha256: hash });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("idle");
    }
  }, [file, onError, onFinalized, setLoading]);

  const canContinue = Boolean(documentId && contentSha256);

  return (
    <section data-vs01-step={STEP_ID} aria-labelledby="vs01-step-finalize-title">
      <h2 id="vs01-step-finalize-title" className="vs01-card-title">
        Finalize document
      </h2>
      <p className="vs01-card-help">
        Upload the final PDF or document bytes you want bound to a receipt. Calls{" "}
        <code>POST /v1/documents</code>.
      </p>

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="vs01-finalize-file" className="vs01-card-help" style={{ display: "block", marginBottom: "0.35rem" }}>
          File
        </label>
        <input
          id="vs01-finalize-file"
          type="file"
          disabled={busy}
          onChange={(ev) => {
            const f = ev.target.files?.[0] ?? null;
            setFile(f);
            onError(null);
            onFinalized({ documentId: "", contentSha256: "" });
          }}
        />
      </div>

      <div className="vs01-hash-panel" style={{ marginTop: "0.5rem" }} aria-label="Document hashes">
        <div>
          <strong>document_id</strong> — {documentId || "(pending)"}
        </div>
        <div>
          <strong>content_sha256</strong> — {contentSha256 || "(pending)"}
        </div>
      </div>

      <button
        type="button"
        className="vs01-btn vs01-btn--primary"
        style={{ marginTop: "0.75rem" }}
        disabled={busy || !file}
        onClick={() => void handleFinalize()}
      >
        {busy ? "Finalizing…" : "Finalize document"}
      </button>

      <button
        type="button"
        className="vs01-btn vs01-btn--primary"
        disabled={busy || !canContinue}
        onClick={() => onContinue?.()}
      >
        Continue to sign
      </button>
    </section>
  );
}
