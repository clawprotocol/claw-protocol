/**
 * Owner-guarded Quick PDF envelope client. Local state is not authority.
 */
import { ownerApiFetch } from "../../lib/ownerApiClient";
import type { QuickPdfBinding } from "./quickPdfUpload";

export const OWNER_ROLE_ID = "qs_owner";
export const RECIPIENT_ROLE_ID = "qs_recipient";

export type QuickParty = { name: string; email: string };

export type QuickPdfField = {
  field_id: string;
  signer_role_id: string;
  field_type: "signature";
  page_index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  required: boolean;
};

export type QuickEnvelope = {
  document_id: string;
  agreement_id: string;
  content_sha256: string;
  size_bytes: number;
  content_type: string;
  owner_name: string;
  owner_email: string;
  recipient_name: string;
  recipient_email: string;
  owner_party_id: string;
  recipient_party_id: string;
  owner_role_id: string;
  recipient_role_id: string;
  locked: boolean;
  page_count: number;
  fields: QuickPdfField[];
  packet_revision: string;
  delivery_state?: string;
  recipient_link_ready?: boolean;
  recipient_token_jti?: string;
  max_recipients?: number;
};

export type QuickCompletion = {
  owner_signed: boolean;
  recipient_signed: boolean;
  fully_executed: boolean;
  status: string;
  required_signer_count: number;
  completed_signer_count: number;
};

export type QuickReceipt = {
  receipt_id?: string;
  receipt_digest?: string;
  kind?: string;
  document_kind?: string;
  content_sha256?: string;
  packet_revision?: string;
  field_manifest_digest?: string;
  label?: string;
};

export type QuickEnvelopeResult =
  | {
      ok: true;
      envelope: QuickEnvelope;
      completion?: QuickCompletion;
      recipientOpenPath?: string;
      delivery?: { state: string; email: string };
      receipt?: QuickReceipt | null;
    }
  | { ok: false; code: string; message: string };

const MESSAGES: Record<string, string> = {
  invalid_party_name: "Enter each signer’s real name. Placeholders cannot be used.",
  invalid_party_email: "Enter a valid email for each signer.",
  duplicate_party_email: "Owner and recipient need different emails.",
  document_hash_mismatch: "This PDF no longer matches the saved document.",
  document_org_mismatch: "This PDF belongs to a different workspace.",
  unauthorized: "Sign in to continue.",
  forbidden: "This workspace cannot continue with that PDF.",
  envelope_locked: "Fields are locked after the recipient link is prepared.",
  missing_required_signature: "Place a signature field for you and for the recipient.",
  overlapping_field: "Required fields cannot overlap.",
  off_page_field: "A field sits outside the PDF page.",
  malformed_field: "A field is incomplete or off the page.",
  unassigned_field: "Every field must belong to you or the recipient.",
  network: "That step was not saved. Check your connection and try again.",
  unavailable: "We couldn’t continue with this PDF. Try again.",
  agreement_not_fully_executed: "The verification bundle is available after every required signer finishes.",
  receipt_hash_mismatch: "This receipt no longer matches the uploaded PDF.",
  owner_ceremony_incomplete: "Type or draw your signature and confirm you agree before signing.",
  page_count_mismatch: "Placement pages must match the uploaded PDF.",
  packet_revision_mismatch: "This signing packet changed. Reload and sign again.",
};

export function sanitizedEnvelopeMessage(code: string): string {
  return MESSAGES[code] || MESSAGES.unavailable;
}

function detailCode(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as { detail?: unknown; code?: unknown };
  if (typeof d.code === "string") return d.code;
  if (typeof d.detail === "string") return d.detail;
  if (d.detail && typeof d.detail === "object" && "code" in d.detail) {
    return String((d.detail as { code?: unknown }).code || "");
  }
  return "";
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function fail(res: Response, data: Record<string, unknown>): QuickEnvelopeResult {
  const code = res.status === 401 ? "unauthorized" : res.status === 403 ? "forbidden" : detailCode(data) || "unavailable";
  return { ok: false, code, message: sanitizedEnvelopeMessage(code) };
}

function bindingBody(binding: QuickPdfBinding) {
  return {
    document_id: binding.documentId,
    content_sha256: binding.contentSha256,
    size_bytes: binding.sizeBytes,
    content_type: binding.contentType,
  };
}

export function ownerAndRecipientPlaced(fields: QuickPdfField[]): boolean {
  return fields.some((f) => f.signer_role_id === OWNER_ROLE_ID) && fields.some((f) => f.signer_role_id === RECIPIENT_ROLE_ID);
}

export async function createQuickPdfEnvelope(
  binding: QuickPdfBinding,
  owner: QuickParty,
  recipient: QuickParty,
): Promise<QuickEnvelopeResult> {
  let res: Response;
  try {
    res = await ownerApiFetch("/api/agreements/quick-pdf-envelope", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...bindingBody(binding), owner, recipient }),
    });
  } catch {
    return { ok: false, code: "network", message: sanitizedEnvelopeMessage("network") };
  }
  const data = await readJson(res);
  if (!res.ok) return fail(res, data);
  const envelope = data.envelope as QuickEnvelope | undefined;
  if (!envelope?.agreement_id) return { ok: false, code: "unavailable", message: sanitizedEnvelopeMessage("unavailable") };
  return { ok: true, envelope };
}

export async function loadQuickPdfEnvelope(documentId: string): Promise<QuickEnvelopeResult | { ok: true; envelope: null }> {
  let res: Response;
  try {
    res = await ownerApiFetch(`/api/agreements/quick-pdf-envelope?document_id=${encodeURIComponent(documentId)}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    return { ok: false, code: "network", message: sanitizedEnvelopeMessage("network") };
  }
  const data = await readJson(res);
  if (!res.ok) return fail(res, data);
  const envelope = (data.envelope as QuickEnvelope | null) || null;
  if (!envelope) return { ok: true, envelope: null };
  return {
    ok: true,
    envelope,
    completion: data.completion as QuickCompletion | undefined,
    receipt: (data.receipt as QuickReceipt | null) || null,
  };
}

export async function saveQuickPdfFields(
  binding: QuickPdfBinding,
  fields: QuickPdfField[],
  pageCount = 1,
): Promise<QuickEnvelopeResult> {
  let res: Response;
  try {
    res = await ownerApiFetch("/api/agreements/quick-pdf-envelope/fields", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...bindingBody(binding), page_count: pageCount, fields }),
    });
  } catch {
    return { ok: false, code: "network", message: sanitizedEnvelopeMessage("network") };
  }
  const data = await readJson(res);
  if (!res.ok) return fail(res, data);
  return { ok: true, envelope: data.envelope as QuickEnvelope };
}

export async function prepareQuickPdfEnvelope(binding: QuickPdfBinding): Promise<QuickEnvelopeResult> {
  let res: Response;
  try {
    res = await ownerApiFetch("/api/agreements/quick-pdf-envelope/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(bindingBody(binding)),
    });
  } catch {
    return { ok: false, code: "network", message: sanitizedEnvelopeMessage("network") };
  }
  const data = await readJson(res);
  if (!res.ok) return fail(res, data);
  return {
    ok: true,
    envelope: data.envelope as QuickEnvelope,
    recipientOpenPath: String(data.recipient_open_path || ""),
    delivery: data.delivery as { state: string; email: string } | undefined,
  };
}

export async function ownerCompleteQuickPdf(
  binding: QuickPdfBinding,
  ceremony: { signatureText: string; signatureDraw?: string; consent: boolean; packetRevision: string },
): Promise<QuickEnvelopeResult> {
  let res: Response;
  try {
    res = await ownerApiFetch("/api/agreements/quick-pdf-envelope/owner-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        ...bindingBody(binding),
        signature_text: ceremony.signatureText,
        signature_draw: ceremony.signatureDraw || "",
        consent: ceremony.consent,
        packet_revision: ceremony.packetRevision,
      }),
    });
  } catch {
    return { ok: false, code: "network", message: sanitizedEnvelopeMessage("network") };
  }
  const data = await readJson(res);
  if (!res.ok) return fail(res, data);
  return {
    ok: true,
    envelope: data.envelope as QuickEnvelope,
    completion: data.completion as QuickCompletion,
    receipt: (data.receipt as QuickReceipt | null) || null,
  };
}

export async function reissueQuickPdfEnvelope(binding: QuickPdfBinding): Promise<QuickEnvelopeResult> {
  let res: Response;
  try {
    res = await ownerApiFetch("/api/agreements/quick-pdf-envelope/reissue", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(bindingBody(binding)),
    });
  } catch {
    return { ok: false, code: "network", message: sanitizedEnvelopeMessage("network") };
  }
  const data = await readJson(res);
  if (!res.ok) return fail(res, data);
  return {
    ok: true,
    envelope: data.envelope as QuickEnvelope,
    recipientOpenPath: String(data.recipient_open_path || ""),
    delivery: data.delivery as { state: string; email: string } | undefined,
  };
}

export async function loadQuickPdfReceipt(documentId: string): Promise<QuickEnvelopeResult> {
  let res: Response;
  try {
    res = await ownerApiFetch(`/api/agreements/quick-pdf-envelope/receipt?document_id=${encodeURIComponent(documentId)}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    return { ok: false, code: "network", message: sanitizedEnvelopeMessage("network") };
  }
  const data = await readJson(res);
  if (!res.ok) return fail(res, data);
  return {
    ok: true,
    envelope: data.envelope as QuickEnvelope,
    completion: data.completion as QuickCompletion,
    receipt: (data.receipt as QuickReceipt | null) || null,
  };
}

export function tokenHiddenFromText(text: string, openPath: string): boolean {
  const token = new URLSearchParams(openPath.split("?")[1] || "").get("t") || "";
  if (!token) return true;
  return !text.includes(token);
}
