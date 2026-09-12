/**
 * Seed Quick and drafted signing fixtures against the live local backend.
 * External identity/payment/email/model providers are unused; LawDog handlers run.
 */
import { createHash } from "node:crypto";
import { OWNER_ROLE_ID, RECIPIENT_ROLE_ID } from "../../src/launch/simpleProduct/quickPdfEnvelope";
import {
  ESIGN_CONSENT_ACTION,
  ESIGN_CONSENT_INTENT_STATEMENT,
  ESIGN_CONSENT_INTENT_VERSION,
} from "../../src/compliance/disclosureCopy";

export const LIVE_API = (process.env.PHASE4C23_LIVE_API || "http://127.0.0.1:4182").replace(/\/$/, "");
export const LIVE_USER = "phase4c23-live-owner";
export const LIVE_ORG = `user-${LIVE_USER}`;

export const LIVE_PDF = Buffer.from(
  [
    "%PDF-1.1",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj",
    "4 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj",
    "xref",
    "0 5",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000058 00000 n ",
    "0000000115 00000 n ",
    "0000000184 00000 n ",
    "trailer<</Size 5/Root 1 0 R>>",
    "startxref",
    "253",
    "%%EOF",
    "",
  ].join("\n"),
  "utf8",
);

export const LIVE_CONSENT = {
  accepted: true as const,
  intent_version: ESIGN_CONSENT_INTENT_VERSION,
  intent_statement: ESIGN_CONSENT_INTENT_STATEMENT,
  action: ESIGN_CONSENT_ACTION,
};

export type LiveOwnerHeaders = Record<string, string>;

export function liveOwnerHeaders(): LiveOwnerHeaders {
  return {
    "X-Claw-Org-Id": LIVE_ORG,
    "X-Claw-Test-Auth-User-Id": LIVE_USER,
    "Content-Type": "application/json",
  };
}

export async function liveJson(
  method: string,
  path: string,
  opts?: { headers?: Record<string, string>; body?: unknown; query?: Record<string, string> },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL(path.startsWith("http") ? path : `${LIVE_API}${path}`);
  for (const [key, value] of Object.entries(opts?.query || {})) url.searchParams.set(key, value);
  const res = await fetch(url, {
    method,
    headers: opts?.headers || liveOwnerHeaders(),
    body: opts?.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

export async function seedQuickRecipient(): Promise<{
  documentId: string;
  agreementId: string;
  token: string;
  recipientPartyId: string;
  ownerPartyId: string;
  packetRevision: string;
  recipientHref: string;
}> {
  const uploaded = await liveJson("POST", "/v1/documents", {
    body: {
      content_base64: LIVE_PDF.toString("base64"),
      content_type: "application/pdf",
    },
  });
  if (uploaded.status !== 200) throw new Error(`upload failed ${uploaded.status} ${JSON.stringify(uploaded.body)}`);
  const documentId = String(uploaded.body.document_id || "");
  const bind = {
    document_id: documentId,
    content_sha256: String(uploaded.body.content_sha256 || createHash("sha256").update(LIVE_PDF).digest("hex")),
    size_bytes: Number(uploaded.body.size_bytes || LIVE_PDF.length),
    content_type: "application/pdf",
  };
  const created = await liveJson("POST", "/api/agreements/quick-pdf-envelope", {
    body: {
      ...bind,
      owner: { name: "Avery Owner", email: "avery.owner@lawdog.test" },
      recipient: { name: "Riley Recipient", email: "riley.recipient@lawdog.test" },
    },
  });
  if (created.status !== 200) throw new Error(`envelope failed ${created.status} ${JSON.stringify(created.body)}`);
  const env = (created.body.envelope || created.body) as Record<string, unknown>;
  const fields = [
    {
      field_id: "fld_o",
      signer_role_id: OWNER_ROLE_ID,
      field_type: "signature",
      page_index: 1,
      x: 0.1,
      y: 0.7,
      w: 0.3,
      h: 0.1,
    },
    {
      field_id: "fld_r",
      signer_role_id: RECIPIENT_ROLE_ID,
      field_type: "signature",
      page_index: 1,
      x: 0.55,
      y: 0.7,
      w: 0.3,
      h: 0.1,
    },
  ];
  const saved = await liveJson("POST", "/api/agreements/quick-pdf-envelope/fields", {
    body: { ...bind, page_count: 2, fields },
  });
  if (saved.status !== 200) throw new Error(`fields failed ${saved.status} ${JSON.stringify(saved.body)}`);
  const owner = await liveJson("POST", "/api/agreements/quick-pdf-envelope/owner-complete", {
    body: { ...bind, signature_text: "Avery Owner", consent: true, packet_revision: "qpk_1" },
  });
  if (owner.status !== 200) throw new Error(`owner-complete failed ${owner.status} ${JSON.stringify(owner.body)}`);
  const prep = await liveJson("POST", "/api/agreements/quick-pdf-envelope/prepare", { body: bind });
  if (prep.status !== 200) throw new Error(`prepare failed ${prep.status} ${JSON.stringify(prep.body)}`);
  const openPath = String(prep.body.recipient_open_path || "");
  const href = new URL(openPath, "http://127.0.0.1");
  const token = href.searchParams.get("t") || "";
  const agreementId = String(env.agreement_id || href.searchParams.get("agreement_id") || "");
  return {
    documentId,
    agreementId,
    token,
    recipientPartyId: String(env.recipient_party_id || ""),
    ownerPartyId: String(env.owner_party_id || ""),
    packetRevision: String(env.packet_revision || href.searchParams.get("packet_revision") || "qpk_1"),
    recipientHref: openPath.startsWith("http") ? new URL(openPath).pathname + new URL(openPath).search : openPath,
  };
}

export function recipientCompleteBody(args: {
  documentId: string;
  recipientPartyId: string;
  packetRevision?: string;
  signature?: string;
  pageIndex?: number;
}) {
  return {
    signer_role_id: RECIPIENT_ROLE_ID,
    participant_id: args.recipientPartyId,
    document_id: args.documentId,
    display_name: "Riley Recipient",
    packet_revision: args.packetRevision || "qpk_1",
    assigned_fields: [
      {
        field_id: "fld_r",
        field_type: "signature",
        value: args.signature || "Riley Recipient",
        page_index: args.pageIndex ?? 1,
      },
    ],
    consent: LIVE_CONSENT,
  };
}

export async function seedDraftedCeremony(): Promise<{
  agreementId: string;
  token: string;
  lockedVersionId: string;
  signHref: string;
}> {
  const created = await liveJson("POST", "/api/agreements/draft", {
    body: {
      title: "Phase 4C.2.3 live drafted",
      jurisdiction: "TX",
      parties: [
        { name: "Owner LLC", role: "owner" },
        { name: "Acme Growth LLC", role: "signer" },
      ],
      purpose: "Live acceptance",
      payment_terms: "Net 30",
      duration: null,
      due_date: null,
      effective_date: null,
    },
  });
  if (created.status !== 200) throw new Error(`draft failed ${created.status} ${JSON.stringify(created.body)}`);
  const agreementId = String(created.body.id || "");
  const parties = await liveJson("POST", `/api/agreements/${agreementId}/update-field`, {
    body: {
      field: "parties",
      value: [
        { name: "Owner LLC", role: "owner", id: "p-owner" },
        { name: "Acme Growth LLC", role: "signer", id: "p-acme" },
      ],
    },
  });
  if (parties.status !== 200) throw new Error(`parties failed ${parties.status} ${JSON.stringify(parties.body)}`);
  const review = await liveJson("POST", `/api/agreements/${agreementId}/recipient-access-token`, {
    body: { mode: "review", role: "signer", recipient_party_id: "p-acme" },
  });
  if (review.status !== 200) throw new Error(`review token failed ${review.status} ${JSON.stringify(review.body)}`);
  const approved = await liveJson("POST", `/api/agreements/${agreementId}/recipient-approve`, {
    headers: {
      "Content-Type": "application/json",
      "X-Claw-Recipient-Access-Token": String(review.body.token || ""),
    },
    body: { participant_id: "p-acme", participant_display_name: "Acme" },
  });
  if (approved.status !== 200) throw new Error(`approve failed ${approved.status} ${JSON.stringify(approved.body)}`);
  const lockedVersionId = "lv-phase4c23-live";
  const lock = await liveJson("PUT", `/api/agreements/${agreementId}/signing-lock`, {
    body: { locked_version_id: lockedVersionId, locked_at: "2026-09-12T12:00:00Z", locked_by: "owner" },
  });
  if (lock.status !== 200) throw new Error(`lock failed ${lock.status} ${JSON.stringify(lock.body)}`);
  const minted = await liveJson("POST", `/api/agreements/${agreementId}/recipient-access-token`, {
    body: { mode: "sign", role: "signer", recipient_party_id: "p-acme" },
  });
  if (minted.status !== 200) throw new Error(`sign token failed ${minted.status} ${JSON.stringify(minted.body)}`);
  const token = String(minted.body.token || "");
  return {
    agreementId,
    token,
    lockedVersionId,
    signHref: `/agreements/${encodeURIComponent(agreementId)}/sign?t=${encodeURIComponent(token)}`,
  };
}
