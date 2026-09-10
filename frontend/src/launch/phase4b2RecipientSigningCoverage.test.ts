import { describe, expect, it } from "vitest";
import { isPublicTokenAgreementSurface } from "../account/currentUser";
import { agreementSigningPath, parseAgreementSignPath } from "../agreement/agreementRecipientSigningPaths";
import { routeRequiresAuthenticatedSession } from "./routes";
import {
  PHASE4B2_COVERAGE_AGREEMENT_ID,
  PHASE4B2_COVERAGE_LOCKED_VERSION,
  PHASE4B2_COVERAGE_PARTY_ID,
  PHASE4B2_COVERAGE_TOKEN,
  assertPhase4b2RecipientSigningRoutes,
  phase4b2SigningPath,
} from "./phase4b2RecipientSigningCoverage";

describe("Phase 4B.2 recipient-signing route coverage", () => {
  it("fails closed if /agreements/:id/sign loses public recipient-token treatment", () => {
    expect(() => assertPhase4b2RecipientSigningRoutes()).not.toThrow();

    const id = PHASE4B2_COVERAGE_AGREEMENT_ID;
    const token = PHASE4B2_COVERAGE_TOKEN;
    const party = PHASE4B2_COVERAGE_PARTY_ID;
    const lv = PHASE4B2_COVERAGE_LOCKED_VERSION;

    expect(phase4b2SigningPath(id, token, party)).toBe(agreementSigningPath(id, lv, token, party));
    expect(phase4b2SigningPath(id, token, party)).toBe(`/agreements/${id}/sign?t=${token}&p=${party}`);
    expect(parseAgreementSignPath(`/agreements/${id}/sign`, `?t=${token}&p=${party}`)).toEqual({
      agreementId: id,
      token,
      participantPartyId: party,
    });
    expect(isPublicTokenAgreementSurface(`/agreements/${id}/sign`)).toBe(true);
    expect(routeRequiresAuthenticatedSession("recipient_token")).toBe(false);
  });
});
