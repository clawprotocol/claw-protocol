/**
 * Recipient field bodies for the assign-fields step (PDF overlay).
 * Kept separate for readability vs StepCompleteAndSend layout wiring.
 */

export type RecipientSignatureFieldBodyProps = {
  textVal: string;
  assigneeLabel: string;
};

/** Top label stays on the parent box; this is assignee line + main area (placeholder or filled script). */
export function RecipientSignatureFieldBody({ textVal, assigneeLabel }: RecipientSignatureFieldBodyProps) {
  const line = assigneeLabel.trim() || "Recipient";
  if (textVal.trim()) {
    return (
      <>
        <span className="vs01-recipient-field-assignee">{line}</span>
        <div className="vs01-recipient-field-body vs01-recipient-field-body--fill">
          <span className="vs01-sign-placement-script">{textVal.trim()}</span>
        </div>
      </>
    );
  }
  return (
    <>
      <span className="vs01-recipient-field-assignee">{line}</span>
      <div className="vs01-recipient-field-body vs01-recipient-field-body--fill">
        <span className="vs01-recipient-field-placeholder-text" aria-label={`Signature for ${line}`}>
          Signer signs here
        </span>
      </div>
    </>
  );
}

export type RecipientPrintedNameFieldBodyProps = {
  displayName: string;
};

/** Parent supplies PRINTED NAME label; this is the readable name placeholder only (centered). */
export function RecipientPrintedNameFieldBody({ displayName }: RecipientPrintedNameFieldBodyProps) {
  const name = displayName.trim() || "Recipient name";
  return (
    <div className="vs01-recipient-field-body vs01-recipient-field-body--fill">
      <span className="vs01-recipient-field-printed-readout" aria-label={`Printed name: ${name}`}>
        {name}
      </span>
    </div>
  );
}
