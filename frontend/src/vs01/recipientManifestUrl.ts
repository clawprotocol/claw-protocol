/**
 * Embeds recipient placed-field geometry in signing URLs so deep-linked signers
 * can render the same assignments without access to the sender's browser state.
 */
import { defaultRecipientFieldValue } from "./signingFields";
import type { Vs01RecipientFieldType, Vs01RecipientPlacedField } from "./types";

export const VS01_RECIPIENT_MANIFEST_QUERY = "vs01_rmanifest";

const RECIPIENT_TYPES = new Set<Vs01RecipientFieldType>([
  "signature",
  "initials",
  "printed_name",
  "text",
  "email",
  "date",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function utf8ToBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUtf8(s: string): string {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function parseField(raw: unknown): Vs01RecipientPlacedField | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const counterpartyId = typeof raw.counterpartyId === "string" ? raw.counterpartyId.trim() : "";
  const type = raw.type;
  if (!id || !counterpartyId || typeof type !== "string" || !RECIPIENT_TYPES.has(type as Vs01RecipientFieldType)) {
    return null;
  }
  const page = raw.page;
  const x = raw.x;
  const y = raw.y;
  const width = raw.width;
  const height = raw.height;
  if (
    typeof page !== "number" ||
    !Number.isFinite(page) ||
    page < 0 ||
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }
  const value = typeof raw.value === "string" ? raw.value : undefined;
  const autoInitials = raw.autoInitials === true;
  return {
    id,
    counterpartyId,
    type: type as Vs01RecipientFieldType,
    page: Math.floor(page),
    x,
    y,
    width,
    height,
    ...(value !== undefined ? { value } : {}),
    ...(autoInitials ? { autoInitials: true } : {}),
  };
}

export type RecipientManifestDecodeResult =
  | { ok: true; fields: Vs01RecipientPlacedField[] }
  | { ok: false; error: string };

/**
 * Decode manifest from URL query value (base64url JSON array).
 */
export function decodeRecipientManifestParam(paramValue: string | null): RecipientManifestDecodeResult {
  const raw = (paramValue ?? "").trim();
  if (!raw) {
    return { ok: true, fields: [] };
  }
  let text: string;
  try {
    text = base64UrlToUtf8(raw);
  } catch {
    return { ok: false, error: "Signing layout in this link could not be read (invalid encoding)." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: "Signing layout in this link could not be read (invalid data)." };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Signing layout in this link could not be read (expected a field list)." };
  }
  const out: Vs01RecipientPlacedField[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const f = parseField(parsed[i]);
    if (!f) {
      return { ok: false, error: `Signing layout in this link could not be read (invalid field at index ${i}).` };
    }
    out.push(f);
  }
  return { ok: true, fields: out };
}

/**
 * Encode fields for a single recipient into a compact URL param (base64url JSON).
 */
export function encodeRecipientManifestForUrl(fields: Vs01RecipientPlacedField[]): string {
  const minimal = fields.map((f) => ({
    id: f.id,
    counterpartyId: f.counterpartyId,
    type: f.type,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    ...(typeof f.value === "string" ? { value: f.value } : {}),
    ...(f.autoInitials ? { autoInitials: true } : {}),
  }));
  return utf8ToBase64Url(JSON.stringify(minimal));
}

/**
 * Force all hydrated fields to use the active signer id from the URL so filtering never drops geometry.
 */
export function rebindRecipientFieldsToCounterparty(
  fields: Vs01RecipientPlacedField[],
  lockedCounterpartyId: string
): Vs01RecipientPlacedField[] {
  const id = lockedCounterpartyId.trim();
  if (!id) return fields;
  return fields.map((f) => ({ ...f, counterpartyId: id }));
}

/**
 * Fill default display values for printed name / date after hydration (signature and initials stay empty).
 */
export function ensureRecipientFieldDefaults(
  fields: Vs01RecipientPlacedField[],
  recipientDisplayName: string,
  recipientEmail?: string
): Vs01RecipientPlacedField[] {
  const name = recipientDisplayName.trim() || "Recipient";
  const email = (recipientEmail ?? "").trim() || undefined;
  return fields.map((f) => {
    if (typeof f.value === "string" && f.value.length > 0) return f;
    if (f.type === "signature" || f.type === "initials") {
      return { ...f, value: "" };
    }
    return { ...f, value: defaultRecipientFieldValue(f.type, name, email) };
  });
}
