import type { PlacedSigningField } from "./signingFields";
import type { Vs01SignerRuntimeContext } from "./vs01FieldValueResolution";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { isKnownPrepareSignerName, resolvePreparePartyEntityLabel } from "./vs01PrepareSignerDisplay";
import {
  logVs01TemplateRenderValue,
  prepareTemplateDisplayForField,
  prepareTemplateCornerLabel,
  resolvePrepareFieldDisplayValue,
  type PrepareTemplateDisplay,
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
  /** When true, signatures render as readable placeholders (prepare_signing_packet). */
  preparePacketMode?: boolean;
  isSelected: boolean;
  busy: boolean;
  onValueChange: (value: string) => void;
  onInputFocus?: () => void;
};

export function prepareFieldDataAttributes(
  field: PlacedSigningField,
  role: Vs01PrepareSigningRole | null,
  display: PrepareTemplateDisplay,
): Record<string, string> {
  const kind = role?.kind ?? field.assignedSignerRoleKind ?? "owner";
  const party = role ? resolvePreparePartyEntityLabel(role) : (field.assignedSignerRoleLabel ?? "").trim();
  return {
    "data-vs01-field-kind": field.type,
    "data-vs01-field-role-kind": kind,
    "data-vs01-field-party-name": party,
    "data-vs01-field-signer-known": role && isKnownPrepareSignerName(role) ? "true" : "false",
    "data-vs01-field-awaits-signer-input": display.awaitsSignerInput ? "true" : "false",
    ...(field.textPurpose ? { "data-vs01-field-text-purpose": field.textPurpose } : {}),
  };
}

function PrepareSignaturePlaceholderBody({ display }: { display: PrepareTemplateDisplay }) {
  return (
    <div className="vs01-sign-placement-signature-body vs01-sign-placement-signature-body--prepare-pending vs01-sign-placement-body--noninteractive">
      <span className="vs01-prepare-signature-kicker">{display.assigneeLine}</span>
      {display.partyLine ? <span className="vs01-prepare-signature-party">{display.partyLine}</span> : null}
      <span className="vs01-prepare-signature-placeholder">{display.body}</span>
      {display.footer ? <span className="vs01-prepare-signature-footer">{display.footer}</span> : null}
    </div>
  );
}

export function PrepareSigningFieldBody({
  field,
  role,
  ownerPreview,
  ownerPad,
  preparePacketMode = false,
  isSelected,
  busy,
  onValueChange,
  onInputFocus,
}: PrepareSigningFieldBodyProps) {
  const display = prepareTemplateDisplayForField(field, role, ownerPad, {
    preparePacket: preparePacketMode,
  });
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
    hasSublabel: Boolean(display.sublabel),
  });

  if (field.type === "signature") {
    if (preparePacketMode || display.prepareSignaturePlaceholder) {
      return <PrepareSignaturePlaceholderBody display={display} />;
    }
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
      <div className="vs01-sign-placement-signature-body vs01-sign-placement-signature-body--counterparty vs01-sign-placement-signature-body--pending vs01-sign-placement-body--noninteractive">
        <span className="vs01-prepare-signature-heading">{display.assigneeLine}</span>
        <span className="vs01-prepare-signature-placeholder">{display.body}</span>
        {display.sublabel ? (
          <span className="vs01-prepare-signature-sublabel">{display.sublabel}</span>
        ) : null}
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
          : field.textPurpose === "custom"
            ? "Custom text"
            : role?.kind === "counterparty"
              ? VS01_PREPARE_TITLE_PLACEHOLDER
              : "Title";
    if (isSelected && !busy) {
      return (
        <input
          type={field.type === "email" ? "email" : "text"}
          className="vs01-sign-field-inline-input vs01-sign-placement-text vs01-sign-placement-text--inline"
          value={editValue}
          placeholder={placeholder}
          autoComplete={field.type === "email" ? "email" : field.type === "printed_name" ? "name" : "off"}
          aria-label={prepareTemplateCornerLabel(field.type, role, field.textPurpose)}
          onFocus={() => onInputFocus?.()}
          onChange={(ev) => onValueChange(ev.target.value)}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
        />
      );
    }
    return (
      <span
        className={`vs01-sign-placement-text vs01-sign-placement-text--stacked vs01-sign-placement-body--noninteractive${display.isPlaceholder ? " vs01-sign-placement-ph" : ""}`}
      >
        <span className="vs01-prepare-field-primary">{display.body}</span>
        {display.sublabel ? <span className="vs01-prepare-field-sublabel">{display.sublabel}</span> : null}
      </span>
    );
  }

  if (field.type === "date") {
    const show = formatIsoDateDisplay(resolved) || display.body;
    return (
      <span
        className={`vs01-sign-placement-text vs01-sign-placement-body--noninteractive${display.isPlaceholder ? " vs01-sign-placement-ph" : ""}`}
      >
        {show}
      </span>
    );
  }

  return (
    <span className="vs01-sign-placement-text vs01-sign-placement-body--noninteractive">{display.body}</span>
  );
}
