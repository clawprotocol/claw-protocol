import { useCallback, useState } from "react";
import "../vs01/vs01.css";
import {
  RECIPIENT_EMAIL_CORRECTION_HELPER,
  type RecipientEmailCorrectionPhase,
  recipientEmailCorrectionErrorMessage,
} from "./recipientEmailCorrection";

export type RecipientEmailCorrectionModalProps = {
  open: boolean;
  phase: RecipientEmailCorrectionPhase;
  partyName: string;
  currentEmail: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (newEmail: string) => void | Promise<void>;
};

export function RecipientEmailCorrectionModal({
  open,
  phase,
  partyName,
  currentEmail,
  busy = false,
  onClose,
  onConfirm,
}: RecipientEmailCorrectionModalProps) {
  const [newEmail, setNewEmail] = useState(currentEmail);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setNewEmail(currentEmail);
    setError(null);
  }, [currentEmail]);

  if (!open) return null;

  const title = phase === "review" ? "Correct review email" : "Correct signer email";

  return (
    <div className="vs01-modal-backdrop" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="vs01-modal vs01-recipient-email-correction-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipient-email-correction-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="recipient-email-correction-title" className="vs01-modal-title">
          {title}
        </h2>
        <p className="vs01-modal-help">{RECIPIENT_EMAIL_CORRECTION_HELPER}</p>
        <p className="vs01-modal-help">
          Agreement text and review approvals stay the same. Only the contact email changes.
        </p>
        <p className="vs01-recipient-email-correction-party">
          <span className="vs01-recipient-email-correction-k">Party</span>
          <span>{partyName}</span>
        </p>
        <p className="vs01-recipient-email-correction-change">
          <span className="vs01-recipient-email-correction-k">Change</span>
          <span>
            {currentEmail.trim() || "—"} → <strong>{newEmail.trim() || "—"}</strong>
          </span>
        </p>
        <label className="vs01-field-label" htmlFor="recipient-email-correction-input">
          New email
        </label>
        <input
          id="recipient-email-correction-input"
          type="email"
          className="vs01-input"
          value={newEmail}
          disabled={busy}
          autoComplete="email"
          onChange={(e) => {
            setNewEmail(e.target.value);
            setError(null);
          }}
        />
        {error ? (
          <p className="vs01-error-inline" role="alert">
            {error}
          </p>
        ) : null}
        <p className="vs01-modal-footnote">
          {phase === "review"
            ? "LawDog will resend the review invite to the corrected email."
            : "LawDog will resend the signing invite to the corrected email."}
        </p>
        <div className="vs01-modal-actions">
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary"
            disabled={busy}
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="vs01-btn vs01-btn--primary"
            disabled={busy || !newEmail.trim()}
            onClick={() => {
              const next = newEmail.trim();
              if (!next || !next.includes("@")) {
                setError(recipientEmailCorrectionErrorMessage("invalid_email"));
                return;
              }
              if (next.toLowerCase() === currentEmail.trim().toLowerCase()) {
                setError(recipientEmailCorrectionErrorMessage("email_unchanged"));
                return;
              }
              void Promise.resolve(onConfirm(next)).catch(() => {
                setError("Could not save. Try again.");
              });
            }}
          >
            {busy ? "Saving…" : "Save and resend"}
          </button>
        </div>
      </div>
    </div>
  );
}
