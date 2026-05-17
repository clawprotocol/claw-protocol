import type { PlacedSigningField } from "./signingFields";
import type { Vs01SignerRuntimeContext } from "./vs01FieldValueResolution";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import {
  logVs01TemplateRenderValue,
  prepareTemplateDisplayForField,
  prepareTemplateCornerLabel,
  resolvePrepareFieldDisplayValue,
} from "./vs01PrepareTemplateField";
import { VS01_PREPARE_SIGNER_NAME_PLACEHOLDER, VS01_PREPARE_TITLE_PLACEHOLDER } from "./vs01PrepareSignerDisplay";

function formatIsoDateDisplay(iso: string): string {
  const t = iso.trim();
  if (!t) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return t;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

export type PrepareOwnerSignaturePreview = {
  signatureMode: "type" | "draw" | "upload";
  typedName: string;
  hasDrawn: boolean;
  uploadPreviewUrl: string | null;
};

export type PrepareSigningFieldBodyProps = {
  field: PlacedSigningField;
  role: Vs01PrepareSigningRole | null;
  ownerPreview: PrepareOwnerSignaturePreview;
  ownerPad: Vs01SignerRuntimeContext;
  isSelected: boolean;
  busy: boolean;
  onValueChange: (value: string) => void;
  onInputFocus?: () => void;
};

export function PrepareSigningFieldBody({
  field,
  role,
  ownerPreview,
  ownerPad,
  isSelected,
  busy,
  onValueChange,
  onInputFocus,
}: PrepareSigningFieldBodyProps) {
  const display = prepareTemplateDisplayForField(field, role, ownerPad);
  const fieldRoleKind = role?.kind ?? field.assignedSignerRoleKind ?? "owner";
  const isOwnerField = fieldRoleKind === "owner";
  const stored = typeof field.value === "string" ? field.value : "";
  const resolved = resolvePrepareFieldDisplayValue(field, role, ownerPad);
  const editValue = stored || resolved;

  logVs01TemplateRenderValue({
    fieldId: field.id.slice(0, 12),
    fieldType: field.type,
    roleKind: role?.kind ?? field.assignedSignerRoleKind,
    roleIdShort: (role?.roleId ?? field.assignedSignerRoleId ?? "").slice(0, 16),
    isPlaceholder: display.isPlaceholder,
    bodyPreview: display.body.slice(0, 40),
  });

  if (field.type === "signature") {
    if (isOwnerField) {
    return (
      <div className="vs01-sign-placement-signature-body">
          {ownerPreview.signatureMode === "type" && ownerPreview.typedName.trim() ? (
            <span className="vs01-sign-placement-script">{ownerPreview.typedName.trim()}</span>
          ) : null}
          {ownerPreview.signatureMode === "type" && !ownerPreview.typedName.trim() ? (
            <span className="vs01-sign-placement-meta vs01-sign-placement-ph">Your signature</span>
          ) : null}
          {ownerPreview.signatureMode === "draw" ? (
            ownerPreview.hasDrawn ? (
              <span className="vs01-sign-placement-meta">Drawn signature</span>
            ) : (
              <span className="vs01-sign-placement-meta vs01-sign-placement-ph">Your signature</span>
            )
          ) : null}
          {ownerPreview.signatureMode === "upload" && ownerPreview.uploadPreviewUrl ? (
            <img className="vs01-sign-placement-img" src={ownerPreview.uploadPreviewUrl} alt="" />
          ) : null}
          {ownerPreview.signatureMode === "upload" && !ownerPreview.uploadPreviewUrl ? (
            <span className="vs01-sign-placement-meta vs01-sign-placement-ph">Your signature</span>
          ) : null}
        </div>
      );
    }
    return (
      <div className="vs01-sign-placement-signature-body vs01-sign-placement-signature-body--counterparty vs01-sign-placement-body--noninteractive">
        <span className="vs01-prepare-signature-heading">{display.assigneeLine}</span>
        <span className="vs01-prepare-signature-placeholder">{display.body}</span>
      </div>
    );
  }

  if (field.type === "initials") {
    return (
      <span
        className={`vs01-sign-placement-initials vs01-sign-placement-body--noninteractive${display.isPlaceholder ? " vs01-sign-placement-ph" : ""}`}
      >
        {display.body}
      </span>
    );
  }

  if (field.type === "printed_name" || field.type === "text" || field.type === "email") {
    const placeholder =
      field.type === "printed_name"
        ? role?.kind === "counterparty"
          ? VS01_PREPARE_SIGNER_NAME_PLACEHOLDER
          : "Printed name"
        : field.type === "email"
          ? "Email"
          : role?.kind === "counterparty"
            ? VS01_PREPARE_TITLE_PLACEHOLDER
            : "Add text";
    if (isSelected && !busy) {
      return (
        <input
          type={field.type === "email" ? "email" : "text"}
          className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
          value={editValue}
          placeholder={placeholder}
          autoComplete={field.type === "email" ? "email" : field.type === "printed_name" ? "name" : "off"}
          aria-label={prepareTemplateCornerLabel(field.type, role)}
          onFocus={() => onInputFocus?.()}
          onChange={(ev) => onValueChange(ev.target.value)}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
        />
      );
    }
    return (
      <span
        className={`vs01-sign-placement-text vs01-sign-placement-body--noninteractive${display.isPlaceholder ? " vs01-sign-placement-ph" : ""}`}
      >
        {display.body}
      </span>
    );
  }

  if (field.type === "date") {
    if (isSelected && !busy) {
      return (
        <input
          type="date"
          className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
          value={editValue}
          aria-label="Date on document"
          onFocus={() => onInputFocus?.()}
          onChange={(ev) => onValueChange(ev.target.value)}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
        />
      );
    }
    return (
      <span
        className={`vs01-sign-placement-text vs01-sign-placement-body--noninteractive${display.isPlaceholder ? " vs01-sign-placement-ph" : ""}`}
      >
        {editValue.trim() ? formatIsoDateDisplay(editValue) : display.body}
      </span>
    );
  }

  return null;
}

