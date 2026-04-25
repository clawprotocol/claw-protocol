import { useCallback, useMemo, useState } from "react";
import { VoiceAugmentedInput, VoiceAugmentedTextArea } from "../launch/VoiceAugmentedControl";
import { CounterpartyList } from "./CounterpartyList";
import { buildDetailsStepFieldErrors, scrollFocusFirstDetailsFieldError } from "./detailsStepValidation";
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
  counterpartyCapacityReached?: boolean;
  counterpartyCapacityHint?: string;
};

const STEP_ID = "details" as const;

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
  counterpartyCapacityReached = false,
  counterpartyCapacityHint,
}: StepAgreementDetailsProps) {
  const busy = loading !== "idle";
  const [detailsValidateAttempted, setDetailsValidateAttempted] = useState(false);

  const fieldErrors = useMemo(() => {
    if (!detailsValidateAttempted) return {} as Record<string, string>;
    return buildDetailsStepFieldErrors(agreementTitle, creatorName, creatorEmail, counterparties);
  }, [detailsValidateAttempted, agreementTitle, creatorName, creatorEmail, counterparties]);

  const titleErr = fieldErrors.agreementTitle;
  const creatorErr = fieldErrors.creatorName;
  const creatorEmailErr = fieldErrors.creatorEmail;

  const handleContinue = useCallback(() => {
    setDetailsValidateAttempted(true);
    const errs = buildDetailsStepFieldErrors(agreementTitle, creatorName, creatorEmail, counterparties);
    if (Object.keys(errs).length > 0) {
      onError(null);
      scrollFocusFirstDetailsFieldError(counterparties, errs);
      return;
    }
    onError(null);
    onContinue?.();
  }, [agreementTitle, creatorName, creatorEmail, counterparties, onContinue, onError]);

  return (
    <section data-vs01-step={STEP_ID} aria-labelledby="vs01-step-details-title">
      <div className="vs01-details-step">
        <h2 id="vs01-step-details-title" className="vs01-card-title vs01-details-title">
          Who needs to sign?
        </h2>
        <p className="vs01-card-help vs01-details-step-lead">
          Add your name and email, then the people who should sign after you. Nothing gets sent until the next steps.
        </p>

        <div className="vs01-details-form">
          <div className="vs01-stack vs01-details-stack">
            {detailsValidateAttempted && Object.keys(fieldErrors).length > 0 ? (
              <p className="vs01-inline-hint vs01-inline-hint--supporting" role="status">
                Complete the highlighted fields to continue
              </p>
            ) : null}

            <div className="vs01-field">
              <label className="vs01-field-label" htmlFor="vs01-agreement-title">
                Agreement title
              </label>
              <VoiceAugmentedInput
                id="vs01-agreement-title"
                data-vs01-details-field="agreementTitle"
                className={`vs01-input vs01-input--with-voice${titleErr ? " vs01-input--error" : ""}`}
                value={agreementTitle}
                disabled={busy}
                placeholder="Name this document"
                onValueChange={onAgreementTitleChange}
                aria-required
                aria-invalid={titleErr ? true : undefined}
                aria-describedby={titleErr ? "vs01-err-agreement-title" : undefined}
              />
              {titleErr ? (
                <p id="vs01-err-agreement-title" className="vs01-field-msg--error" role="alert">
                  {titleErr}
                </p>
              ) : null}
            </div>
            <div className="vs01-field">
              <label className="vs01-field-label" htmlFor="vs01-creator-name">
                Your name
              </label>
              <VoiceAugmentedInput
                id="vs01-creator-name"
                data-vs01-details-field="creatorName"
                className={`vs01-input vs01-input--with-voice${creatorErr ? " vs01-input--error" : ""}`}
                value={creatorName}
                disabled={busy}
                placeholder="Alex Rivera"
                autoComplete="name"
                onValueChange={onCreatorNameChange}
                aria-required
                aria-invalid={creatorErr ? true : undefined}
                aria-describedby={creatorErr ? "vs01-err-creator-name" : undefined}
              />
              {creatorErr ? (
                <p id="vs01-err-creator-name" className="vs01-field-msg--error" role="alert">
                  {creatorErr}
                </p>
              ) : null}
            </div>
            <div className="vs01-field">
              <label className="vs01-field-label" htmlFor="vs01-creator-email">
                Your email (required)
              </label>
              <VoiceAugmentedInput
                id="vs01-creator-email"
                data-vs01-details-field="creatorEmail"
                className={`vs01-input vs01-input--with-voice${creatorEmailErr ? " vs01-input--error" : ""}`}
                type="email"
                value={creatorEmail}
                disabled={busy}
                placeholder="alex@…"
                autoComplete="email"
                onValueChange={onCreatorEmailChange}
                aria-required
                aria-invalid={creatorEmailErr ? true : undefined}
                aria-describedby={creatorEmailErr ? "vs01-err-creator-email" : undefined}
              />
              {creatorEmailErr ? (
                <p id="vs01-err-creator-email" className="vs01-field-msg--error" role="alert">
                  {creatorEmailErr}
                </p>
              ) : null}
            </div>

            <CounterpartyList
              counterparties={counterparties}
              onChange={onCounterpartiesChange}
              disabled={busy}
              signerCapacityReached={counterpartyCapacityReached}
              signerCapacityTitle={counterpartyCapacityHint}
              detailsFieldErrors={fieldErrors}
            />

            <div className="vs01-field">
              <label className="vs01-field-label" htmlFor="vs01-sender-msg">
                Message for the next signer (optional)
              </label>
              <VoiceAugmentedTextArea
                id="vs01-sender-msg"
                className="vs01-input vs01-input--with-voice"
                rows={2}
                value={senderMessage}
                disabled={busy}
                placeholder="Add a short note they’ll see before signing"
                onValueChange={onSenderMessageChange}
              />
            </div>
          </div>

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
