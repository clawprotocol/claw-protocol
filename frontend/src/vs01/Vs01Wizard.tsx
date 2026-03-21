import { useCallback, useState } from "react";
import "./vs01.css";
import { StepDone } from "./StepDone";
import { StepFinalize } from "./StepFinalize";
import { StepSign } from "./StepSign";
import type { Vs01LoadingState, Vs01Step } from "./types";

const STEPS: { id: Vs01Step; label: string }[] = [
  { id: 0, label: "Finalize" },
  { id: 1, label: "Sign" },
  { id: 2, label: "Done" },
];

export type Vs01WizardProps = {
  /** Reserved for future controlled mode; shell ignores if unset. */
  initialStep?: Vs01Step;
};

/**
 * Single-page 3-step wizard: owns step index, finalize identifiers, loading, and errors.
 */
export function Vs01Wizard({ initialStep = 0 }: Vs01WizardProps) {
  const [step, setStep] = useState<Vs01Step>(initialStep);
  const [loading, setLoading] = useState<Vs01LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [contentSha256, setContentSha256] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [receiptHashSha256, setReceiptHashSha256] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<unknown>(null);

  const goToStep = useCallback((target: Vs01Step) => {
    setStep(target);
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

      <nav className="vs01-stepper" aria-label="VS01 steps">
        {STEPS.map(({ id, label }) => {
          const active = id === step;
          const future = id > step;
          const allowStep1FromFinalize = step === 0 && id === 1 && !!documentId;
          const allowStep2FromSign = step === 1 && id === 2 && !!receiptId;
          const blocked = future && !allowStep1FromFinalize && !allowStep2FromSign;
          return (
            <button
              key={id}
              type="button"
              className={`vs01-stepper-step${active ? " vs01-stepper-step--active" : ""}`}
              disabled={blocked}
              aria-current={active ? "step" : undefined}
              onClick={() => {
                if (!blocked) goToStep(id);
              }}
            >
              <span className="vs01-stepper-num">{id + 1}</span>
              <span className="vs01-stepper-label">{label}</span>
            </button>
          );
        })}
      </nav>

      <div
        className="vs01-card"
        data-vs01-active-step={step}
        data-vs01-receipt-id={receiptId ?? ""}
        data-vs01-receipt-hash={receiptHashSha256 ?? ""}
        data-vs01-receipt-present={receipt != null ? "1" : "0"}
      >
        {step === 0 ? (
          <StepFinalize
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
          <StepSign
            documentId={documentId}
            contentSha256={contentSha256}
            receiptId={receiptId}
            loading={loading}
            setLoading={setLoading}
            onError={setError}
            onSigned={handleSigned}
            onBack={() => goToStep(0)}
            onContinue={() => {
              if (receiptId) goToStep(2);
            }}
          />
        ) : null}
        {step === 2 ? (
          <StepDone
            receiptId={receiptId}
            receiptHashSha256={receiptHashSha256}
            receipt={receipt}
            loading={loading}
            setLoading={setLoading}
            onError={setError}
            onReceiptUpdated={handleReceiptUpdated}
            onStartOver={() => {
              setDocumentId(null);
              setContentSha256(null);
              setReceiptId(null);
              setReceiptHashSha256(null);
              setReceipt(null);
              goToStep(0);
            }}
          />
        ) : null}
      </div>
    </>
  );
}
