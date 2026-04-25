/** Shared agreement draft shape (mirrors API `draft` object). */

import type { PaymentRequestPayload } from "./paymentRequestTypes";

export type AgreementParty = { id?: string; name: string; role: string; email?: string; phone?: string };

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
  workspace_archived_at?: string | null;
  /** Proof-layer folder id (flat folders); optional manual filing. */
  workspace_folder_id?: string | null;
  /** Manual searchable labels (trimmed server-side). */
  workspace_tags?: string[];
  /** Stub: persisted for “Send → Pay” UX; no live processor yet. */
  payment_request?: PaymentRequestPayload | null;
  payment_required?: boolean;
};
