/**
 * Phase 4B.2 recipient-signing coverage — derived from existing route
 * builders/parsers. Fail closed if `/agreements/:id/sign` loses public
 * recipient-token treatment.
 */
import { isPublicTokenAgreementSurface } from "../account/currentUser";
import {
  agreementSigningPath,
  parseAgreementSignPath,
} from "../agreement/agreementRecipientSigningPaths";
import { routeRequiresAuthenticatedSession } from "./routes";

export const PHASE4B2_COVERAGE_AGREEMENT_ID = "ag-phase4b2-orion";
export const PHASE4B2_COVERAGE_TOKEN = "tok-phase4b2-sign-a-party0";
export const PHASE4B2_COVERAGE_PARTY_ID = "p-orion";
export const PHASE4B2_COVERAGE_LOCKED_VERSION = "lv-phase4b2-orion-v1";

export function phase4b2SigningPath(agreementId: string, token: string, partyId?: string): string {
  return agreementSigningPath(agreementId, PHASE4B2_COVERAGE_LOCKED_VERSION, token, partyId);
}

export function assertPhase4b2RecipientSigningRoutes(): void {
  const agreementId = PHASE4B2_COVERAGE_AGREEMENT_ID;
  const token = PHASE4B2_COVERAGE_TOKEN;
  const partyId = PHASE4B2_COVERAGE_PARTY_ID;
  const lockedVersionId = PHASE4B2_COVERAGE_LOCKED_VERSION;

  const primary = phase4b2SigningPath(agreementId, token, partyId);
  const expected = `/agreements/${agreementId}/sign?t=${token}&p=${partyId}`;
  if (primary !== expected) {
    throw new Error(`agreementSigningPath lost the canonical sign form: ${primary}`);
  }

  const parsed = parseAgreementSignPath(`/agreements/${agreementId}/sign`, `?t=${token}&p=${partyId}`);
  if (!parsed || parsed.agreementId !== agreementId || parsed.token !== token || parsed.participantPartyId !== partyId) {
    throw new Error("parseAgreementSignPath lost recipient-token or party classification");
  }

  const parsedBare = parseAgreementSignPath(`/agreements/${agreementId}/sign`, "");
  if (!parsedBare || parsedBare.agreementId !== agreementId || parsedBare.token) {
    throw new Error("bare /agreements/:id/sign must still classify as the sign surface");
  }

  const parsedLegacyV = parseAgreementSignPath(
    `/agreements/${agreementId}/sign`,
    `?v=${lockedVersionId}&p=${partyId}`,
  );
  if (!parsedLegacyV || parsedLegacyV.versionId !== lockedVersionId || parsedLegacyV.token) {
    throw new Error("legacy ?v= sign parse lost version or invented a token");
  }

  if (parseAgreementSignPath(`/agreements/${agreementId}/review`, `?t=${token}`) !== null) {
    throw new Error("review path must not parse as a sign path");
  }
  if (parseAgreementSignPath(`/app/esign/${agreementId}`, `?t=${token}`) !== null) {
    throw new Error("/app/esign must not parse as the canonical sign path");
  }

  if (!isPublicTokenAgreementSurface(`/agreements/${agreementId}/sign`)) {
    throw new Error("/agreements/:id/sign lost public recipient-token treatment");
  }
  if (!isPublicTokenAgreementSurface(`/agreements/${agreementId}/sign`, `?t=${token}`)) {
    throw new Error("tokened /agreements/:id/sign lost public recipient-token treatment");
  }
  if (routeRequiresAuthenticatedSession("recipient_token")) {
    throw new Error("recipient_token must not require an authenticated LawDog session");
  }
}
