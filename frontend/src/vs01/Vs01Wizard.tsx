import { useCallback, useEffect, useMemo, useState } from "react";
import "./vs01.css";
import { StepAgreementDetails } from "./StepAgreementDetails";
import { RecipientSigningView } from "./RecipientSigningView";
import { StepCompleteAndSend } from "./StepCompleteAndSend";
import { StepDocument } from "./StepDocument";
import { StepDone } from "./StepDone";
import { StepPrepareSignature } from "./StepPrepareSignature";
import type { PlacedSigningField } from "./signingFields";
import { getVs01UrlBootstrap } from "./vs01UrlBootstrap";
import { getReceipt } from "./vs01Api";
import type {
  Vs01Counterparty,
  Vs01DocumentIntakeSource,
  Vs01FinalizeDocumentPayload,
  Vs01LoadingState,
  Vs01RecipientPlacedField,
  Vs01SenderSignatureRef,
  Vs01Step,
} from "./types";

function stripExtension(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  if (i <= 0) return fileName;
  return fileName.slice(0, i);
}

function defaultAgreementTitle(meta: { fileName: string; source: Vs01DocumentIntakeSource }): string {
  if (meta.source === "camera") {
    const d = new Date();
    return `Scanned Agreement ${d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
  }
  const base = stripExtension(meta.fileName).trim();
  return base || meta.fileName;
}

const STEPS: { id: Vs01Step; label: string }[] = [
  { id: 0, label: "Document" },
  { id: 1, label: "Details" },
  { id: 2, label: "Signing" },
  { id: 3, label: "Recipient fields" },
  { id: 4, label: "Receipt" },
];

function initialCounterparties(): Vs01Counterparty[] {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `cp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return [{ id, name: "", email: "", phone: "" }];
}

/** Parsed once at module load; URL search cleared inside getVs01UrlBootstrap (StrictMode-safe memo). */
const VS01_URL_BOOT = typeof window !== "undefined" ? getVs01UrlBootstrap() : null;

const RECIPIENT_SIGNER_DEEP_LINK = VS01_URL_BOOT?.recipientSignerMode === true;
const RECIPIENT_LOCKED_CP_ID = VS01_URL_BOOT?.recipientLockedCounterpartyId ?? null;

const INITIAL_RECIPIENT_FIELDS: Vs01RecipientPlacedField[] =
  RECIPIENT_SIGNER_DEEP_LINK && VS01_URL_BOOT?.recipientHydratedFields
    ? VS01_URL_BOOT.recipientHydratedFields
    : [];

export type Vs01WizardProps = {
  /** Reserved for future controlled mode; shell ignores if unset. */
  initialStep?: Vs01Step;
};

/**
 * Envelope flow: document → details → sign → handoff → receipt.
 * Owns step index, finalize identifiers, counterparties, loading, and errors.
 */
export function Vs01Wizard({ initialStep = 0 }: Vs01WizardProps) {
  const [step, setStep] = useState<Vs01Step>(() => VS01_URL_BOOT?.step ?? initialStep);
  /** Furthest step visited — gates Receipt until assign step satisfied. */
  const [furthestStep, setFurthestStep] = useState<Vs01Step>(() => VS01_URL_BOOT?.furthestStep ?? initialStep);
  const [recipientPlacedFields, setRecipientPlacedFields] = useState<Vs01RecipientPlacedField[]>(
    () => INITIAL_RECIPIENT_FIELDS
  );
  const [recipientSigningFinished, setRecipientSigningFinished] = useState(false);
  const [senderPlacedFields, setSenderPlacedFields] = useState<PlacedSigningField[]>([]);
  const [senderSignatureRef, setSenderSignatureRef] = useState<Vs01SenderSignatureRef | null>(null);
  const [loading, setLoading] = useState<Vs01LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);

  const [agreementTitle, setAgreementTitle] = useState("");
  /** Once true, auto title from document must never run again this session. */
  const [agreementTitleUserEdited, setAgreementTitleUserEdited] = useState(false);
  const [creatorName, setCreatorName] = useState("");
  const [creatorEmail, setCreatorEmail] = useState("");
  const [senderMessage, setSenderMessage] = useState("");
  const [counterparties, setCounterparties] = useState<Vs01Counterparty[]>(
    () => VS01_URL_BOOT?.counterparties ?? initialCounterparties()
  );

  const [documentId, setDocumentId] = useState<string | null>(() => VS01_URL_BOOT?.documentId ?? null);
  const [contentSha256, setContentSha256] = useState<string | null>(null);
  /** Set when document finalize succeeds — drives default agreement title. */
  const [documentMeta, setDocumentMeta] = useState<{
    fileName: string;
    source: Vs01DocumentIntakeSource;
  } | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(() => VS01_URL_BOOT?.receiptId ?? null);
  const [receiptHashSha256, setReceiptHashSha256] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<unknown>(null);

  useEffect(() => {
    if (!VS01_URL_BOOT) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await getReceipt(VS01_URL_BOOT.receiptId);
        if (cancelled) return;
        const raw = data.receipt !== undefined ? data.receipt : data;
        let hash: string | null = null;
        if (typeof data.receipt_hash_sha256 === "string" && data.receipt_hash_sha256.trim()) {
          hash = data.receipt_hash_sha256.trim();
        } else if (raw && typeof raw === "object" && raw !== null && "receipt_hash_sha256" in raw) {
          const h = (raw as { receipt_hash_sha256?: unknown }).receipt_hash_sha256;
          if (typeof h === "string" && h.trim()) hash = h.trim();
        }
        setReceipt(raw);
        if (hash) setReceiptHashSha256(hash);
      } catch {
        /* receipt optional for placement; hash/id already from URL where applicable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const defaultSignerRef =
    [creatorName.trim(), creatorEmail.trim()].filter(Boolean).join(" · ") || "signer";

  const detailsOk = useMemo(
    () =>
      agreementTitle.trim().length > 0 &&
      creatorName.trim().length > 0 &&
      counterparties.some((c) => c.name.trim().length > 0),
    [agreementTitle, creatorName, counterparties]
  );

  const docFinalized = Boolean(documentId && contentSha256);

  const canReachStep = useCallback(
    (id: Vs01Step): boolean => {
      if (id === 0) return true;
      if (id === 1) return docFinalized;
      if (id === 2) return docFinalized && detailsOk;
      if (id === 3) return !!receiptId;
      if (id === 4) {
        return (
          !!receiptId &&
          furthestStep >= 3 &&
          recipientPlacedFields.length > 0
        );
      }
      return false;
    },
    [docFinalized, detailsOk, receiptId, furthestStep, recipientPlacedFields.length]
  );

  const goToStep = useCallback((target: Vs01Step) => {
    setStep(target);
    setFurthestStep((prev) => (target > prev ? target : prev));
    setError(null);
  }, []);

  const handleFinalized = useCallback((payload: Vs01FinalizeDocumentPayload) => {
    setDocumentId(payload.documentId ? payload.documentId : null);
    setContentSha256(payload.contentSha256 ? payload.contentSha256 : null);
    setSenderPlacedFields([]);
    setSenderSignatureRef(null);
    setRecipientPlacedFields([]);
    if (!payload.documentId?.trim()) {
      setDocumentMeta(null);
      return;
    }
    const fn = payload.fileName?.trim();
    if (fn && payload.source) {
      setDocumentMeta({ fileName: fn, source: payload.source });
    }
  }, []);

  useEffect(() => {
    if (step !== 1) return;
    if (agreementTitleUserEdited) return;
    if (!documentMeta) return;
    setAgreementTitle(defaultAgreementTitle(documentMeta));
  }, [step, documentMeta, agreementTitleUserEdited]);

  const handleSigned = useCallback(
    (payload: {
      receiptId: string;
      receiptHashSha256: string;
      receipt: unknown;
      senderPlacedFields: PlacedSigningField[];
      senderSignatureRef: Vs01SenderSignatureRef | null;
    }) => {
      setReceiptId(payload.receiptId || null);
      setReceiptHashSha256(payload.receiptHashSha256 || null);
      setReceipt(payload.receipt ?? null);
      setSenderPlacedFields(payload.senderPlacedFields ?? []);
      setSenderSignatureRef(payload.senderSignatureRef ?? null);
    },
    []
  );

  const handleReceiptUpdated = useCallback(
    (payload: { receipt: unknown; receiptHashSha256?: string | null }) => {
      setReceipt(payload.receipt);
      if (payload.receiptHashSha256 != null && String(payload.receiptHashSha256).trim() !== "") {
        setReceiptHashSha256(String(payload.receiptHashSha256).trim());
      }
    },
    []
  );

  const resetAll = useCallback(() => {
    setAgreementTitle("");
    setAgreementTitleUserEdited(false);
    setDocumentMeta(null);
    setCreatorName("");
    setCreatorEmail("");
    setSenderMessage("");
    setCounterparties(initialCounterparties());
    setDocumentId(null);
    setContentSha256(null);
    setReceiptId(null);
    setReceiptHashSha256(null);
    setReceipt(null);
    setRecipientPlacedFields([]);
    setSenderPlacedFields([]);
    setSenderSignatureRef(null);
    setStep(0);
    setFurthestStep(0);
    setError(null);
  }, []);

  const stepCount = STEPS.length;

  if (RECIPIENT_SIGNER_DEEP_LINK && RECIPIENT_LOCKED_CP_ID) {
    return (
      <>
        {error ? (
          <div className="vs01-error-banner" role="alert">
            {error}
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary"
              style={{ marginTop: "0.5rem", width: "auto" }}
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div
          className="vs01-card vs01-card--envelope vs01-recipient-signing-shell"
          data-vs01-receipt-id={receiptId ?? ""}
          data-vs01-receipt-hash={receiptHashSha256 ?? ""}
          data-vs01-receipt-present={receipt != null ? "1" : "0"}
        >
          {recipientSigningFinished ? (
            <section className="vs01-recipient-signing-done" aria-labelledby="vs01-recipient-done-title">
              <h2 id="vs01-recipient-done-title" className="vs01-card-title">
                Signing complete
              </h2>
              <p className="vs01-card-help">
                Your responses are saved in this browser session. The sender can continue from their receipt flow when
                everyone has signed.
              </p>
            </section>
          ) : (
            <RecipientSigningView
              documentId={documentId}
              counterparties={counterparties}
              lockedCounterpartyId={RECIPIENT_LOCKED_CP_ID}
              recipientFields={recipientPlacedFields}
              senderPlacedFields={senderPlacedFields}
              senderSignatureRef={senderSignatureRef}
              onRecipientFieldsChange={setRecipientPlacedFields}
              onError={setError}
              onFinishSigning={() => setRecipientSigningFinished(true)}
              manifestDecodeError={VS01_URL_BOOT?.recipientManifestDecodeError ?? null}
              manifestParamPresent={VS01_URL_BOOT?.recipientManifestParamPresent ?? false}
            />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {error ? (
        <div className="vs01-error-banner" role="alert">
          {error}
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary"
            style={{ marginTop: "0.5rem", width: "auto" }}
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <nav className="vs01-stepper" aria-label={`VS01 flow: ${stepCount} steps from document to receipt`}>
        {STEPS.map(({ id, label }) => {
          const active = id === step;
          const future = id > step;
          const blocked = future && !canReachStep(id);
          const stepNum = id + 1;
          return (
            <button
              key={id}
              type="button"
              className={`vs01-stepper-step${active ? " vs01-stepper-step--active" : ""}`}
              disabled={blocked}
              aria-current={active ? "step" : undefined}
              aria-label={
                blocked
                  ? `Step ${stepNum} of ${stepCount}: ${label} (complete earlier steps first)`
                  : `Step ${stepNum} of ${stepCount}: ${label}`
              }
              onClick={() => {
                if (!blocked) goToStep(id);
              }}
            >
              <span className="vs01-stepper-num">{stepNum}</span>
              <span className="vs01-stepper-label">{label}</span>
            </button>
          );
        })}
      </nav>

      <div
        className="vs01-card vs01-card--envelope"
        data-vs01-active-step={step}
        data-vs01-receipt-id={receiptId ?? ""}
        data-vs01-receipt-hash={receiptHashSha256 ?? ""}
        data-vs01-receipt-present={receipt != null ? "1" : "0"}
      >
        {step === 0 ? (
          <StepDocument
            loading={loading}
            setLoading={setLoading}
            documentId={documentId}
            contentSha256={contentSha256}
            onFinalized={handleFinalized}
            onError={setError}
            onContinue={() => {
              /* Details step is index 1. Advance when finalize produced ids (mirrors docFinalized / canReachStep(1)). */
              const did = documentId?.trim();
              const hash = contentSha256?.trim();
              if (did && hash && loading === "idle") goToStep(1);
            }}
          />
        ) : null}
        {step === 1 ? (
          <StepAgreementDetails
            agreementTitle={agreementTitle}
            onAgreementTitleChange={(v) => {
              setAgreementTitleUserEdited(true);
              setAgreementTitle(v);
            }}
            creatorName={creatorName}
            onCreatorNameChange={setCreatorName}
            creatorEmail={creatorEmail}
            onCreatorEmailChange={setCreatorEmail}
            counterparties={counterparties}
            onCounterpartiesChange={setCounterparties}
            senderMessage={senderMessage}
            onSenderMessageChange={setSenderMessage}
            loading={loading}
            onError={setError}
            onBack={() => goToStep(0)}
            onContinue={() => {
              if (detailsOk) goToStep(2);
            }}
          />
        ) : null}
        {step === 2 ? (
          <StepPrepareSignature
            defaultSignerRef={defaultSignerRef}
            documentId={documentId}
            contentSha256={contentSha256}
            receiptId={receiptId}
            loading={loading}
            setLoading={setLoading}
            onError={setError}
            onSigned={handleSigned}
            counterparties={counterparties}
            senderMessage={senderMessage}
            onBack={() => goToStep(1)}
            onContinue={() => {
              if (receiptId) goToStep(3);
            }}
          />
        ) : null}
        {step === 3 ? (
          <StepCompleteAndSend
            documentId={documentId}
            counterparties={counterparties}
            recipientFields={recipientPlacedFields}
            onRecipientFieldsChange={setRecipientPlacedFields}
            senderPlacedFields={senderPlacedFields}
            senderSignatureRef={senderSignatureRef}
            onError={setError}
            onBack={() => goToStep(2)}
            onContinueToReceipt={() => {
              if (recipientPlacedFields.length > 0) goToStep(4);
            }}
          />
        ) : null}
        {step === 4 ? (
          <StepDone
            counterparties={counterparties}
            recipientPlacedFields={recipientPlacedFields}
            documentId={documentId}
            receiptId={receiptId}
            receiptHashSha256={receiptHashSha256}
            receipt={receipt}
            loading={loading}
            setLoading={setLoading}
            onError={setError}
            onReceiptUpdated={handleReceiptUpdated}
            onStartOver={resetAll}
          />
        ) : null}
      </div>
    </>
  );
}
