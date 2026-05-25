/**
 * Receipt-step helpers: deep links for recipients must include {@link VS01_RECIPIENT_SIGN_QUERY}.
 * (Receipt UI lives in StepDone.tsx; this module stays import-light for bootstrap.)
 */
import type { Vs01RecipientPlacedField } from "./types";
import { encodeRecipientManifestForUrl, VS01_RECIPIENT_MANIFEST_QUERY } from "./recipientManifestUrl";
import {
  VS01_CANONICAL_PACKET_QUERY,
  VS01_CANONICAL_PACKET_STORED_QUERY,
  VS01_PACKET_REVISION_QUERY,
} from "./vs01CanonicalPacketSeed";

export const VS01_RECIPIENT_SIGN_QUERY = "vs01_recipient_sign";

const MANIFEST_STORAGE_PREFIX = "claw_vs01_rlink_manifest_";
const MANIFEST_LS_PREFIX = "claw_vs01_rlink_ls_manifest_";

/** Document-scoped full-packet manifest (all signers) for recipient signing view. */
export const VS01_PACKET_MANIFEST_SCOPE = "__packet__";

function manifestStorageKey(documentId: string, counterpartyId: string): string {
  return `${MANIFEST_STORAGE_PREFIX}${documentId.trim()}_${counterpartyId.trim()}`;
}

function manifestLsKey(documentId: string, counterpartyId: string): string {
  return `${MANIFEST_LS_PREFIX}${documentId.trim()}_${counterpartyId.trim()}`;
}

/** Persist recipient field manifest in both sessionStorage (fast) and localStorage (durable). */
export function storeRecipientManifest(
  documentId: string,
  counterpartyId: string,
  fields: Vs01RecipientPlacedField[],
): void {
  if (typeof window === "undefined") return;
  const key = manifestStorageKey(documentId, counterpartyId);
  const lsKey = manifestLsKey(documentId, counterpartyId);
  const json = JSON.stringify(fields);
  try { sessionStorage.setItem(key, json); } catch { /* quota */ }
  try { localStorage.setItem(lsKey, json); } catch { /* quota */ }
}

/** Read manifest previously stored by the sender — tries sessionStorage then localStorage. */
export function loadRecipientManifest(
  documentId: string,
  counterpartyId: string,
): Vs01RecipientPlacedField[] | null {
  if (typeof window === "undefined") return null;
  const key = manifestStorageKey(documentId, counterpartyId);
  const lsKey = manifestLsKey(documentId, counterpartyId);
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(key); } catch { /* ignore */ }
  if (!raw) {
    try { raw = localStorage.getItem(lsKey); } catch { /* ignore */ }
  }
  if (!raw) return null;
  try {
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
  /** LawDog agreement id — scopes signer role ids for recipient execution (query only). */
  agreementId?: string | null;
  /** Stable role id from prepare flow; recipient UI hides other signers’ fields. */
  signerRoleId?: string | null;
  /** Portable canonical packet payload for cross-device signers (inline only when short). */
  canonicalPacketPayload?: string | null;
  /** When true, portable packet was stored locally; URL carries vs01_cpacket_stored=1. */
  canonicalPacketStored?: boolean;
  /** Revision token matching stored portable packet (initials toggle / field rebuild). */
  packetRevision?: string | null;
}): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const did = opts.documentId?.trim() ?? "";
  const cpId = opts.counterpartyId.trim();
  const forSigner = opts.recipientFieldsForSigner ?? [];

  if (did && forSigner.length > 0) {
    const distinctCp = new Set(forSigner.map((f) => f.counterpartyId.trim()).filter(Boolean));
    if (distinctCp.size > 1) {
      storeRecipientManifest(did, VS01_PACKET_MANIFEST_SCOPE, forSigner);
    } else if (cpId) {
      storeRecipientManifest(did, cpId, forSigner);
    }
  }

  const params = new URLSearchParams();
  params.set(VS01_RECIPIENT_SIGN_QUERY, "1");
  params.set("recipient_index", String(opts.recipientIndex));
  params.set("recipient_name", opts.recipientName);
  params.set("recipient_email", opts.recipientEmail);
  params.set("counterparty_id", cpId);
  params.set("document_id", did);
  params.set("receipt_id", opts.receiptId?.trim() ?? "");

  const aid = opts.agreementId?.trim() ?? "";
  if (aid) params.set("agreement_id", aid);
  const srid = opts.signerRoleId?.trim() ?? "";
  if (srid) params.set("signer_role_id", srid);
  params.set("assigned_party_index", String(opts.recipientIndex));

  if (forSigner.length > 0) {
    const encoded = encodeRecipientManifestForUrl(forSigner);
    if (encoded.length <= 800) {
      params.set(VS01_RECIPIENT_MANIFEST_QUERY, encoded);
    } else {
      params.set("vs01_rmanifest_stored", "1");
    }
  }

  const canonicalPacketPayload = (opts.canonicalPacketPayload ?? "").trim();
  const packetRevision = (opts.packetRevision ?? "").trim();
  if (packetRevision) params.set(VS01_PACKET_REVISION_QUERY, packetRevision);
  if (opts.canonicalPacketStored) {
    params.set(VS01_CANONICAL_PACKET_STORED_QUERY, "1");
  } else if (canonicalPacketPayload) {
    params.set(VS01_CANONICAL_PACKET_QUERY, canonicalPacketPayload);
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
      hasAgreementId: Boolean(aid),
      signerRoleIdShort: srid ? srid.slice(0, 16) : null,
      canonicalStored: Boolean(opts.canonicalPacketStored),
      hasPacketRevision: Boolean(packetRevision),
    });
  }

  return url;
}
