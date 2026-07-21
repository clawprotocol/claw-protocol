import { describe, expect, it } from "vitest";
import {
  assertSharedFixturePassesProfessionalGate,
  buildFourPartyProfessionalServicesCorpus,
  buildThinMislabeledServerFullDraft,
  buildTwoPartyProfessionalServicesCorpus,
  FROZEN_TWO_PARTY_PROFESSIONAL_V1_HASH,
  PAID_PRO_SHARED_FIXTURE_VERSION,
  SHARED_TWO_PARTY_INTAKE,
} from "./paidProSharedFixtureSystem";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";

describe("paidProSharedFixtureSystem", () => {
  it("positive two-party fixture exceeds substantive minimum and passes professional gate", () => {
    const corpus = buildTwoPartyProfessionalServicesCorpus();
    expect(corpus.length).toBeGreaterThanOrEqual(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    assertSharedFixturePassesProfessionalGate(corpus, SHARED_TWO_PARTY_INTAKE);
  });

  it("frozen hash literal is stable for version", () => {
    expect(PAID_PRO_SHARED_FIXTURE_VERSION).toBe("v1");
    expect(hashPaidProCorpus(buildTwoPartyProfessionalServicesCorpus())).toBe(
      FROZEN_TWO_PARTY_PROFESSIONAL_V1_HASH,
    );
  });

  it("quad fixture meets substantive minimum when builder succeeds", () => {
    const corpus = buildFourPartyProfessionalServicesCorpus();
    expect(corpus.length).toBeGreaterThanOrEqual(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
  });

  it("thin negative fixture stays below substantive minimum", () => {
    expect(buildThinMislabeledServerFullDraft().length).toBeLessThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
  });
});
