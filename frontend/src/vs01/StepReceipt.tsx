/**
 * Receipt-step helpers: deep links for recipients must include {@link VS01_RECIPIENT_SIGN_QUERY}.
 * (Receipt UI lives in StepDone.tsx; this module stays import-light for bootstrap.)
 */
import type { Vs01RecipientPlacedField } from "./types";
import { encodeRecipientManifestForUrl, VS01_RECIPIENT_MANIFEST_QUERY } from "./recipientManifestUrl";

export const VS01_RECIPIENT_SIGN_QUERY = "vs01_recipient_sign";

export function buildVs01RecipientSigningUrl(opts: {
  recipientIndex: number;
  recipientName: string;
  recipientEmail: string;
  counterpartyId: string;
  documentId: string | null;
  receiptId: string | null;
  /** Fields assigned to this counterparty only; embedded so the recipient can render placements without sender state. */
  recipientFieldsForSigner?: Vs01RecipientPlacedField[];
}): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const params = new URLSearchParams();
  params.set(VS01_RECIPIENT_SIGN_QUERY, "1");
  params.set("recipient_index", String(opts.recipientIndex));
  params.set("recipient_name", opts.recipientName);
  params.set("recipient_email", opts.recipientEmail);
  params.set("counterparty_id", opts.counterpartyId);
  params.set("document_id", opts.documentId?.trim() ?? "");
  params.set("receipt_id", opts.receiptId?.trim() ?? "");
  const forSigner = opts.recipientFieldsForSigner ?? [];
  params.set(VS01_RECIPIENT_MANIFEST_QUERY, encodeRecipientManifestForUrl(forSigner));
  return `${origin}${path}?${params.toString()}`;
}
