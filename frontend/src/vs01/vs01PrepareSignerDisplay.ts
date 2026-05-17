import type { Vs01FieldValueMode } from "./vs01FieldValueResolution";
import type { Vs01SignerRuntimeContext } from "./vs01FieldValueResolution";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { vs01DiagnosticsEnabled } from "./vs01SignerFieldAssignment";

export const VS01_PREPARE_SIGNER_NAME_PLACEHOLDER = "Signer name";
export const VS01_PREPARE_TITLE_PLACEHOLDER = "Title";
export const VS01_PREPARE_INITIALS_PLACEHOLDER = "Initials";

/** True when intake explicitly provided a human signer representative name (not entity-only). */
export function isKnownPrepareSignerName(role: Vs01PrepareSigningRole): boolean {
  return Boolean((role.signerName ?? "").trim());
}

export function logVs01SignerNameSource(payload: Record<string, unknown>): void {
  if (!vs01DiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-signer-name-source]", payload);
}

export function logVs01TitleSource(payload: Record<string, unknown>): void {
  if (!vs01DiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-title-source]", payload);
}

/**
 * Resolve printed-name / display signer label for prepare template and stored values.
 * Entity party name ({@link Vs01PrepareSigningRole.partyName}) is never used as signer name unless
 * explicitly provided as {@link Vs01PrepareSigningRole.signerName}.
 */
export function resolvePrepareSignerDisplayName(
  role: Vs01PrepareSigningRole,
  mode: Vs01FieldValueMode,
  ownerPad?: Vs01SignerRuntimeContext,
): { value: string; source: string; isPlaceholder: boolean } {
  if (role.kind === "owner") {
    const fromPad = (ownerPad?.typedName ?? "").trim();
    const source = fromPad ? "owner_pad" : "empty";
    logVs01SignerNameSource({
      mode,
      roleKind: role.kind,
      partyId: role.partyId,
      source,
      knownSignerName: Boolean(fromPad),
    });
    return { value: fromPad, source, isPlaceholder: !fromPad };
  }

  const known = (role.signerName ?? "").trim();
  if (known) {
    logVs01SignerNameSource({
      mode,
      roleKind: role.kind,
      partyId: role.partyId,
      source: "role_signer_name",
      knownSignerName: true,
    });
    return { value: known, source: "role_signer_name", isPlaceholder: false };
  }

  logVs01SignerNameSource({
    mode,
    roleKind: role.kind,
    partyId: role.partyId,
    source: "runtime_placeholder",
    knownSignerName: false,
    partyName: role.partyName,
  });
  if (mode === "prepare_stored" || mode === "recipient_runtime") {
    return { value: "", source: "runtime_placeholder", isPlaceholder: true };
  }
  return {
    value: VS01_PREPARE_SIGNER_NAME_PLACEHOLDER,
    source: "runtime_placeholder",
    isPlaceholder: true,
  };
}

/** Title for prepare text fields — only from explicit signerTitle; never invented. */
export function resolvePrepareSignerTitleDisplay(
  role: Vs01PrepareSigningRole,
  mode: Vs01FieldValueMode,
): { value: string; source: string; isPlaceholder: boolean } {
  const known = (role.signerTitle ?? "").trim();
  if (known) {
    logVs01TitleSource({
      mode,
      roleKind: role.kind,
      partyId: role.partyId,
      source: "role_signer_title",
      knownTitle: true,
    });
    return { value: known, source: "role_signer_title", isPlaceholder: false };
  }
  logVs01TitleSource({
    mode,
    roleKind: role.kind,
    partyId: role.partyId,
    source: "blank_placeholder",
    knownTitle: false,
  });
  if (mode === "prepare_stored" || mode === "recipient_runtime") {
    return { value: "", source: "blank_placeholder", isPlaceholder: true };
  }
  return {
    value: VS01_PREPARE_TITLE_PLACEHOLDER,
    source: "blank_placeholder",
    isPlaceholder: true,
  };
}

export function initialsFromSignerName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

/** Display-only initials label for prepare (not legal stored value). */
export function resolvePrepareInitialsDisplayLabel(
  role: Vs01PrepareSigningRole,
  ownerPad?: Vs01SignerRuntimeContext,
): { label: string; isPlaceholder: boolean; source: string } {
  if (role.kind === "owner") {
    const fromPad = (ownerPad?.initials ?? "").trim();
    if (fromPad) return { label: fromPad.slice(0, 8), isPlaceholder: false, source: "owner_pad" };
    const fromName = (ownerPad?.typedName ?? "").trim();
    if (fromName) {
      return {
        label: initialsFromSignerName(fromName).slice(0, 8),
        isPlaceholder: false,
        source: "owner_name_derived",
      };
    }
    return { label: "Your initials", isPlaceholder: true, source: "owner_empty" };
  }
  const signer = (role.signerName ?? "").trim();
  if (signer) {
    return {
      label: initialsFromSignerName(signer).slice(0, 8),
      isPlaceholder: false,
      source: "signer_name_derived",
    };
  }
  return { label: VS01_PREPARE_INITIALS_PLACEHOLDER, isPlaceholder: true, source: "counterparty_placeholder" };
}
