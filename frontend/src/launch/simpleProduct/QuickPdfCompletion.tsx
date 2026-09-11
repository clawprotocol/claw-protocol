import { useCallback, useEffect, useRef, useState } from "react";
import type { QuickPdfBinding } from "./quickPdfUpload";
import {
  OWNER_ROLE_ID,
  RECIPIENT_ROLE_ID,
  createQuickPdfEnvelope,
  defaultOwnerRecipientFields,
  loadQuickPdfEnvelope,
  loadQuickPdfReceipt,
  ownerCompleteQuickPdf,
  prepareQuickPdfEnvelope,
  saveQuickPdfFields,
  tokenHiddenFromText,
  type QuickCompletion,
  type QuickEnvelope,
  type QuickParty,
} from "./quickPdfEnvelope";

type Step = "parties" | "place" | "deliver" | "receipt";

export function QuickPdfCompletion(props: { binding: QuickPdfBinding }) {
  const { binding } = props;
  const [step, setStep] = useState<Step>("parties");
  const [owner, setOwner] = useState<QuickParty>({ name: "", email: "" });
  const [recipient, setRecipient] = useState<QuickParty>({ name: "", email: "" });
  const [envelope, setEnvelope] = useState<QuickEnvelope | null>(null);
  const [completion, setCompletion] = useState<QuickCompletion | null>(null);
  const [openPath, setOpenPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);
  const preparedOnce = useRef(false);

  useEffect(() => {
    let cancel = false;
    void loadQuickPdfEnvelope(binding.documentId).then((result) => {
      if (cancel || !result.ok) return;
      if (!result.envelope) return;
      setEnvelope(result.envelope);
      setOwner({ name: result.envelope.owner_name, email: result.envelope.owner_email });
      setRecipient({ name: result.envelope.recipient_name, email: result.envelope.recipient_email });
      if (result.completion) setCompletion(result.completion);
      if (result.completion?.fully_executed) setStep("receipt");
      else if (result.envelope.locked) setStep("deliver");
      else if ((result.envelope.fields || []).length >= 2) setStep("place");
    });
    return () => {
      cancel = true;
    };
  }, [binding.documentId]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }, []);

  const onParties = () =>
    void run(async () => {
      const result = await createQuickPdfEnvelope(binding, owner, recipient);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEnvelope(result.envelope);
      setStep("place");
    });

  const onPlace = () =>
    void run(async () => {
      const fields = defaultOwnerRecipientFields();
      const saved = await saveQuickPdfFields(binding, fields, 1);
      if (!saved.ok) {
        setError(saved.message);
        return;
      }
      setEnvelope(saved.envelope);
      setStep("deliver");
    });

  const onPrepare = () =>
    void run(async () => {
      const result = await prepareQuickPdfEnvelope(binding);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      preparedOnce.current = true;
      setEnvelope(result.envelope);
      setOpenPath(result.recipientOpenPath || "");
      const signed = await ownerCompleteQuickPdf(binding);
      if (signed.ok) {
        setEnvelope(signed.envelope);
        setCompletion(signed.completion || null);
      }
    });

  const onCopy = () =>
    void run(async () => {
      if (!openPath) return;
      try {
        await navigator.clipboard.writeText(`${window.location.origin}${openPath}`);
      } catch {
        /* clipboard may be unavailable in some fixtures */
      }
      await ownerApiMarkCopied(binding);
    });

  const onRefreshReceipt = () =>
    void run(async () => {
      const result = await loadQuickPdfReceipt(binding.documentId);
      if (!result.ok) {
        setError(result.message);
        setCompletion(null);
        return;
      }
      setEnvelope(result.envelope);
      setCompletion(result.completion || null);
      setStep("receipt");
    });

  return (
    <div className="mt-4 flex min-w-0 flex-col gap-3" data-testid="quick-pdf-completion">
      <p className="text-xs text-slate-400">
        This is your uploaded final paper. LawDog did not draft it and does not review whether it is legally or
        commercially sufficient.
      </p>

      {step === "parties" ? (
        <form
          className="flex min-w-0 flex-col gap-3"
          data-testid="quick-pdf-parties"
          onSubmit={(e) => {
            e.preventDefault();
            onParties();
          }}
        >
          <label className="text-sm text-slate-300">
            Your name
            <input
              data-testid="quick-pdf-owner-name"
              className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={owner.name}
              onChange={(e) => setOwner((p) => ({ ...p, name: e.target.value }))}
            />
          </label>
          <label className="text-sm text-slate-300">
            Your email
            <input
              data-testid="quick-pdf-owner-email"
              className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={owner.email}
              onChange={(e) => setOwner((p) => ({ ...p, email: e.target.value }))}
            />
          </label>
          <label className="text-sm text-slate-300">
            Recipient name
            <input
              data-testid="quick-pdf-recipient-name"
              className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={recipient.name}
              onChange={(e) => setRecipient((p) => ({ ...p, name: e.target.value }))}
            />
          </label>
          <label className="text-sm text-slate-300">
            Recipient email
            <input
              data-testid="quick-pdf-recipient-email"
              className="mt-1 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={recipient.email}
              onChange={(e) => setRecipient((p) => ({ ...p, email: e.target.value }))}
            />
          </label>
          <button type="submit" className="vs01-btn vs01-btn--primary min-h-11" data-testid="quick-pdf-parties-save" disabled={busy}>
            {busy ? "Saving…" : "Save signers & continue"}
          </button>
        </form>
      ) : null}

      {step === "place" ? (
        <div data-testid="quick-pdf-place" className="flex min-w-0 flex-col gap-3">
          <p className="text-sm text-slate-300">
            Place one signature for you ({OWNER_ROLE_ID}) and one for the recipient ({RECIPIENT_ROLE_ID}) on page 1.
          </p>
          <div className="relative min-h-48 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900" data-testid="quick-pdf-page">
            <div className="absolute left-[12%] top-[72%] h-[10%] w-[32%] rounded border border-emerald-400/80 bg-emerald-500/20 text-center text-[10px] text-emerald-100">
              Your signature
            </div>
            <div className="absolute left-[56%] top-[72%] h-[10%] w-[32%] rounded border border-sky-400/80 bg-sky-500/20 text-center text-[10px] text-sky-100">
              Recipient signature
            </div>
          </div>
          <button type="button" className="vs01-btn vs01-btn--primary min-h-11" data-testid="quick-pdf-place-save" disabled={busy} onClick={onPlace}>
            {busy ? "Saving…" : "Save placements & continue"}
          </button>
        </div>
      ) : null}

      {step === "deliver" ? (
        <div data-testid="quick-pdf-deliver" className="flex min-w-0 flex-col gap-3">
          {completion?.owner_signed && !completion.fully_executed ? (
            <p className="text-sm text-amber-100" data-testid="quick-pdf-owner-only-receipt">
              Your signature is recorded. This is not a fully executed agreement until the recipient signs.
            </p>
          ) : null}
          <p className="text-sm text-slate-300">
            Email delivery is not available here. Copy the recipient link and send it yourself. The token is not shown
            on this page.
          </p>
          <button
            type="button"
            className="vs01-btn vs01-btn--primary min-h-11"
            data-testid="quick-pdf-prepare"
            disabled={busy}
            onClick={onPrepare}
          >
            {busy ? "Preparing…" : preparedOnce.current ? "Recipient link is ready" : "Prepare recipient link"}
          </button>
          {openPath ? (
            <button type="button" className="vs01-btn vs01-btn--secondary min-h-11" data-testid="quick-pdf-copy-link" onClick={onCopy}>
              Copy recipient link
            </button>
          ) : null}
          <p className="text-xs text-slate-500" data-testid="quick-pdf-delivery-state">
            {openPath ? "Link prepared. Email unavailable." : "Link not prepared yet."}
          </p>
          {envelope?.content_sha256 ? (
            <p className="break-all text-xs text-slate-500" data-testid="quick-pdf-locked-hash">
              Locked PDF {envelope.content_sha256}
            </p>
          ) : null}
          <button type="button" className="text-sm text-slate-400 underline" data-testid="quick-pdf-goto-receipt" onClick={onRefreshReceipt}>
            Check signing status
          </button>
        </div>
      ) : null}

      {step === "receipt" ? (
        <div data-testid="quick-pdf-receipt" className="flex min-w-0 flex-col gap-3">
          {completion?.fully_executed ? (
            <div data-testid="quick-pdf-fully-executed">
              <p className="font-semibold text-emerald-100">Fully executed</p>
              <p className="text-sm text-slate-300">Every required signer has completed. Hash {envelope?.content_sha256}</p>
              <button
                type="button"
                className="vs01-btn vs01-btn--primary mt-3 min-h-11"
                data-testid="quick-pdf-bundle"
                disabled={busy}
                onClick={() => void downloadQuickPdfBundle(binding.documentId)}
              >
                Download verification bundle
              </button>
            </div>
          ) : (
            <div data-testid="quick-pdf-pending-receipt">
              <p className="font-semibold text-amber-100">Waiting for required signers</p>
              <p className="text-sm text-slate-300">
                {completion?.owner_signed ? "You have signed. The recipient has not." : "Signatures are still outstanding."}
              </p>
            </div>
          )}
          <button type="button" className="vs01-btn vs01-btn--secondary min-h-11" data-testid="quick-pdf-receipt-refresh" disabled={busy} onClick={onRefreshReceipt}>
            Refresh receipt
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-rose-300" data-testid="quick-pdf-completion-error" role="alert">
          {error}
        </p>
      ) : null}
      <span className="hidden" data-testid="quick-pdf-token-guard" data-ok={openPath ? String(tokenHiddenFromText(document.body?.innerText || "", openPath)) : "1"} />
    </div>
  );
}

async function downloadQuickPdfBundle(documentId: string): Promise<void> {
  const { ownerApiFetch } = await import("../../lib/ownerApiClient");
  const res = await ownerApiFetch(
    `/api/agreements/quick-pdf-envelope/bundle?document_id=${encodeURIComponent(documentId)}`,
    { headers: { Accept: "application/zip" } },
  ).catch(() => null);
  if (!res?.ok) return;
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = "quick-pdf-verification.zip";
  a.click();
  URL.revokeObjectURL(href);
}

async function ownerApiMarkCopied(binding: QuickPdfBinding): Promise<void> {
  const { ownerApiFetch } = await import("../../lib/ownerApiClient");
  await ownerApiFetch("/api/agreements/quick-pdf-envelope/copy-link", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      document_id: binding.documentId,
      content_sha256: binding.contentSha256,
      size_bytes: binding.sizeBytes,
      content_type: binding.contentType,
    }),
  }).catch(() => undefined);
}
