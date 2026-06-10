/** Shared agreement draft shape (mirrors API `draft` object). */

import type { PaymentRequestPayload } from "./paymentRequestTypes";

export type AgreementParty = {
  id?: string;
  name: string;
  role: string;
  email?: string;
  phone?: string;
  /** Human authorized signer (never implied from {@link name} / entity). */
  signerName?: string;
  signerTitle?: string;
  signerEmail?: string;
  /** Review / comment thread email when distinct from signing. */
  reviewEmail?: string;
};

export type AgreementDraft = {
  id: string;
  title: string;
  jurisdiction: string;
  parties: AgreementParty[];
  purpose: string;
  payment_terms: string;
  duration: string | null;
  due_date: string | null;
  effective_date: string | null;
  created_at: string;
  updated_at: string;
  versions: Array<{ version: number; created_at: string; note?: string | null }>;
  audit_log: Array<{ event_type: string; at: string; field?: string | null; value?: unknown }>;
  review_sent_at?: string | null;
  /** ISO timestamp when review invite emails were successfully sent (idempotency guard). */
  review_invite_emails_sent_at?: string | null;
  workspace_archived_at?: string | null;
  /** Proof-layer folder id (flat folders); optional manual filing. */
  workspace_folder_id?: string | null;
  /** Manual searchable labels (trimmed server-side). */
  workspace_tags?: string[];
  /** Stub: persisted for “Send → Pay” UX; no live processor yet. */
  payment_request?: PaymentRequestPayload | null;
  payment_required?: boolean;
  /** Client-side render routing hint from API draft JSON (not always present on older payloads). */
  premium_render_source?: string | null;
  /** Optional: authoritative Pro / full-draft plain text (mirrors API draft JSON when present). */
  premium_full_document_text?: string | null;
  premium_server_full_document_text?: string | null;
  server_full_document_text?: string | null;
  document_text?: string | null;
  rendered_document_text?: string | null;
  /** Pro review redline v1 (server JSON); optional. */
  pro_redline_v1?: Record<string, unknown> | null;
};
