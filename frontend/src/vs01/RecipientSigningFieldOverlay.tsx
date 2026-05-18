import type { Vs01Counterparty, Vs01RecipientPlacedField } from "./types";
import { labelForRecipientFieldType } from "./signingFields";
import { recipientFieldBelongsToLockedSigner } from "./vs01SignerFieldAssignment";
import {
  isRecipientSigningEditableType,
  isRecipientSigningMetadataType,
  recipientFieldStatusPill,
  recipientFieldStatusPillLabel,
  resolveRecipientSigningAutoValue,
} from "./recipientSigningFieldUtils";

function formatIsoDateDisplay(iso: string): string {
  const t = iso.trim();
  if (!t) return "";
  const d = new Date(`${t}T12:00:00.000Z`);
  return Number.isNaN(d.getTime())
    ? t
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export type RecipientSigningFieldOverlayProps = {
  field: Vs01RecipientPlacedField;
  lockedCounterpartyId: string;
  lockedSignerRoleId: string | null;
  recipientAgreementId: string | null;
  cpById: Map<string, Vs01Counterparty>;
  onUpdateValue: (fieldId: string, value: string) => void;
};

export function RecipientSigningFieldOverlay({
  field,
  lockedCounterpartyId,
  lockedSignerRoleId,
  recipientAgreementId,
  cpById,
  onUpdateValue,
}: RecipientSigningFieldOverlayProps) {
  const xFit = Math.min(field.x, 1 - field.width);
  const yFit = Math.min(field.y, 1 - field.height);
  const style = {
    left: `${xFit * 100}%`,
    top: `${yFit * 100}%`,
    width: `${field.width * 100}%`,
    height: `${field.height * 100}%`,
  } as const;

  const isMine = recipientFieldBelongsToLockedSigner(
    field,
    lockedCounterpartyId,
    lockedSignerRoleId,
  );
  const editable = isMine && isRecipientSigningEditableType(field.type);
  const pill = recipientFieldStatusPill({
    field,
    isCurrentSignerField: isMine,
    agreementId: recipientAgreementId,
  });
  const pillLabel = recipientFieldStatusPillLabel(pill);
  const displayVal = editable
    ? typeof field.value === "string"
      ? field.value
      : ""
    : resolveRecipientSigningAutoValue(field, cpById);
  if (isRecipientSigningMetadataType(field.type)) {
    const metaLabel =
      field.type === "printed_name"
        ? "Printed name"
        : field.type === "date"
          ? "Date"
          : field.type === "email"
            ? "Email"
            : field.textPurpose === "title"
              ? "Title"
              : labelForRecipientFieldType(field.type);
    const shown =
      field.type === "date" ? formatIsoDateDisplay(displayVal) : displayVal.trim() || "—";
    return (
      <div
        className={`vs01-recipient-meta-inline${isMine ? " vs01-recipient-meta-inline--mine" : " vs01-recipient-meta-inline--other"}`}
        style={style}
        aria-label={`${metaLabel}: ${shown}`}
        data-field-id={field.id}
      >
        <span className="vs01-recipient-meta-inline__text">{shown}</span>
      </div>
    );
  }

  const pillClass =
    pill === "signed"
      ? "vs01-recipient-signing-pill--signed"
      : pill === "waiting"
        ? "vs01-recipient-signing-pill--waiting"
        : pill === "ready"
          ? "vs01-recipient-signing-pill--ready"
          : pill === "click-to-sign" || pill === "needs-initials"
            ? "vs01-recipient-signing-pill--action"
            : "";

  const boxClass = [
    "vs01-sign-placement-box",
    `vs01-sign-placement-box--${field.type}`,
    "vs01-recipient-signing-field",
    isMine ? "vs01-recipient-signing-field--mine" : "vs01-recipient-signing-field--other",
    editable ? "vs01-recipient-signing-field--editable" : "vs01-recipient-signing-field--locked",
    pill === "signed" ? "vs01-recipient-signing-field--signer-done" : "",
    pill === "waiting" ? "vs01-recipient-signing-field--signer-waiting" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (field.type === "signature") {
    const hasSig = displayVal.trim().length > 0;
    return (
      <div
        key={field.id}
        data-field-id={field.id}
        className={`${boxClass} vs01-recipient-signature-slot`}
        style={{
          ...style,
          zIndex: isMine ? 4 : 2,
          pointerEvents: editable ? "auto" : "none",
        }}
        aria-disabled={!editable}
      >
        {editable ? (
          <>
            <p className="vs01-recipient-signature-slot__cta" id={`sig-cta-${field.id}`}>
              {hasSig ? "Signature" : "Click to sign here"}
            </p>
            <div
              className="vs01-recipient-signature-slot__landing"
              aria-labelledby={`sig-cta-${field.id}`}
            >
              {hasSig ? (
                <span className="vs01-recipient-signature-slot__script">{displayVal.trim()}</span>
              ) : (
                <span className="vs01-recipient-signature-slot__placeholder">
                  Your signature will appear inside this box.
                </span>
              )}
              <input
                type="text"
                className="vs01-recipient-signature-slot__input"
                value={displayVal}
                placeholder="Type your full signature"
                autoComplete="off"
                aria-label="Signature"
                onChange={(ev) => onUpdateValue(field.id, ev.target.value)}
                onPointerDown={(ev) => ev.stopPropagation()}
              />
            </div>
            {hasSig ? (
              <span className="vs01-recipient-signing-pill vs01-recipient-signing-pill--ready">
                Ready
              </span>
            ) : (
              <p className="vs01-recipient-signature-slot__helper">
                Your signature will appear inside this box.
              </p>
            )}
          </>
        ) : (
          <>
            {pillLabel ? (
              <span className={`vs01-recipient-signing-pill ${pillClass}`}>{pillLabel}</span>
            ) : null}
            <span className="vs01-recipient-signing-readonly-val">
              {displayVal.trim() || "—"}
            </span>
          </>
        )}
      </div>
    );
  }

  if (field.type === "initials") {
    const hasIni = displayVal.trim().length > 0;
    return (
      <div
        key={field.id}
        data-field-id={field.id}
        className={`${boxClass} vs01-recipient-initials-slot`}
        style={{
          ...style,
          zIndex: isMine ? 4 : 2,
          pointerEvents: editable ? "auto" : "none",
        }}
        aria-disabled={!editable}
      >
        <span className="vs01-sign-placement-label">{labelForRecipientFieldType("initials")}</span>
        {!isMine && pillLabel ? (
          <span className={`vs01-recipient-signing-pill ${pillClass}`}>{pillLabel}</span>
        ) : null}
        {editable ? (
          <>
            {pillLabel && !hasIni ? (
              <span className={`vs01-recipient-signing-pill ${pillClass}`}>{pillLabel}</span>
            ) : null}
            <input
              type="text"
              className="vs01-recipient-initials-slot__input"
              value={displayVal}
              placeholder="Initials"
              maxLength={8}
              autoComplete="off"
              aria-label="Initials"
              onChange={(ev) => onUpdateValue(field.id, ev.target.value)}
              onPointerDown={(ev) => ev.stopPropagation()}
            />
            {hasIni && pill === "ready" ? (
              <span className="vs01-recipient-signing-pill vs01-recipient-signing-pill--ready">
                Ready
              </span>
            ) : null}
          </>
        ) : (
          <span className="vs01-recipient-signing-readonly-val">{displayVal.trim() || "—"}</span>
        )}
      </div>
    );
  }

  return null;
}
