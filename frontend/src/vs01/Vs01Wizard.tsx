import { useCallback, useState } from "react";
import "./vs01.css";
import { StepCompleteAndSend } from "./StepCompleteAndSend";
import { StepCreateAgreement } from "./StepCreateAgreement";
import { StepDone } from "./StepDone";
import { StepPrepareSignature } from "./StepPrepareSignature";
import type { Vs01Counterparty, Vs01LoadingState, Vs01Step } from "./types";

const STEPS: { id: Vs01Step; label: string }[] = [
  { id: 0, label: "Agreement" },
  { id: 1, label: "Signing" },
  { id: 2, label: "Handoff" },
  { id: 3, label: "Receipt" },
];

function initialCounterparties(): Vs01Counterparty[] {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `cp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return [{ id, name: "", email: "" }];
}

export type Vs01WizardProps = {
  /** Reserved for future controlled mode; shell ignores if unset. */
  initialStep?: Vs01Step;
};

/**
 * Envelope flow: create → prepare signature → complete & send → receipt record.
 * Owns step index, finalize identifiers, counterparties, loading, and errors.
 */
export function Vs01Wizard({ initialStep = 0 }: Vs01WizardProps) {
  const [step, setStep] = useState<Vs01Step>(initialStep);
  /** Furthest step visited — prevents jumping to Receipt before Handoff without confusing skips. */
  const [furthestStep, setFurthestStep] = useState<Vs01Step>(initialStep);
  const [loading, setLoading] = useState<Vs01LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);

  const [agreementTitle, setAgreementTitle] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [creatorEmail, setCreatorEmail] = useState("");
  const [senderMessage, setSenderMessage] = useState("");
  const [counterparties, setCounterparties] = useState<Vs01Counterparty[]>(initialCounterparties);

  const [documentId, setDocumentId] = useState<string | null>(null);
  const [contentSha256, setContentSha256] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [receiptHashSha256, setReceiptHashSha256] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<unknown>(null);

  const defaultSignerRef =
    [creatorName.trim(), creatorEmail.trim()].filter(Boolean).join(" · ") || "signer";

  const goToStep = useCallback((target: Vs01Step) => {
    setStep(target);
    setFurthestStep((prev) => (target > prev ? target : prev));
    setError(null);
  }, []);

  const handleFinalized = useCallback(
    (payload: { documentId: string; contentSha256: string }) => {
      setDocumentId(payload.documentId ? payload.documentId : null);
      setContentSha256(payload.contentSha256 ? payload.contentSha256 : null);
    },
    []
  );

  const handleSigned = useCallback(
    (payload: { receiptId: string; receiptHashSha256: string; receipt: unknown }) => {
      setReceiptId(payload.receiptId || null);
      setReceiptHashSha256(payload.receiptHashSha256 || null);
      setReceipt(payload.receipt ?? null);
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
    setCreatorName("");
    setCreatorEmail("");
    setSenderMessage("");
    setCounterparties(initialCounterparties());
    setDocumentId(null);
    setContentSha256(null);
    setReceiptId(null);
    setReceiptHashSha256(null);
    setReceipt(null);
    setStep(0);
    setFurthestStep(0);
    setError(null);
  }, []);

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

      <nav className="vs01-stepper" aria-label="VS01 flow: four steps from agreement to receipt">
        {STEPS.map(({ id, label }) => {
          const active = id === step;
          const future = id > step;
          const stepNum = id + 1;
          const canReachTarget =
            (id === 1 && !!documentId) ||
            (id === 2 && !!receiptId) ||
            (id === 3 && !!receiptId && furthestStep >= 2);
          const blocked = future && !canReachTarget;
          return (
            <button
              key={id}
              type="button"
              className={`vs01-stepper-step${active ? " vs01-stepper-step--active" : ""}`}
              disabled={blocked}
              aria-current={active ? "step" : undefined}
              aria-label={
                blocked
                  ? `Step ${stepNum} of 4: ${label} (complete earlier steps first)`
                  : `Step ${stepNum} of 4: ${label}`
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
          <StepCreateAgreement
            agreementTitle={agreementTitle}
            onAgreementTitleChange={setAgreementTitle}
            creatorName={creatorName}
            onCreatorNameChange={setCreatorName}
            creatorEmail={creatorEmail}
            onCreatorEmailChange={setCreatorEmail}
            counterparties={counterparties}
            onCounterpartiesChange={setCounterparties}
            senderMessage={senderMessage}
            onSenderMessageChange={setSenderMessage}
            loading={loading}
            setLoading={setLoading}
            documentId={documentId}
            contentSha256={contentSha256}
            onFinalized={handleFinalized}
            onError={setError}
            onContinue={() => {
              if (documentId) goToStep(1);
            }}
          />
        ) : null}
        {step === 1 ? (
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
            onBack={() => goToStep(0)}
            onContinue={() => {
              if (receiptId) goToStep(2);
            }}
          />
        ) : null}
        {step === 2 ? (
          <StepCompleteAndSend
            agreementTitle={agreementTitle}
            documentId={documentId}
            creatorName={creatorName}
            creatorEmail={creatorEmail}
            receiptId={receiptId}
            receiptHashSha256={receiptHashSha256}
            counterparties={counterparties}
            senderMessage={senderMessage}
            loading={loading}
            setLoading={setLoading}
            onError={setError}
            onContinueToRecord={() => goToStep(3)}
            onStartOver={resetAll}
          />
        ) : null}
        {step === 3 ? (
          <StepDone
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
