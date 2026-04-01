import { useCallback, useState } from "react";
import { completeSignSession, createSignSession } from "./vs01Api";
import type { Vs01LoadingState, Vs01SenderSignatureRef } from "./types";
import type { PlacedSigningField } from "./signingFields";

const INTENT_OPTIONS = ["agree_and_sign"] as const;

export type StepSignProps = {
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
    senderPlacedFields: PlacedSigningField[];
    senderSignatureRef: Vs01SenderSignatureRef | null;
  }) => void;
  onBack?: () => void;
  onContinue?: () => void;
};

const STEP_ID = "sign" as const;

function parseNum(s: string, fallback: number): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Step 1 — create sign session + complete sign (VS01 API).
 */
export function StepSign({
  documentId,
  contentSha256,
  receiptId,
  loading,
  setLoading,
  onError,
  onSigned,
  onBack,
  onContinue,
}: StepSignProps) {
  const busySession = loading === "session";
  const busyComplete = loading === "complete";
  const busy = busySession || busyComplete;

  const [signerRef, setSignerRef] = useState("pilot-user-1");
  const [intent, setIntent] = useState<string>(INTENT_OPTIONS[0]);
  const [pageIndex, setPageIndex] = useState("0");
  const [x, setX] = useState("0.1");
  const [y, setY] = useState("0.1");
  const [w, setW] = useState("0.2");
  const [h, setH] = useState("0.05");

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
        senderPlacedFields: [],
        senderSignatureRef: null,
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

  return (
    <section data-vs01-step={STEP_ID} aria-labelledby="vs01-step-sign-title">
      <h2 id="vs01-step-sign-title" className="vs01-card-title">
        Sign
      </h2>
      <p className="vs01-card-help">
        Create a sign session, then complete with signer reference, intent, and one{" "}
        <code>field_manifest</code> rectangle.
      </p>

      <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1rem" }}>
        <label className="vs01-card-help" style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          signer_ref
          <input
            className="vs01-placeholder-box"
            style={{ borderStyle: "solid", font: "inherit", padding: "0.5rem 0.65rem" }}
            value={signerRef}
            disabled={busy}
            onChange={(ev) => setSignerRef(ev.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="vs01-card-help" style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          intent
          <select
            className="vs01-placeholder-box"
            style={{ borderStyle: "solid", font: "inherit", padding: "0.5rem 0.65rem" }}
            value={intent}
            disabled={busy}
            onChange={(ev) => setIntent(ev.target.value)}
          >
            {INTENT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <fieldset
          style={{
            border: "1px solid var(--vs01-color-border-subtle)",
            borderRadius: "var(--vs01-radius-control)",
            padding: "0.75rem",
            margin: 0,
          }}
        >
          <legend className="vs01-card-help" style={{ padding: "0 0.25rem" }}>
            field_manifest (one rectangle)
          </legend>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.5rem",
            }}
          >
            <label className="vs01-card-help" style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              page_index
              <input
                type="text"
                inputMode="numeric"
                value={pageIndex}
                disabled={busy}
                onChange={(ev) => setPageIndex(ev.target.value)}
              />
            </label>
            <label className="vs01-card-help" style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              x
              <input type="text" inputMode="decimal" value={x} disabled={busy} onChange={(ev) => setX(ev.target.value)} />
            </label>
            <label className="vs01-card-help" style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              y
              <input type="text" inputMode="decimal" value={y} disabled={busy} onChange={(ev) => setY(ev.target.value)} />
            </label>
            <label className="vs01-card-help" style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              w
              <input type="text" inputMode="decimal" value={w} disabled={busy} onChange={(ev) => setW(ev.target.value)} />
            </label>
            <label className="vs01-card-help" style={{ display: "flex", flexDirection: "column", gap: "0.2rem", gridColumn: "1 / -1" }}>
              h
              <input type="text" inputMode="decimal" value={h} disabled={busy} onChange={(ev) => setH(ev.target.value)} />
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
        {busySession ? "Creating session…" : busyComplete ? "Signing…" : "Create session & sign"}
      </button>
      <button
        type="button"
        className="vs01-btn vs01-btn--primary"
        disabled={busy || !canContinueToDone}
        onClick={() => onContinue?.()}
      >
        Continue to done
      </button>
    </section>
  );
}
