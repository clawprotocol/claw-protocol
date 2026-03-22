import { useCallback, useState } from "react";
import { finalizeDocument } from "./vs01Api";
import { CounterpartyList } from "./CounterpartyList";
import type { Vs01Counterparty, Vs01LoadingState } from "./types";

export type StepCreateAgreementProps = {
  agreementTitle: string;
  onAgreementTitleChange: (v: string) => void;
  creatorName: string;
  onCreatorNameChange: (v: string) => void;
  creatorEmail: string;
  onCreatorEmailChange: (v: string) => void;
  counterparties: Vs01Counterparty[];
  onCounterpartiesChange: (v: Vs01Counterparty[]) => void;
  senderMessage: string;
  onSenderMessageChange: (v: string) => void;
  loading: Vs01LoadingState;
  setLoading: (next: Vs01LoadingState) => void;
  documentId: string | null;
  contentSha256: string | null;
  onFinalized: (payload: { documentId: string; contentSha256: string }) => void;
  onError: (message: string | null) => void;
  onContinue?: () => void;
};

const STEP_ID = "create" as const;

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

function createAgreementStepValid(
  title: string,
  creatorName: string,
  counterparties: Vs01Counterparty[],
  docReady: boolean
): boolean {
  if (!docReady) return false;
  if (!title.trim() || !creatorName.trim()) return false;
  const okCp = counterparties.some((c) => c.name.trim().length > 0);
  return okCp;
}

/**
 * Step 1 — Create agreement context + finalize document (POST /v1/documents).
 */
export function StepCreateAgreement({
  agreementTitle,
  onAgreementTitleChange,
  creatorName,
  onCreatorNameChange,
  creatorEmail,
  onCreatorEmailChange,
  counterparties,
  onCounterpartiesChange,
  senderMessage,
  onSenderMessageChange,
  loading,
  setLoading,
  documentId,
  contentSha256,
  onFinalized,
  onError,
  onContinue,
}: StepCreateAgreementProps) {
  const busy = loading === "finalize";
  const [file, setFile] = useState<File | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);

  const onPickFile = (f: File | null) => {
    setFile(f);
    setFileLabel(f ? f.name : null);
    onError(null);
    onFinalized({ documentId: "", contentSha256: "" });
  };

  const handleFinalize = useCallback(async () => {
    if (!file) {
      onError("Choose a file to finalize.");
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

  const docReady = Boolean(documentId && contentSha256);
  const formOk = createAgreementStepValid(agreementTitle, creatorName, counterparties, docReady);
  const canContinue = formOk;

  return (
    <section data-vs01-step={STEP_ID} aria-labelledby="vs01-step-create-title">
      <h2 id="vs01-step-create-title" className="vs01-card-title">
        Create agreement
      </h2>
      <p className="vs01-card-help">
        Name what you’re signing, who’s involved, then upload the final PDF or file. Nothing is sent to
        counterparties until you’re ready — that step comes after you sign.
      </p>

      <div className="vs01-stack">
        <div className="vs01-field">
          <label className="vs01-field-label" htmlFor="vs01-agreement-title">
            Agreement title
          </label>
          <input
            id="vs01-agreement-title"
            className="vs01-input"
            value={agreementTitle}
            disabled={busy}
            placeholder="e.g. Pilot services agreement"
            onChange={(ev) => onAgreementTitleChange(ev.target.value)}
          />
        </div>
        <div className="vs01-field">
          <label className="vs01-field-label" htmlFor="vs01-creator-name">
            Your name
          </label>
          <input
            id="vs01-creator-name"
            className="vs01-input"
            value={creatorName}
            disabled={busy}
            placeholder="Alex Rivera"
            autoComplete="name"
            onChange={(ev) => onCreatorNameChange(ev.target.value)}
          />
        </div>
        <div className="vs01-field">
          <label className="vs01-field-label" htmlFor="vs01-creator-email">
            Your email
          </label>
          <input
            id="vs01-creator-email"
            className="vs01-input"
            type="email"
            value={creatorEmail}
            disabled={busy}
            placeholder="alex@…"
            autoComplete="email"
            onChange={(ev) => onCreatorEmailChange(ev.target.value)}
          />
        </div>

        <CounterpartyList
          counterparties={counterparties}
          onChange={onCounterpartiesChange}
          disabled={busy}
        />

        <div className="vs01-field">
          <label className="vs01-field-label" htmlFor="vs01-sender-msg">
            Note to counterparties (optional)
          </label>
          <textarea
            id="vs01-sender-msg"
            className="vs01-input"
            rows={3}
            value={senderMessage}
            disabled={busy}
            placeholder="Short context they’ll see when it’s their turn…"
            onChange={(ev) => onSenderMessageChange(ev.target.value)}
          />
        </div>
      </div>

      <div className="vs01-field" style={{ marginTop: "1rem" }}>
        <span className="vs01-field-label">Document</span>
        <p className="vs01-card-help" style={{ margin: "0 0 0.5rem" }}>
          Upload from files, or use camera / scan on supported phones.
        </p>
        <div className="vs01-file-row">
          <label className="vs01-file-btn-wrap">
            <span className="vs01-file-btn">
              <input
                type="file"
                disabled={busy}
                onChange={(ev) => onPickFile(ev.target.files?.[0] ?? null)}
              />
              Choose file
            </span>
          </label>
          <label className="vs01-file-btn-wrap">
            <span className="vs01-file-btn">
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                disabled={busy}
                onChange={(ev) => onPickFile(ev.target.files?.[0] ?? null)}
              />
              Camera / scan
            </span>
          </label>
        </div>
        {fileLabel ? (
          <p className="vs01-card-help" style={{ margin: "0.5rem 0 0" }}>
            Selected: <strong>{fileLabel}</strong>
          </p>
        ) : null}
      </div>

      <div className="vs01-hash-panel" style={{ marginTop: "0.75rem" }} aria-label="Finalized document">
        <div>
          <strong>document_id</strong> — {documentId || "(finalize to generate)"}
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
        {busy ? "Finalizing…" : "Finalize for signing"}
      </button>

      {!canContinue && docReady ? (
        <p className="vs01-card-help" style={{ marginTop: "0.75rem" }}>
          Add a title, your name, and at least one counterparty name to continue.
        </p>
      ) : null}

      <button
        type="button"
        className="vs01-btn vs01-btn--primary"
        disabled={busy || !canContinue}
        onClick={() => onContinue?.()}
      >
        Continue to signature prep
      </button>
    </section>
  );
}
