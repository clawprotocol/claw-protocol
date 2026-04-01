import { useCallback, useState } from "react";
import { CounterpartyList } from "./CounterpartyList";
import type { Vs01Counterparty, Vs01LoadingState } from "./types";

export type StepAgreementDetailsProps = {
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
  onError: (message: string | null) => void;
  onBack?: () => void;
  onContinue?: () => void;
};

const STEP_ID = "details" as const;

function detailsFormValid(
  title: string,
  creatorName: string,
  counterparties: Vs01Counterparty[]
): boolean {
  if (!title.trim() || !creatorName.trim()) return false;
  return counterparties.some((c) => c.name.trim().length > 0);
}

/**
 * Step 1 — Who needs to sign (agreement details; no document controls).
 */
export function StepAgreementDetails({
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
  onError,
  onBack,
  onContinue,
}: StepAgreementDetailsProps) {
  const busy = loading !== "idle";
  const [showHint, setShowHint] = useState(false);

  const valid = detailsFormValid(agreementTitle, creatorName, counterparties);

  const handleContinue = useCallback(() => {
    if (!detailsFormValid(agreementTitle, creatorName, counterparties)) {
      setShowHint(true);
      onError("Add a document name, your name, and at least one other signer’s name.");
      return;
    }
    setShowHint(false);
    onError(null);
    onContinue?.();
  }, [agreementTitle, creatorName, counterparties, onContinue, onError]);

  return (
    <section data-vs01-step={STEP_ID} aria-labelledby="vs01-step-details-title">
      <div className="vs01-details-step">
        <h2 id="vs01-step-details-title" className="vs01-card-title vs01-details-title">
          Who needs to sign?
        </h2>
        <p className="vs01-card-help vs01-details-step-lead">
          Add your name and the people who should sign after you. Nothing gets sent until the next steps.
        </p>

        <div className="vs01-details-form">
          <div className="vs01-stack vs01-details-stack">
            <div className="vs01-field">
              <label className="vs01-field-label" htmlFor="vs01-agreement-title">
                Agreement title
              </label>
              <input
                id="vs01-agreement-title"
                className="vs01-input"
                value={agreementTitle}
                disabled={busy}
                placeholder="Name this document"
                onChange={(ev) => {
                  setShowHint(false);
                  onAgreementTitleChange(ev.target.value);
                }}
                aria-required
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
                onChange={(ev) => {
                  setShowHint(false);
                  onCreatorNameChange(ev.target.value);
                }}
                aria-required
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
                Message for the next signer (optional)
              </label>
              <textarea
                id="vs01-sender-msg"
                className="vs01-input"
                rows={2}
                value={senderMessage}
                disabled={busy}
                placeholder="Add a short note they’ll see before signing"
                onChange={(ev) => onSenderMessageChange(ev.target.value)}
              />
            </div>
          </div>

          {showHint && !valid ? (
            <p className="vs01-inline-hint" role="status">
              Add a document name, your name, and at least one other signer’s name.
            </p>
          ) : null}

          <div className="vs01-step-actions vs01-details-step-actions vs01-details-step-actions--polish">
            <button type="button" className="vs01-btn vs01-btn--secondary" disabled={busy} onClick={() => onBack?.()}>
              Back
            </button>
            <button
              type="button"
              className="vs01-btn vs01-btn--primary"
              disabled={busy}
              onClick={handleContinue}
            >
              Continue to signing
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
