import { useEffect } from "react";
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
import { LawDogSigningField } from "./LawDogSigningField";
import { normalizedPdfRectToCssPercent } from "./vs01FieldCssGeometry";
import { Vs01InitialsDomFieldShell } from "./Vs01InitialsDomFieldShell";

function logVs01SigningFieldRender(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-signing-field-render]", payload);
}

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
  signerCount?: number;
  pageFieldObstacles?: readonly { x: number; y: number; width: number; height: number }[];
};

export function RecipientSigningFieldOverlay({
  field,
  lockedCounterpartyId,
  lockedSignerRoleId,
  recipientAgreementId,
  cpById,
  onUpdateValue,
  signerCount = 2,
  pageFieldObstacles = [],
}: RecipientSigningFieldOverlayProps) {
  const useDomInitials = field.type === "initials" && field.autoInitials === true;
  const percentStyle = normalizedPdfRectToCssPercent(field);
  const staticStyle = {
    position: "absolute" as const,
    left: percentStyle.left,
    top: percentStyle.top,
    width: percentStyle.width,
    height: percentStyle.height,
  };

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
  const signerLabel =
    field.assignedSignerRoleLabel?.trim() ||
    cpById.get(field.counterpartyId)?.name?.trim() ||
    "";
  const fieldVisible = field.width > 0 && field.height > 0;
  const isMetadata = isRecipientSigningMetadataType(field.type);

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

  const overlayClassName = isMetadata
    ? `vs01-recipient-meta-inline${isMine ? " vs01-recipient-meta-inline--mine" : " vs01-recipient-meta-inline--other"}`
    : boxClass;

  useEffect(() => {
    logVs01SigningFieldRender({
      signerId: field.assignedSignerRoleId ?? field.counterpartyId,
      fieldType: field.type,
      page: field.page,
      x: field.x,
      y: field.y,
      w: field.width,
      h: field.height,
      locked: !editable,
      visible: fieldVisible,
      className: overlayClassName,
    });
  }, [
    field.id,
    field.page,
    field.x,
    field.y,
    field.width,
    field.height,
    field.type,
    editable,
    fieldVisible,
    overlayClassName,
  ]);

  if (isMetadata) {
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
      <LawDogSigningField
        fieldType={field.type}
        signerName={field.assignedSignerRoleLabel ?? cpById.get(field.counterpartyId)?.name ?? ""}
        signerRole={field.assignedSignerRoleKind ?? ""}
        locked={!editable}
        required={false}
        value={shown}
        className={`vs01-recipient-meta-inline${isMine ? " vs01-recipient-meta-inline--mine" : " vs01-recipient-meta-inline--other"}`}
        style={staticStyle}
        aria-label={`${metaLabel}: ${shown}`}
        data-field-id={field.id}
      >
        <span className="vs01-recipient-meta-inline__text">{shown}</span>
      </LawDogSigningField>
    );
  }

  if (field.type === "signature") {
    const hasSig = displayVal.trim().length > 0;
    return (
      <LawDogSigningField
        key={field.id}
        fieldType={field.type}
        signerName={field.assignedSignerRoleLabel ?? cpById.get(field.counterpartyId)?.name ?? ""}
        signerRole={field.assignedSignerRoleKind ?? ""}
        locked={!editable}
        required
        value={displayVal}
        data-field-id={field.id}
        className={`${boxClass} vs01-recipient-signature-slot`}
        style={{
          ...staticStyle,
          zIndex: isMine ? 4 : 2,
          pointerEvents: editable ? "auto" : "none",
        }}
        active={editable && !hasSig}
        aria-disabled={!editable}
      >
        {signerLabel ? (
          <span className="lawdog-signing-field__signer">{signerLabel}</span>
        ) : null}
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
      </LawDogSigningField>
    );
  }

  if (field.type === "initials") {
    const hasIni = displayVal.trim().length > 0;
    const partyIndex = field.assignedPartyIndex ?? 0;
    return (
      <Vs01InitialsDomFieldShell
        enabled={useDomInitials}
        page={field.page}
        signerIndex={partyIndex}
        signerCount={signerCount}
        normalizedFallback={field}
        fieldObstacles={pageFieldObstacles}
        className={`${boxClass} vs01-recipient-initials-slot`}
        styleExtras={{
          zIndex: isMine ? 4 : 2,
          pointerEvents: editable ? "auto" : "none",
        }}
      >
        <LawDogSigningField
          key={field.id}
          fieldType={field.type}
          signerName={field.assignedSignerRoleLabel ?? cpById.get(field.counterpartyId)?.name ?? ""}
          signerRole={field.assignedSignerRoleKind ?? ""}
          locked={!editable}
          required={false}
          initials={displayVal}
          data-field-id={field.id}
          className="vs01-recipient-initials-slot__inner"
          style={{ position: "relative", width: "100%", height: "100%", inset: undefined }}
          active={editable && !hasIni}
          aria-disabled={!editable}
        >
          {signerLabel ? (
            <span className="lawdog-signing-field__signer">{signerLabel}</span>
          ) : null}
          <span className="vs01-sign-placement-label lawdog-signing-field__label">
            {labelForRecipientFieldType("initials")}
          </span>
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
        </LawDogSigningField>
      </Vs01InitialsDomFieldShell>
    );
  }

  return null;
}
