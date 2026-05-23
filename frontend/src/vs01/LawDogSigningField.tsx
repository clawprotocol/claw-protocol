import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import type { SigningFieldType } from "./signingFields";

export type LawDogSigningFieldProps = {
  fieldType: SigningFieldType;
  signerName?: string | null;
  signerRole?: string | null;
  locked?: boolean;
  required?: boolean;
  active?: boolean;
  value?: string | null;
  initials?: string | null;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className" | "style">;

export const LAWDOG_SIGNING_FIELD_CLASS = "lawdog-signing-field";

export function LawDogSigningField({
  fieldType,
  signerName,
  signerRole,
  locked = false,
  required = false,
  active = false,
  value,
  initials,
  className = "",
  style,
  children,
  ...rest
}: LawDogSigningFieldProps) {
  const classes = [
    LAWDOG_SIGNING_FIELD_CLASS,
    `lawdog-signing-field--${fieldType}`,
    locked ? "lawdog-signing-field--locked" : "lawdog-signing-field--editable",
    required ? "lawdog-signing-field--required" : "lawdog-signing-field--optional",
    active ? "lawdog-signing-field--active" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      {...rest}
      className={classes}
      style={style}
      data-lawdog-signing-field="true"
      data-lawdog-field-type={fieldType}
      data-lawdog-signer-name={(signerName || "").trim()}
      data-lawdog-signer-role={(signerRole || "").trim()}
      data-lawdog-locked={locked ? "true" : "false"}
      data-lawdog-required={required ? "true" : "false"}
      data-lawdog-active={active ? "true" : "false"}
      data-lawdog-has-value={(value || initials || "").trim() ? "true" : "false"}
    >
      {children}
    </div>
  );
}
