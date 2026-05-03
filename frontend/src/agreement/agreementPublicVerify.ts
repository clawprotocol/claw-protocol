import { apiUrl } from "../lib/clawApi";

export type PublicVerifySignatureEvent = {
  event_type: string;
  at?: string;
  agreement_version_hash?: string;
  locked_version_id?: string;
  participant_display_name?: string;
  typed_name?: string;
  fully_executed?: boolean;
};

export type PublicVerifyPayload = {
  agreement_id: string;
  /** Backend may return this when proof/hash assembly is incomplete (still HTTP 200). */
  record_status?: string;
  record_status_reason?: string;
  summary: {
    title?: string;
    jurisdiction?: string;
    created_at?: string;
    updated_at?: string;
    status?: string;
    review_sent_at?: string | null;
  };
  participants: Array<{ name?: string; role?: string }>;
  version_history: Array<{
    version: number;
    created_at: string;
    note?: string | null;
    version_hash: string;
  }>;
  signature_status: {
    fully_executed?: boolean;
    signatures_recorded?: number;
    signer_party_count?: number;
    locked_version_id?: string | null;
    signing_commitment_hash?: string | null;
  };
  signature_events: PublicVerifySignatureEvent[];
  verification: {
    agreement_hash: string;
    signing_commitment_hash?: string | null;
    schema?: string;
    record_note?: string;
  };
  claw_feed?: {
    event_type?: string;
    at?: string;
    summary?: string;
    anchor_network?: string;
    anchor_status?: string;
    anchor_txid?: string | null;
    batch_id?: string | null;
  } | null;
  settlement_anchor?: {
    network_hint?: string;
    note?: string;
  };
};

/** Public shareable URL path (short `/verify/…` for sharing; legacy `/app/verify/…` still parsed). */
export function agreementPublicVerifyPath(agreementId: string): string {
  return `/verify/${encodeURIComponent(agreementId)}`;
}

export function parseAgreementVerifyPath(pathname: string): { agreementId: string } | null {
  const p = pathname.replace(/\/$/, "");
  let m = p.match(/^\/app\/verify\/([^/]+)$/);
  if (!m) m = p.match(/^\/verify\/([^/]+)$/);
  if (!m) return null;
  return { agreementId: decodeURIComponent(m[1]) };
}

export async function fetchPublicAgreementVerify(agreementId: string): Promise<PublicVerifyPayload | null> {
  const id = (agreementId || "").trim();
  if (!id) return null;
  try {
    const res = await fetch(apiUrl(`/api/agreements/public/${encodeURIComponent(id)}/verify`));
    if (!res.ok) return null;
    return (await res.json()) as PublicVerifyPayload;
  } catch {
    return null;
  }
}
