/**
 * Signer representative name/title normalization — apply only on blur, persist, or bridge build.
 * Never use in controlled-input `onChange` handlers.
 */

export function normalizeSignerMetadataForSave(
  value: string | null | undefined,
): string | undefined {
  const s = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return s || undefined;
}

/** Raw value for controlled inputs (preserves in-progress spaces). */
export function signerMetadataInputRaw(value: string | null | undefined): string {
  return String(value ?? "");
}

export function signerMetadataContainsInternalSpace(value: string): boolean {
  return /\s/.test(value);
}

export function logSignerMetadataInputChange(args: {
  surface: string;
  field: "signerName" | "signerTitle";
  partyIndex?: number;
  raw: string;
}): void {
  const raw = signerMetadataInputRaw(args.raw);
  // eslint-disable-next-line no-console
  console.info("[signer-metadata-input-change]", {
    surface: args.surface,
    field: args.field,
    partyIndex: args.partyIndex ?? null,
    rawLen: raw.length,
    containsSpace: signerMetadataContainsInternalSpace(raw),
  });
}

export function logSignerMetadataNormalizedForSave(args: {
  surface: string;
  field: "signerName" | "signerTitle";
  partyIndex?: number;
  beforeLen: number;
  afterLen: number;
}): void {
  // eslint-disable-next-line no-console
  console.info("[signer-metadata-normalized-for-save]", {
    surface: args.surface,
    field: args.field,
    partyIndex: args.partyIndex ?? null,
    beforeLen: args.beforeLen,
    afterLen: args.afterLen,
  });
}

export function explicitSignerNameForEntity(
  signerName: string | undefined,
  entityName: string,
): string | undefined {
  const sn = normalizeSignerMetadataForSave(signerName);
  if (!sn) return undefined;
  const entity = normalizeSignerMetadataForSave(entityName) ?? "";
  if (entity && sn.toLowerCase() === entity.toLowerCase()) return undefined;
  return sn;
}

/** Live UI / prepare roles: preserve in-progress spaces; only block entity-name collision. */
export function prepareRoleSignerName(
  signerName: string | undefined,
  entityName: string,
): string | undefined {
  const sn = signerMetadataInputRaw(signerName);
  if (!sn) return undefined;
  const entity = signerMetadataInputRaw(entityName);
  if (entity && sn.toLowerCase() === entity.toLowerCase()) return undefined;
  return sn;
}
