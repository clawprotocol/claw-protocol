/**
 * Reject agreement-body paste / hydration into human signer metadata fields.
 */

export type SignerMetadataField = "signerName" | "signerTitle" | "email";

export type SignerMetadataRejectReason =
  | "too_long"
  | "agreement_prose"
  | "too_many_newlines"
  | "too_many_emails";

export type SignerMetadataInputDecision =
  | { accept: true; value: string }
  | { accept: false; reason: SignerMetadataRejectReason; previous: string };

const MAX_SIGNER_METADATA_LEN = 120;
const AGREEMENT_PROSE_RE =
  /\b(this agreement|definitions|signature blocks?|section\s+\d|in witness whereof|whereas|recitals?)\b/i;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function countEmailsInSignerMetadata(raw: string): number {
  const m = raw.match(EMAIL_RE);
  return m ? m.length : 0;
}

export function signerMetadataLooksLikeAgreementBody(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (t.length > MAX_SIGNER_METADATA_LEN) return true;
  if (AGREEMENT_PROSE_RE.test(t)) return true;
  if ((t.match(/\n/g) || []).length > 3) return true;
  if (countEmailsInSignerMetadata(t) > 3) return true;
  return false;
}

export function evaluateSignerMetadataInput(
  raw: string,
  previous: string,
  field: SignerMetadataField,
): SignerMetadataInputDecision {
  const v = String(raw ?? "");
  const prev = String(previous ?? "");
  if (!v.trim()) return { accept: true, value: "" };
  if (v.length > MAX_SIGNER_METADATA_LEN) {
    return { accept: false, reason: "too_long", previous: prev };
  }
  if (AGREEMENT_PROSE_RE.test(v)) {
    return { accept: false, reason: "agreement_prose", previous: prev };
  }
  if ((v.match(/\n/g) || []).length > 3) {
    return { accept: false, reason: "too_many_newlines", previous: prev };
  }
  const emailCount = countEmailsInSignerMetadata(v);
  const maxEmails = field === "email" ? 1 : 3;
  if (emailCount > maxEmails) {
    return { accept: false, reason: "too_many_emails", previous: prev };
  }
  return { accept: true, value: v };
}

export function logSignerMetadataInputRejected(args: {
  field: SignerMetadataField;
  partyIndex?: number;
  reason: SignerMetadataRejectReason;
  rawLen: number;
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[signer-metadata-input-rejected]", {
    field: args.field,
    partyIndex: args.partyIndex ?? null,
    reason: args.reason,
    rawLen: args.rawLen,
  });
}
