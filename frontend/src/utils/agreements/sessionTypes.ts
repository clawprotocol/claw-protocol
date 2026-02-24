import type { DraftState } from "../../components/AgreementBuilderChat";

export type Revision = {
  revision_id: string;
  label: string;
  source: "chat" | "parties" | "manual" | "system";
  created_at: number;
  draft: DraftState;
  version_hash: string;
};

export type CommentThread = {
  id: string;
  quote: string;
  start?: number;
  end?: number;
  note: string;
  resolved: boolean;
  created_at: number;
  updated_at: number;
};

export type SignatureRecord = {
  id: string;
  name: string;
  signed_at: string;
  revision_id: string;
  revision_hash: string;
};

export type AuditEvent = {
  id: string;
  type:
    | "draft_updated"
    | "revision_saved"
    | "comment_added"
    | "comment_resolved"
    | "signature_added"
    | "export_generated"
    | "review_requested"
    | "system";
  message: string;
  created_at: number;
  meta?: Record<string, unknown>;
};

export type AgreementSession = {
  session_id: string;
  agreement_id?: string | null;
  current: DraftState;
  escrow: {
    mode: "real_estate_escrow" | "crypto_escrow" | "external_manual" | "none";
    provider_name?: string;
    provider_url?: string;
    notes?: string;
  };
  version_hash: string;
  revisions: Revision[];
  comments: CommentThread[];
  signatures: SignatureRecord[];
  audit: AuditEvent[];
  updated_at: number;
};

