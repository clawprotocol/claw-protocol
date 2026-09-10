/**
 * Phase 4B.1 recipient-review coverage — derived from existing route
 * builders/parsers. Fail closed if either runtime-supported review entry
 * loses its recipient-token classification.
 */
import { isPublicTokenAgreementSurface } from "../account/currentUser";
import {
  agreementMagicLinkPath,
  parseAgreementReviewPath,
} from "../agreement/agreementRecipientReviewPaths";
import { matchAppRoute, routeRequiresAuthenticatedSession } from "./routes";

export const PHASE4B1_COVERAGE_AGREEMENT_ID = "ag-phase4b1-orion";
export const PHASE4B1_COVERAGE_TOKEN = "tok-phase4b1-review-a-party0";
export const PHASE4B1_COVERAGE_PARTY_ID = "p-orion";

export function phase4b1PrimaryReviewPath(agreementId: string, token: string): string {
  return agreementMagicLinkPath(agreementId, token);
}

export function phase4b1LegacyReviewPath(agreementId: string, token: string): string {
  return `/app/agreements/${encodeURIComponent(agreementId)}?token=${encodeURIComponent(token)}`;
}

export function assertPhase4b1RecipientReviewRoutes(): void {
  const agreementId = PHASE4B1_COVERAGE_AGREEMENT_ID;
  const token = PHASE4B1_COVERAGE_TOKEN;
  const partyId = PHASE4B1_COVERAGE_PARTY_ID;

  const primary = phase4b1PrimaryReviewPath(agreementId, token);
  if (primary !== `/agreements/${agreementId}/review?t=${token}`) {
    throw new Error(`agreementMagicLinkPath lost the primary review form: ${primary}`);
  }

  const parsedPrimary = parseAgreementReviewPath(
    `/agreements/${agreementId}/review`,
    `?t=${token}&role=reviewer&p=${partyId}`,
  );
  if (
    !parsedPrimary ||
    parsedPrimary.agreementId !== agreementId ||
    parsedPrimary.token !== token ||
    parsedPrimary.role !== "reviewer" ||
    parsedPrimary.participantPartyId !== partyId
  ) {
    throw new Error("primary /agreements/:id/review lost recipient-token, role, or party classification");
  }

  const parsedLegacy = parseAgreementReviewPath(
    `/app/agreements/${agreementId}`,
    `?token=${token}&role=reviewer&p=${partyId}`,
  );
  if (
    !parsedLegacy ||
    parsedLegacy.agreementId !== agreementId ||
    parsedLegacy.token !== token ||
    parsedLegacy.role !== "reviewer" ||
    parsedLegacy.participantPartyId !== partyId
  ) {
    throw new Error("legacy /app/agreements/:id?token= lost recipient-token, role, or party classification");
  }

  const parsedLegacyT = parseAgreementReviewPath(`/app/agreements/${agreementId}`, `?t=${token}`);
  if (!parsedLegacyT || parsedLegacyT.token !== token) {
    throw new Error("legacy /app/agreements/:id?t= lost recipient-token classification");
  }

  if (parseAgreementReviewPath(`/app/agreements/${agreementId}`, "") !== null) {
    throw new Error("legacy /app/agreements/:id without a token must not classify as recipient review");
  }

  const legacyAccess = matchAppRoute(`/app/agreements/${agreementId}`, `?token=${token}`)?.access;
  if (legacyAccess !== "recipient_token") {
    throw new Error(`legacy token route lost recipient_token classification: ${String(legacyAccess)}`);
  }

  const emptyTokenAccess = matchAppRoute(`/app/agreements/${agreementId}`, "?token=")?.access;
  if (emptyTokenAccess === "recipient_token") {
    throw new Error("empty token must not grant recipient_token access");
  }

  if (!isPublicTokenAgreementSurface(`/agreements/${agreementId}/review`)) {
    throw new Error("primary /agreements/:id/review lost public token-surface classification");
  }
  if (!isPublicTokenAgreementSurface(`/app/agreements/${agreementId}`, `?token=${token}`)) {
    throw new Error("legacy token surface lost public token-surface classification");
  }
  if (isPublicTokenAgreementSurface(`/app/agreements/${agreementId}`, "?token=")) {
    throw new Error("empty token must not classify as a public token surface");
  }

  if (routeRequiresAuthenticatedSession("recipient_token")) {
    throw new Error("recipient_token must not require an authenticated LawDog session");
  }
}
