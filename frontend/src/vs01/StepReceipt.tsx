/**
 * Receipt-step helpers: deep links for recipients must include {@link VS01_RECIPIENT_SIGN_QUERY}.
 * (Receipt UI lives in StepDone.tsx; this module stays import-light for bootstrap.)
 */
import type { Vs01RecipientPlacedField } from "./types";
import { encodeRecipientManifestForUrl, VS01_RECIPIENT_MANIFEST_QUERY } from "./recipientManifestUrl";

export const VS01_RECIPIENT_SIGN_QUERY = "vs01_recipient_sign";

const MANIFEST_STORAGE_PREFIX = "claw_vs01_rlink_manifest_";

function manifestStorageKey(documentId: string, counterpartyId: string): string {
  return `${MANIFEST_STORAGE_PREFIX}${documentId.trim()}_${counterpartyId.trim()}`;
}

/** Persist recipient field manifest in sessionStorage so the URL stays short. */
export function storeRecipientManifest(
  documentId: string,
  counterpartyId: string,
  fields: Vs01RecipientPlacedField[],
): void {
  if (typeof window === "undefined") return;
  try {
    const key = manifestStorageKey(documentId, counterpartyId);
    sessionStorage.setItem(key, JSON.stringify(fields));
  } catch { /* quota */ }
}

/** Read manifest previously stored by the sender in the same browser. */
export function loadRecipientManifest(
  documentId: string,
  counterpartyId: string,
): Vs01RecipientPlacedField[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(manifestStorageKey(documentId, counterpartyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Vs01RecipientPlacedField[]) : null;
  } catch {
    return null;
  }
}

export function buildVs01RecipientSigningUrl(opts: {
  recipientIndex: number;
  recipientName: string;
  recipientEmail: string;
  counterpartyId: string;
  documentId: string | null;
  receiptId: string | null;
  /** Fields assigned to this counterparty only; stored in sessionStorage and referenced by token. */
  recipientFieldsForSigner?: Vs01RecipientPlacedField[];
}): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const did = opts.documentId?.trim() ?? "";
  const cpId = opts.counterpartyId.trim();
  const forSigner = opts.recipientFieldsForSigner ?? [];

  if (did && cpId && forSigner.length > 0) {
    storeRecipientManifest(did, cpId, forSigner);
  }

  const params = new URLSearchParams();
  params.set(VS01_RECIPIENT_SIGN_QUERY, "1");
  params.set("recipient_index", String(opts.recipientIndex));
  params.set("recipient_name", opts.recipientName);
  params.set("recipient_email", opts.recipientEmail);
  params.set("counterparty_id", cpId);
  params.set("document_id", did);
  params.set("receipt_id", opts.receiptId?.trim() ?? "");

  if (forSigner.length > 0) {
    const encoded = encodeRecipientManifestForUrl(forSigner);
    if (encoded.length <= 800) {
      params.set(VS01_RECIPIENT_MANIFEST_QUERY, encoded);
    } else {
      params.set("vs01_rmanifest_stored", "1");
    }
  }

  const url = `${origin}${path}?${params.toString()}`;

  if (typeof window !== "undefined" && window.localStorage?.getItem("lawdogVs01FieldDiag") === "1") {
    // eslint-disable-next-line no-console
    console.info("[vs01-recipient-link-build]", {
      documentId: did,
      recipientIndex: opts.recipientIndex,
      fieldCount: forSigner.length,
      urlLength: url.length,
      usesToken: !params.has(VS01_RECIPIENT_MANIFEST_QUERY),
    });
  }

  return url;
}
