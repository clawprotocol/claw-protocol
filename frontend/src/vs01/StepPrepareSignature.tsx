import { useCallback, useEffect, useState } from "react";
import { completeSignSession, createSignSession } from "./vs01Api";
import type { Vs01Counterparty, Vs01LoadingState } from "./types";

const INTENT_OPTIONS = ["agree_and_sign"] as const;

export type StepPrepareSignatureProps = {
  defaultSignerRef: string;
  documentId: string | null;
  contentSha256: string | null;
  receiptId: string | null;
  loading: Vs01LoadingState;
  setLoading: (next: Vs01LoadingState) => void;
  onError: (message: string | null) => void;
  onSigned: (payload: {
    receiptId: string;
    receiptHashSha256: string;
    receipt: unknown;
  }) => void;
  counterparties: Vs01Counterparty[];
  senderMessage: string;
  onBack?: () => void;
  onContinue?: () => void;
};

const STEP_ID = "prepare-sign" as const;

function parseNum(s: string, fallback: number): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Step 2 — Signature prep: same VS01 sign session + complete; human summary of who’s next.
 */
export function StepPrepareSignature({
  defaultSignerRef,
  documentId,
  contentSha256,
  receiptId,
  loading,
  setLoading,
  onError,
  onSigned,
  counterparties,
  senderMessage,
  onBack,
  onContinue,
}: StepPrepareSignatureProps) {
  const busySession = loading === "session";
  const busyComplete = loading === "complete";
  const busy = busySession || busyComplete;

  const [signerRef, setSignerRef] = useState(defaultSignerRef);
  const [intent] = useState<string>(INTENT_OPTIONS[0]);
  const [pageIndex, setPageIndex] = useState("0");
  const [x, setX] = useState("0.1");
  const [y, setY] = useState("0.1");
  const [w, setW] = useState("0.2");
  const [h, setH] = useState("0.05");

  useEffect(() => {
    setSignerRef(defaultSignerRef || "signer");
  }, [defaultSignerRef]);

  const handleSign = useCallback(async () => {
    if (!documentId?.trim() || !contentSha256?.trim()) {
      onError("Finalize a document first (missing document id or content hash).");
      return;
    }
    onError(null);
    setLoading("session");
    try {
      const sessionRes = await createSignSession(documentId.trim(), contentSha256.trim());
      const sid =
        (typeof sessionRes.session === "object" &&
          sessionRes.session !== null &&
          "session_id" in sessionRes.session &&
          typeof (sessionRes.session as { session_id: unknown }).session_id === "string" &&
          (sessionRes.session as { session_id: string }).session_id.trim()) ||
        (typeof sessionRes.session_id === "string" ? sessionRes.session_id.trim() : "");
      if (!sid) {
        throw new Error("Response missing session_id");
      }

      setLoading("complete");
      const field_manifest = [
        {
          field_id: "sig1",
          page_index: parseNum(pageIndex, 0),
          x: parseNum(x, 0.1),
          y: parseNum(y, 0.1),
          w: parseNum(w, 0.2),
          h: parseNum(h, 0.05),
        },
      ];
      const completeRes = await completeSignSession(sid, {
        signer_ref: signerRef.trim() || "signer",
        intent: intent || "agree_and_sign",
        field_manifest,
      });

      const rid =
        typeof completeRes.receipt_id === "string" ? completeRes.receipt_id.trim() : "";
      const rhash =
        typeof completeRes.receipt_hash_sha256 === "string"
          ? completeRes.receipt_hash_sha256.trim()
          : "";
      if (!rid || !rhash) {
        throw new Error("Response missing receipt_id or receipt_hash_sha256");
      }
      onSigned({
        receiptId: rid,
        receiptHashSha256: rhash,
        receipt: completeRes.receipt ?? null,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("idle");
    }
  }, [
    contentSha256,
    documentId,
    h,
    intent,
    onError,
    onSigned,
    pageIndex,
    setLoading,
    signerRef,
    w,
    x,
    y,
  ]);

  const canContinueToDone = Boolean(receiptId);
  const named = counterparties.filter((c) => c.name.trim());

  return (
    <section data-vs01-step={STEP_ID} aria-labelledby="vs01-step-prepare-title">
      <h2 id="vs01-step-prepare-title" className="vs01-card-title">
        Signature prep
      </h2>
      <p className="vs01-card-help">
        You’re signing as the sender. Each signer still gets their own receipt on the same document — the
        proof spine stays atomic per signature.
      </p>

      <div className="vs01-summary-panel" style={{ marginBottom: "1rem" }}>
        <strong>After you sign</strong>, you can hand off to:{" "}
        {named.length ? (
          <span>{named.map((c) => c.name.trim()).join(" · ")}</span>
        ) : (
          <span>your counterparties</span>
        )}
        {senderMessage.trim() ? (
          <>
            <br />
            <span style={{ marginTop: "0.35rem", display: "inline-block" }}>
              Your note: “{senderMessage.trim()}”
            </span>
          </>
        ) : null}
      </div>

      <div className="vs01-stack">
        <div className="vs01-field">
          <label className="vs01-field-label" htmlFor="vs01-signer-ref">
            Signer reference (on the receipt)
          </label>
          <input
            id="vs01-signer-ref"
            className="vs01-input"
            value={signerRef}
            disabled={busy}
            onChange={(ev) => setSignerRef(ev.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="vs01-field">
          <span className="vs01-field-label">Intent</span>
          <select
            className="vs01-input"
            value={intent}
            disabled
            aria-readonly
          >
            {INTENT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <fieldset
          style={{
            border: "1px solid var(--vs01-color-border-subtle)",
            borderRadius: "var(--vs01-radius-control)",
            padding: "0.75rem",
            margin: 0,
          }}
        >
          <legend className="vs01-card-help" style={{ padding: "0 0.25rem" }}>
            Signature placement (one box)
          </legend>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.5rem",
            }}
          >
            <label className="vs01-field">
              <span className="vs01-card-help">Page</span>
              <input
                className="vs01-input"
                type="text"
                inputMode="numeric"
                value={pageIndex}
                disabled={busy}
                onChange={(ev) => setPageIndex(ev.target.value)}
              />
            </label>
            <label className="vs01-field">
              <span className="vs01-card-help">X</span>
              <input
                className="vs01-input"
                type="text"
                inputMode="decimal"
                value={x}
                disabled={busy}
                onChange={(ev) => setX(ev.target.value)}
              />
            </label>
            <label className="vs01-field">
              <span className="vs01-card-help">Y</span>
              <input
                className="vs01-input"
                type="text"
                inputMode="decimal"
                value={y}
                disabled={busy}
                onChange={(ev) => setY(ev.target.value)}
              />
            </label>
            <label className="vs01-field">
              <span className="vs01-card-help">W</span>
              <input
                className="vs01-input"
                type="text"
                inputMode="decimal"
                value={w}
                disabled={busy}
                onChange={(ev) => setW(ev.target.value)}
              />
            </label>
            <label className="vs01-field" style={{ gridColumn: "1 / -1" }}>
              <span className="vs01-card-help">H</span>
              <input
                className="vs01-input"
                type="text"
                inputMode="decimal"
                value={h}
                disabled={busy}
                onChange={(ev) => setH(ev.target.value)}
              />
            </label>
          </div>
        </fieldset>
      </div>

      <button
        type="button"
        className="vs01-btn vs01-btn--secondary"
        disabled={busy}
        onClick={() => onBack?.()}
      >
        Back
      </button>
      <button
        type="button"
        className="vs01-btn vs01-btn--primary"
        style={{ marginTop: "0.75rem" }}
        disabled={busy}
        onClick={() => void handleSign()}
      >
        {busySession ? "Creating session…" : busyComplete ? "Signing…" : "Sign & issue receipt"}
      </button>
      <button
        type="button"
        className="vs01-btn vs01-btn--primary"
        disabled={busy || !canContinueToDone}
        onClick={() => onContinue?.()}
      >
        Continue to complete & handoff
      </button>
    </section>
  );
}
