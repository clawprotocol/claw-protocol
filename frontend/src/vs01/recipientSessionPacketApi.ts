/**
 * Phase 3C2B: cookie-authenticated recipient session packet projection.
 */

export type RecipientSessionPacketFieldType =
  | "signature"
  | "initials"
  | "printed_name"
  | "text"
  | "email"
  | "date";

export type RecipientSessionPacketField = {
  id: string;
  type: RecipientSessionPacketFieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  autoInitials?: boolean;
  value?: string;
};

export type RecipientSessionPacketReadiness =
  | "ready_for_review"
  | "ready_for_signing"
  | "signer_complete";

export type RecipientSessionPacketProjection = {
  ok: boolean;
  v: number;
  document_id?: string;
  document_label: string;
  accepted_version_id: string;
  accepted_corpus_sha256: string;
  packet_revision: string;
  signer_record_id: string;
  signer_role_id: string;
  party_id: string;
  signer_display_name: string;
  signer_title?: string;
  corpus_plain: string;
  corpus_hash: string;
  fields: RecipientSessionPacketField[];
  page_count: number;
  witness_page_index: number;
  initials_policy: {
    enabled: boolean;
    bodyPagesOnly: boolean;
  };
  readiness: RecipientSessionPacketReadiness;
  signer_complete?: boolean;
  finish_ready?: boolean;
  field_values?: Record<string, string>;
  field_revisions?: Record<string, number>;
};

export type RecipientSessionPacketFailureKind = "authority" | "network" | "malformed";

export type RecipientSessionPacketResult =
  | { ok: true; projection: RecipientSessionPacketProjection }
  | { ok: false; code: string; message: string; kind: RecipientSessionPacketFailureKind };

const GENERIC_FAILURE_MESSAGE =
  "This signing link is invalid, expired, or no longer available.";

const NETWORK_FAILURE_MESSAGE =
  "We could not load this agreement right now. Check your connection and try again.";

const SUPPORTED_FIELD_TYPES = new Set<RecipientSessionPacketFieldType>([
  "signature",
  "initials",
  "printed_name",
  "text",
  "email",
  "date",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegativeInt(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function parseInitialsPolicy(value: unknown): RecipientSessionPacketProjection["initials_policy"] | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.enabled !== "boolean" || typeof value.bodyPagesOnly !== "boolean") {
    return null;
  }
  return {
    enabled: value.enabled,
    bodyPagesOnly: value.bodyPagesOnly,
  };
}

function parseField(
  raw: unknown,
  pageCount: number,
  seenIds: Set<string>,
): RecipientSessionPacketField | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (!nonEmptyString(raw.id) || seenIds.has(raw.id.trim())) {
    return null;
  }
  const typeRaw = raw.type;
  if (typeof typeRaw !== "string" || !SUPPORTED_FIELD_TYPES.has(typeRaw as RecipientSessionPacketFieldType)) {
    return null;
  }
  if (!nonNegativeInt(raw.page) || raw.page >= pageCount) {
    return null;
  }
  if (!finiteNumber(raw.x) || !finiteNumber(raw.y) || !finiteNumber(raw.width) || !finiteNumber(raw.height)) {
    return null;
  }
  const page = raw.page;
  const x = raw.x;
  const y = raw.y;
  const width = raw.width;
  const height = raw.height;
  if (width <= 0 || height <= 0) {
    return null;
  }
  if (x < 0 || x > 1 || y < 0 || y > 1 || width > 1 || height > 1) {
    return null;
  }
  if (x + width > 1.000001 || y + height > 1.000001) {
    return null;
  }
  if (raw.autoInitials !== undefined && typeof raw.autoInitials !== "boolean") {
    return null;
  }
  seenIds.add(raw.id.trim());
  const field: RecipientSessionPacketField = {
    id: raw.id.trim(),
    type: typeRaw as RecipientSessionPacketFieldType,
    page,
    x,
    y,
    width,
    height,
  };
  if (typeof raw.autoInitials === "boolean") {
    field.autoInitials = raw.autoInitials;
  }
  if (raw.value !== undefined) {
    if (typeof raw.value !== "string") {
      return null;
    }
    field.value = raw.value;
  }
  return field;
}

export function parseRecipientSessionPacketProjection(
  body: Record<string, unknown>,
): RecipientSessionPacketProjection | null {
  if (body.ok !== true || body.v !== 1) {
    return null;
  }
  const readinessRaw = body.readiness;
  if (
    readinessRaw !== "ready_for_review" &&
    readinessRaw !== "ready_for_signing" &&
    readinessRaw !== "signer_complete"
  ) {
    return null;
  }
  if (
    !nonEmptyString(body.document_label) ||
    !nonEmptyString(body.accepted_version_id) ||
    !nonEmptyString(body.accepted_corpus_sha256) ||
    !nonEmptyString(body.packet_revision) ||
    !nonEmptyString(body.signer_record_id) ||
    !nonEmptyString(body.signer_role_id) ||
    !nonEmptyString(body.party_id) ||
    !nonEmptyString(body.signer_display_name) ||
    !nonEmptyString(body.corpus_plain) ||
    !nonEmptyString(body.corpus_hash)
  ) {
    return null;
  }
  if (!body.corpus_plain.trim()) {
    return null;
  }
  if (!nonNegativeInt(body.page_count) || body.page_count <= 0) {
    return null;
  }
  if (!nonNegativeInt(body.witness_page_index) || body.witness_page_index >= body.page_count) {
    return null;
  }
  const initialsPolicy = parseInitialsPolicy(body.initials_policy);
  if (!initialsPolicy) {
    return null;
  }
  if (!Array.isArray(body.fields)) {
    return null;
  }
  const seenIds = new Set<string>();
  const fields: RecipientSessionPacketField[] = [];
  for (const rawField of body.fields) {
    const parsed = parseField(rawField, body.page_count, seenIds);
    if (!parsed) {
      return null;
    }
    fields.push(parsed);
  }
  const projection: RecipientSessionPacketProjection = {
    ok: true,
    v: 1,
    document_label: body.document_label.trim(),
    accepted_version_id: body.accepted_version_id.trim(),
    accepted_corpus_sha256: body.accepted_corpus_sha256.trim(),
    packet_revision: body.packet_revision.trim(),
    signer_record_id: body.signer_record_id.trim(),
    signer_role_id: body.signer_role_id.trim(),
    party_id: body.party_id.trim(),
    signer_display_name: body.signer_display_name.trim(),
    corpus_plain: body.corpus_plain,
    corpus_hash: body.corpus_hash.trim(),
    fields,
    page_count: body.page_count,
    witness_page_index: body.witness_page_index,
    initials_policy: initialsPolicy,
    readiness: readinessRaw,
  };
  if (body.document_id !== undefined) {
    if (!nonEmptyString(body.document_id)) return null;
    projection.document_id = body.document_id.trim();
  }
  if (body.signer_complete !== undefined) {
    if (typeof body.signer_complete !== "boolean") return null;
    projection.signer_complete = body.signer_complete;
  }
  if (body.finish_ready !== undefined) {
    if (typeof body.finish_ready !== "boolean") return null;
    projection.finish_ready = body.finish_ready;
  }
  if (body.field_values !== undefined) {
    if (!isRecord(body.field_values)) return null;
    const fieldValues: Record<string, string> = {};
    for (const [key, val] of Object.entries(body.field_values)) {
      if (typeof val !== "string") return null;
      fieldValues[key] = val;
    }
    projection.field_values = fieldValues;
  }
  if (body.field_revisions !== undefined) {
    if (!isRecord(body.field_revisions)) return null;
    const fieldRevisions: Record<string, number> = {};
    for (const [key, val] of Object.entries(body.field_revisions)) {
      if (typeof val !== "number" || !Number.isInteger(val) || val < 0) return null;
      fieldRevisions[key] = val;
    }
    projection.field_revisions = fieldRevisions;
  }
  if (body.signer_title !== undefined) {
    if (typeof body.signer_title !== "string") {
      return null;
    }
    projection.signer_title = body.signer_title.trim();
  }
  return projection;
}

export async function fetchRecipientSessionPacket(): Promise<RecipientSessionPacketResult> {
  let res: Response;
  try {
    res = await fetch("/api/recipient/session/packet", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      code: "network_error",
      message: NETWORK_FAILURE_MESSAGE,
      kind: "network",
    };
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      code: "network_error",
      message: NETWORK_FAILURE_MESSAGE,
      kind: "network",
    };
  }
  if (!res.ok) {
    const detail = isRecord(body.detail) ? body.detail : body;
    return {
      ok: false,
      code: String(detail.code ?? "bootstrap_invalid_or_expired"),
      message: String(detail.message ?? GENERIC_FAILURE_MESSAGE),
      kind: "authority",
    };
  }
  const projection = parseRecipientSessionPacketProjection(body);
  if (!projection) {
    return {
      ok: false,
      code: "packet_parse_failed",
      message: GENERIC_FAILURE_MESSAGE,
      kind: "malformed",
    };
  }
  return { ok: true, projection };
}
