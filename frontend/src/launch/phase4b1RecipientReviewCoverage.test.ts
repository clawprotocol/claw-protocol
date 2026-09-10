import { describe, expect, it } from "vitest";
import { isPublicTokenAgreementSurface } from "../account/currentUser";
import { agreementMagicLinkPath, parseAgreementReviewPath } from "../agreement/AgreementRecipientReview";
import { matchAppRoute, routeRequiresAuthenticatedSession } from "./routes";
import {
  PHASE4B1_COVERAGE_AGREEMENT_ID,
  PHASE4B1_COVERAGE_PARTY_ID,
  PHASE4B1_COVERAGE_TOKEN,
  assertPhase4b1RecipientReviewRoutes,
  phase4b1LegacyReviewPath,
  phase4b1PrimaryReviewPath,
} from "./phase4b1RecipientReviewCoverage";

describe("Phase 4B.1 recipient-review route coverage", () => {
  it("fails closed if either runtime-supported review entry loses recipient-token classification", () => {
    expect(() => assertPhase4b1RecipientReviewRoutes()).not.toThrow();

    const id = PHASE4B1_COVERAGE_AGREEMENT_ID;
    const token = PHASE4B1_COVERAGE_TOKEN;
    const party = PHASE4B1_COVERAGE_PARTY_ID;

    expect(phase4b1PrimaryReviewPath(id, token)).toBe(agreementMagicLinkPath(id, token));
    expect(phase4b1PrimaryReviewPath(id, token)).toBe(`/agreements/${id}/review?t=${token}`);
    expect(phase4b1LegacyReviewPath(id, token)).toBe(`/app/agreements/${id}?token=${token}`);

    expect(parseAgreementReviewPath(`/agreements/${id}/review`, `?t=${token}&role=reviewer&p=${party}`)).toEqual({
      agreementId: id,
      token,
      role: "reviewer",
      participantPartyId: party,
    });
    expect(parseAgreementReviewPath(`/app/agreements/${id}`, `?token=${token}&role=reviewer&p=${party}`)).toEqual({
      agreementId: id,
      token,
      role: "reviewer",
      participantPartyId: party,
    });

    expect(matchAppRoute(`/app/agreements/${id}`, `?token=${token}`)?.access).toBe("recipient_token");
    expect(matchAppRoute(`/app/agreements/${id}`, "?token=")?.access).not.toBe("recipient_token");
    expect(isPublicTokenAgreementSurface(`/agreements/${id}/review`)).toBe(true);
    expect(isPublicTokenAgreementSurface(`/app/agreements/${id}`, `?token=${token}`)).toBe(true);
    expect(routeRequiresAuthenticatedSession("recipient_token")).toBe(false);
  });
});
