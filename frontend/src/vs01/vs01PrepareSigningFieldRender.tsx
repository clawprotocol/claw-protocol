import type { PlacedSigningField } from "./signingFields";

function formatIsoDateDisplay(iso: string): string {
  const t = iso.trim();
  if (!t) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return t;
  return `${m[2]}/${m[3]}/${m[1]}`;
}
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import {
  logVs01TemplateRenderValue,
  prepareTemplateDisplayForField,
  prepareTemplateCornerLabel,
} from "./vs01PrepareTemplateField";

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
  isSelected: boolean;
  busy: boolean;
  onValueChange: (value: string) => void;
};

export function PrepareSigningFieldBody({
  field,
  role,
  ownerPreview,
  isSelected,
  busy,
  onValueChange,
}: PrepareSigningFieldBodyProps) {
  const display = prepareTemplateDisplayForField(field, role);
  const isOwnerField = (role?.kind ?? field.assignedSignerRoleKind) === "owner";
  const textVal = typeof field.value === "string" ? field.value : "";

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
      <div className="vs01-sign-placement-signature-body">
        <span className="vs01-recipient-field-assignee">{display.assigneeLine}</span>
        <span
          className={`vs01-recipient-field-placeholder-text${display.isPlaceholder ? "" : " vs01-sign-placement-script"}`}
        >
          {display.body}
        </span>
      </div>
    );
  }

  if (field.type === "initials") {
    return (
      <span className={`vs01-sign-placement-initials${display.isPlaceholder ? " vs01-sign-placement-ph" : ""}`}>
        {display.body}
      </span>
    );
  }

  if (field.type === "printed_name" || field.type === "text" || field.type === "email") {
    const placeholder =
      field.type === "printed_name"
        ? "Printed name"
        : field.type === "email"
          ? "Email"
          : role?.kind === "counterparty"
            ? "Title"
            : "Add text";
    if (isSelected && !busy) {
      return (
        <input
          type={field.type === "email" ? "email" : "text"}
          className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
          value={textVal}
          placeholder={placeholder}
          autoComplete={field.type === "email" ? "email" : field.type === "printed_name" ? "name" : "off"}
          aria-label={prepareTemplateCornerLabel(field.type, role)}
          onChange={(ev) => onValueChange(ev.target.value)}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
        />
      );
    }
    return (
      <span className={`vs01-sign-placement-text${display.isPlaceholder ? " vs01-sign-placement-ph" : ""}`}>
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
          value={textVal}
          aria-label="Date on document"
          onChange={(ev) => onValueChange(ev.target.value)}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
        />
      );
    }
    return (
      <span className={`vs01-sign-placement-text${display.isPlaceholder ? " vs01-sign-placement-ph" : ""}`}>
        {textVal.trim() ? formatIsoDateDisplay(textVal) : "Date"}
      </span>
    );
  }

  return null;
}
