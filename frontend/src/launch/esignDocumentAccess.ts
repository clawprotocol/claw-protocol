/**
 * `/app/esign/:documentId` dual-mode access — query-sensitive, fail closed.
 *
 * Owner preparation (`?agreement_bridge=1`) is an authenticated workspace surface.
 * Recipient signing (`?vs01_recipient_sign=1`) is publicly reachable but never
 * publicly readable without a server-validated sign-mode token.
 * Bare, malformed, or ambiguous URLs are not public recipient access.
 */
import { parseAgreementSignPath } from "../agreement/agreementRecipientSigningPaths";
import type { AppRouteAccess } from "./routes";

export const ESIGN_UNAVAILABLE_MESSAGE = "This signing page is unavailable.";
export const ESIGN_AGREEMENT_BRIDGE_QUERY = "agreement_bridge";
export const ESIGN_RECIPIENT_SIGN_QUERY = "vs01_recipient_sign";

export type EsignDocumentMode = "owner_bridge" | "recipient_sign" | "bare" | "ambiguous";

function searchParams(search: string | null | undefined): URLSearchParams {
  const raw = (search || "").startsWith("?") ? (search || "").slice(1) : search || "";
  return new URLSearchParams(raw);
}

function flagOn(params: URLSearchParams, key: string): boolean {
  const raw = (params.get(key) ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function parseEsignDocumentPath(pathname: string): { documentId: string } | null {
  const p = (pathname || "").split("?")[0].replace(/\/$/, "") || "/";
  const m = /^\/app\/esign\/([^/]+)$/.exec(p);
  if (!m) return null;
  const documentId = decodeURIComponent(m[1] || "").trim();
  if (!documentId || documentId === "new") return null;
  return { documentId };
}

export function resolveEsignDocumentMode(search: string | null | undefined): EsignDocumentMode {
  const params = searchParams(search);
  const owner = flagOn(params, ESIGN_AGREEMENT_BRIDGE_QUERY);
  const recipient = flagOn(params, ESIGN_RECIPIENT_SIGN_QUERY);
  if (owner && recipient) return "ambiguous";
  if (owner) return "owner_bridge";
  if (recipient) return "recipient_sign";
  return "bare";
}

export function resolveEsignDocumentAccess(search: string | null | undefined): AppRouteAccess {
  const mode = resolveEsignDocumentMode(search);
  if (mode === "owner_bridge" || mode === "ambiguous") return "authenticated";
  if (mode === "recipient_sign") return "recipient_token";
  return "public";
}

export function buildVs01OwnerBridgeEsignPath(documentId: string): string {
  const did = documentId.trim();
  return `/app/esign/${encodeURIComponent(did)}?${ESIGN_AGREEMENT_BRIDGE_QUERY}=1`;
}

export function buildVs01RecipientSignEsignPath(args: {
  documentId: string;
  agreementId: string;
  token: string;
  recipientIndex: number;
  counterpartyId?: string;
  signerRoleId?: string;
  packetRevision?: string;
}): string {
  const params = new URLSearchParams();
  params.set(ESIGN_RECIPIENT_SIGN_QUERY, "1");
  params.set("document_id", args.documentId.trim());
  params.set("agreement_id", args.agreementId.trim());
  params.set("recipient_index", String(args.recipientIndex));
  params.set("t", args.token.trim());
  const cp = (args.counterpartyId ?? "").trim();
  if (cp) params.set("counterparty_id", cp);
  const role = (args.signerRoleId ?? "").trim();
  if (role) params.set("signer_role_id", role);
  const rev = (args.packetRevision ?? "").trim();
  if (rev) params.set("packet_revision", rev);
  return `/app/esign/${encodeURIComponent(args.documentId.trim())}?${params.toString()}`;
}

export function esignDocumentMustNotParseAsCanonicalSign(pathname: string, search = ""): boolean {
  return parseAgreementSignPath(pathname, search) === null;
}
