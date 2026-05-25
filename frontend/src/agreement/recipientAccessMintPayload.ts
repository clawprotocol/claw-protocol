/**
 * Canonical POST body for /api/agreements/:id/recipient-access-token (Pydantic-safe).
 */

export type RecipientAccessMintBodyInput = {
  mode?: "sign" | "review";
  role?: "recipient" | "reviewer" | "signer";
  ttl_seconds?: number;
  recipient_party_id?: string;
  inviter_display_name?: string;
  single_use?: boolean;
  recipient_subject?: string;
  /** Paid Pro review-first only: exact frozen corpus used for review-link minting/display. */
  review_first_document_text?: string;
  review_first_document_source?: string;
};

export type RecipientAccessMintBody = {
  mode: "sign" | "review";
  role: "recipient" | "reviewer" | "signer";
  ttl_seconds: number;
  single_use: boolean;
  recipient_party_id?: string;
  inviter_display_name?: string;
  recipient_subject?: string;
  review_first_document_text?: string;
  review_first_document_source?: string;
};

const DEFAULT_TTL = 60 * 60 * 24 * 7;

function trimOpt(s: string | null | undefined, max = 240): string | undefined {
  const t = String(s ?? "").trim();
  if (!t) return undefined;
  return t.slice(0, max);
}

/** Omit null/undefined/empty — backend Optional fields must not receive explicit null. */
export function buildRecipientAccessMintBody(
  input: RecipientAccessMintBodyInput = {},
): RecipientAccessMintBody {
  const mode = input.mode === "review" ? "review" : "sign";
  const role =
    input.role === "reviewer" || input.role === "recipient" || input.role === "signer"
      ? input.role
      : "recipient";
  const ttl =
    typeof input.ttl_seconds === "number" && Number.isFinite(input.ttl_seconds) && input.ttl_seconds > 0
      ? Math.floor(input.ttl_seconds)
      : DEFAULT_TTL;
  const out: RecipientAccessMintBody = {
    mode,
    role,
    ttl_seconds: ttl,
    single_use: Boolean(input.single_use),
  };
  const partyId = trimOpt(input.recipient_party_id, 64);
  const inviter = trimOpt(input.inviter_display_name, 120);
  const subject = trimOpt(input.recipient_subject, 200);
  const reviewFirstDocumentText = trimOpt(input.review_first_document_text, 200_000);
  const reviewFirstDocumentSource = trimOpt(input.review_first_document_source, 80);
  if (partyId) out.recipient_party_id = partyId;
  if (inviter) out.inviter_display_name = inviter;
  if (subject) out.recipient_subject = subject;
  if (mode === "review" && reviewFirstDocumentText) {
    out.review_first_document_text = reviewFirstDocumentText;
    out.review_first_document_source = reviewFirstDocumentSource || "review_first_final_corpus";
  }
  return out;
}

export function logRecipientAccessMintPreflight(args: {
  agreementId: string;
  body: RecipientAccessMintBody;
  recipientCount?: number;
  signerCount?: number;
  hasDocumentText?: boolean;
  documentTextLen?: number;
  hasTitle?: boolean;
  hasPartyLabels?: boolean;
  documentTextSource?: string | null;
}): void {
  if (import.meta.env.MODE === "test") return;
  const id = args.agreementId.trim();
  const short = id.length <= 12 ? id : `${id.slice(0, 8)}…`;
  // eslint-disable-next-line no-console
  console.info("[recipient-access-token-preflight]", {
    agreementIdShort: short,
    recipientCount: args.recipientCount ?? null,
    signerCount: args.signerCount ?? null,
    hasDocumentText: args.hasDocumentText ?? null,
    documentTextLen: args.documentTextLen ?? null,
    documentTextSource: args.documentTextSource ?? null,
    hasTitle: args.hasTitle ?? null,
    hasPartyLabels: args.hasPartyLabels ?? null,
    payloadKeys: Object.keys(args.body),
    mode: args.body.mode,
    role: args.body.role,
  });
}

export const SIGNING_TOKEN_SECRET_NOT_CONFIGURED_CODE = "signing_token_secret_not_configured";

export const SIGNING_TOKEN_SECRET_NOT_CONFIGURED_USER_MESSAGE =
  "Signing links cannot be created on this server: the signing token secret is not configured. " +
  "Set CLAW_AGREEMENT_SIGNING_TOKEN_SECRET in QA/production, then retry.";

export function resolveRecipientAccessMintFailureMessage(args: {
  status: number;
  code?: string | null;
  detail?: string | null;
  message?: string | null;
}): string {
  const code = (args.code ?? "").trim();
  if (code === SIGNING_TOKEN_SECRET_NOT_CONFIGURED_CODE || /signing_token_secret_not_configured/i.test(code)) {
    return SIGNING_TOKEN_SECRET_NOT_CONFIGURED_USER_MESSAGE;
  }
  if (args.status === 422) {
    return "Recipient signing link could not be created (server rejected the request). Check agreement finalization and server configuration.";
  }
  if (args.status === 409) {
    return "Signing is not finalized on the server yet. Wait a moment and try again.";
  }
  const msg = (args.message ?? args.detail ?? "").trim();
  if (msg) return msg.slice(0, 320);
  return "Recipient signing link could not be created. Try again in a moment.";
}

export function logRecipientAccessMint422(detail: unknown, status: number): void {
  if (import.meta.env.MODE === "test") return;
  let code: string | undefined;
  let message: string | undefined;
  if (detail && typeof detail === "object") {
    const o = detail as Record<string, unknown>;
    if (typeof o.code === "string") code = o.code;
    if (typeof o.message === "string") message = o.message.slice(0, 400);
  } else if (typeof detail === "string") {
    message = detail.slice(0, 400);
  }
  // eslint-disable-next-line no-console
  console.warn("[recipient-access-token-422]", {
    status,
    code: code ?? null,
    message: message ?? null,
    detailType: Array.isArray(detail) ? "validation_array" : typeof detail,
  });
}
