/**
 * Phase 4B.4 `/app/esign/:documentId` dual-mode coverage — derived from
 * query-sensitive access resolution. Fail closed if owner bridge is treated
 * as public recipient access, if recipient mode loses public reachability,
 * or if bare/ambiguous URLs become publicly readable.
 */
import { isAuthenticatedDashboardSurface, isPublicTokenAgreementSurface } from "../account/currentUser";
import { parseAgreementSignPath } from "../agreement/agreementRecipientSigningPaths";
import { buildVs01OwnerPrepareEsignPath } from "./vs01OwnerPrepareRoute";
import {
  buildVs01OwnerBridgeEsignPath,
  buildVs01RecipientSignEsignPath,
  parseEsignDocumentPath,
  resolveEsignDocumentAccess,
  resolveEsignDocumentMode,
} from "./esignDocumentAccess";
import { matchAppRoute, routeRequiresAuthenticatedSession } from "./routes";

export const PHASE4B4_COVERAGE_DOCUMENT_ID = "doc-phase4b4-orion";
export const PHASE4B4_COVERAGE_AGREEMENT_ID = "ag-phase4b4-orion";
export const PHASE4B4_COVERAGE_TOKEN = "tok-phase4b4-sign-a-party1";
export const PHASE4B4_COVERAGE_PARTY_ID = "p-contoso";
export const PHASE4B4_COVERAGE_SIGNER_ROLE_ID = "sr-contoso-gc";
export const PHASE4B4_COVERAGE_PACKET_REVISION = "";

export function phase4b4OwnerBridgePath(documentId: string): string {
  return buildVs01OwnerPrepareEsignPath(documentId);
}

export function phase4b4RecipientSignPath(documentId: string, token: string): string {
  return buildVs01RecipientSignEsignPath({
    documentId,
    agreementId: PHASE4B4_COVERAGE_AGREEMENT_ID,
    token,
    recipientIndex: 1,
    counterpartyId: PHASE4B4_COVERAGE_PARTY_ID,
    signerRoleId: PHASE4B4_COVERAGE_SIGNER_ROLE_ID,
  });
}

export function assertPhase4b4EsignDualModeRoutes(): void {
  const documentId = PHASE4B4_COVERAGE_DOCUMENT_ID;
  const token = PHASE4B4_COVERAGE_TOKEN;
  const parsed = parseEsignDocumentPath(`/app/esign/${documentId}`);
  if (!parsed || parsed.documentId !== documentId) {
    throw new Error("parseEsignDocumentPath lost /app/esign/:documentId");
  }
  if (parseEsignDocumentPath("/app/esign/new") !== null) {
    throw new Error("/app/esign/new must not parse as a document surface");
  }
  if (parseEsignDocumentPath(`/agreements/${PHASE4B4_COVERAGE_AGREEMENT_ID}/sign`) !== null) {
    throw new Error("canonical sign path must not parse as /app/esign");
  }

  const ownerPath = phase4b4OwnerBridgePath(documentId);
  if (ownerPath !== buildVs01OwnerBridgeEsignPath(documentId)) {
    throw new Error("owner prepare builder drifted from agreement_bridge=1");
  }
  if (resolveEsignDocumentMode("?agreement_bridge=1") !== "owner_bridge") {
    throw new Error("agreement_bridge=1 lost owner-bridge mode");
  }
  if (resolveEsignDocumentAccess("?agreement_bridge=1") !== "authenticated") {
    throw new Error("owner bridge must require an authenticated session");
  }
  if (isPublicTokenAgreementSurface(`/app/esign/${documentId}`, "?agreement_bridge=1")) {
    throw new Error("owner ?agreement_bridge=1 must not be public recipient access");
  }
  if (!isAuthenticatedDashboardSurface(`/app/esign/${documentId}`, "?agreement_bridge=1")) {
    throw new Error("owner ?agreement_bridge=1 must remain an authenticated surface");
  }
  if (matchAppRoute(`/app/esign/${documentId}`, "?agreement_bridge=1")?.access !== "authenticated") {
    throw new Error("matchAppRoute lost authenticated owner-bridge classification");
  }

  const recipientPath = phase4b4RecipientSignPath(documentId, token);
  if (!recipientPath.includes("vs01_recipient_sign=1") || !recipientPath.includes(`t=${token}`)) {
    throw new Error("recipient path builder lost vs01_recipient_sign or token");
  }
  if (resolveEsignDocumentMode("?vs01_recipient_sign=1") !== "recipient_sign") {
    throw new Error("vs01_recipient_sign=1 lost recipient-sign mode");
  }
  if (resolveEsignDocumentAccess("?vs01_recipient_sign=1") !== "recipient_token") {
    throw new Error("recipient mode must stay publicly reachable");
  }
  if (!isPublicTokenAgreementSurface(`/app/esign/${documentId}`, "?vs01_recipient_sign=1")) {
    throw new Error("recipient ?vs01_recipient_sign=1 lost public reachability");
  }
  if (isAuthenticatedDashboardSurface(`/app/esign/${documentId}`, "?vs01_recipient_sign=1")) {
    throw new Error("recipient mode must not require an owner session");
  }

  if (resolveEsignDocumentMode("") !== "bare" || resolveEsignDocumentAccess("") !== "public") {
    throw new Error("bare /app/esign/:documentId must not be public recipient access");
  }
  if (isPublicTokenAgreementSurface(`/app/esign/${documentId}`)) {
    throw new Error("bare /app/esign/:documentId must not receive public recipient access");
  }
  if (isAuthenticatedDashboardSurface(`/app/esign/${documentId}`)) {
    throw new Error("bare /app/esign/:documentId must not be an authenticated dashboard surface");
  }
  if (matchAppRoute(`/app/esign/${documentId}`)?.access !== "public") {
    throw new Error("bare /app/esign/:documentId lost fail-closed public (non-recipient) access");
  }

  const ambiguous = "?agreement_bridge=1&vs01_recipient_sign=1";
  if (resolveEsignDocumentMode(ambiguous) !== "ambiguous") {
    throw new Error("ambiguous esign query must fail closed");
  }
  if (resolveEsignDocumentAccess(ambiguous) !== "authenticated") {
    throw new Error("ambiguous esign query must not be public recipient access");
  }
  if (isPublicTokenAgreementSurface(`/app/esign/${documentId}`, ambiguous)) {
    throw new Error("ambiguous esign query must not receive public recipient access");
  }

  if (parseAgreementSignPath(`/app/esign/${documentId}`, `?t=${token}`) !== null) {
    throw new Error("/app/esign must not parse as the canonical /agreements/:id/sign path");
  }
  if (routeRequiresAuthenticatedSession("recipient_token")) {
    throw new Error("recipient_token must not require an authenticated LawDog session");
  }
}
