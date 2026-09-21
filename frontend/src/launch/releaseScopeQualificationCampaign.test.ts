import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from "./corePaidJourneyAcceptanceMatrix";
import {
  TEST487_FOUR_PARTY,
  TEST487_PRODUCTION_INTAKE,
} from "../components/agreements/paidProTest487ProductionValidationFixtures";
import { TEST477_THREE_PARTY } from "../components/agreements/paidProTest477Fixtures";
import { TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE } from "../components/agreements/paidProTest490Fixtures";
import {
  RELEASE_SCOPE_FOUR_PARTY_FILLED_INTAKE,
  RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA,
  RELEASE_SCOPE_SAAS_FILLED_INTAKE,
  RELEASE_SCOPE_SAMPLES,
  RELEASE_SCOPE_THREE_PARTY_FILLED_INTAKE,
  assertReleaseScopeFactsComplete,
  releaseScopeSample,
  selectReleaseScopeCaseIds,
} from "./releaseScopeQualificationCampaign";

describe("release-scope qualification campaign facts", () => {
  it("defines two-, three-, and four-party expected facts before any output is evaluated", () => {
    expect(() => assertReleaseScopeFactsComplete()).not.toThrow();
    expect(RELEASE_SCOPE_SAMPLES.map((row) => row.id)).toEqual([
      "consulting",
      "saas",
      "three_party",
      "four_party",
    ]);
    expect(RELEASE_SCOPE_SAMPLES.map((row) => row.partyCount)).toEqual([2, 2, 3, 4]);
    expect(RELEASE_SCOPE_SAMPLES.every((row) => row.parties.every((party) => party.responsibility))).toBe(true);
  });

  it("reuses the current Harbor and SaaS quality-eval intakes", () => {
    expect(releaseScopeSample("consulting").filledIntake).toBe(CORE_PAID_JOURNEY_FILLED_INTAKE);
    expect(releaseScopeSample("consulting").governingLaw).toBe("Delaware");
    expect(releaseScopeSample("saas").filledIntake).toBe(RELEASE_SCOPE_SAAS_FILLED_INTAKE);
    expect(releaseScopeSample("saas").governingLaw).toBe("New York");
    expect(RELEASE_SCOPE_SAAS_FILLED_INTAKE).toMatch(/hosted platform only/);
    expect(RELEASE_SCOPE_SAAS_FILLED_INTAKE).toMatch(/no professional services/);
  });

  it("reuses TEST490/TEST477 three-party meaning and TEST487 four-party production intake", () => {
    const three = releaseScopeSample("three_party");
    expect(RELEASE_SCOPE_THREE_PARTY_FILLED_INTAKE).toContain(TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE);
    for (const party of TEST477_THREE_PARTY) {
      expect(three.filledIntake).toContain(party.legalEntity);
      expect(three.filledIntake).toContain(party.signerName);
      expect(three.filledIntake).toContain(party.email);
      expect(three.parties.some((row) => row.legalEntity === party.legalEntity && row.email === party.email)).toBe(
        true,
      );
    }
    expect(three.governingLaw).toBe("Oklahoma");
    expect(three.parties.map((row) => row.economics)).toEqual([
      "45% of customer subscription revenue",
      "35% of customer subscription revenue",
      "20% of customer subscription revenue",
    ]);

    const four = releaseScopeSample("four_party");
    expect(RELEASE_SCOPE_FOUR_PARTY_FILLED_INTAKE).toBe(TEST487_PRODUCTION_INTAKE);
    expect(four.governingLaw).toBe("Massachusetts");
    expect(four.parties.map((row) => row.legalEntity)).toEqual(TEST487_FOUR_PARTY.map((row) => row.legalEntity));
    expect(four.parties.every((row) => row.responsibility && row.economics && row.email)).toBe(true);
  });

  it("keeps --case all as the two-sample Harbor/SaaS pair", () => {
    expect(selectReleaseScopeCaseIds("all")).toEqual(["consulting", "saas"]);
    expect(selectReleaseScopeCaseIds(undefined)).toEqual(["consulting", "saas"]);
    expect(selectReleaseScopeCaseIds("release_scope")).toEqual([
      "consulting",
      "saas",
      "three_party",
      "four_party",
    ]);
    expect(selectReleaseScopeCaseIds("three_party")).toEqual(["three_party"]);
    expect(selectReleaseScopeCaseIds("four_party")).toEqual(["four_party"]);
    expect(() => selectReleaseScopeCaseIds("five_party")).toThrow(/unknown_quality_eval_case/);
  });

  it("does not persist a legal-entity copy as the three-party signer name", async () => {
    const { partiesForServerPersistFromSeed, runPaidProSignerMetadataAuthoritySeed } = await import(
      "../components/agreements/paidProSignerMetadataSeed"
    );
    const draft = {
      parties: TEST477_THREE_PARTY.map((party) => ({
        name: party.legalEntity,
        role: "party",
        email: party.email,
        signerName: party.legalEntity,
      })),
    };
    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "post_new_draft_persist",
      legalEntities: TEST477_THREE_PARTY.map((party) => party.legalEntity),
      intakeText: RELEASE_SCOPE_THREE_PARTY_FILLED_INTAKE,
      draft: draft as never,
      uiSignerNames: ["", "", ""],
      uiSignerTitles: ["", "", ""],
      authoritativePartyCount: 3,
    });
    const persistParties = partiesForServerPersistFromSeed(draft.parties, seed);
    expect(persistParties.map((party) => party.signerName)).toEqual(TEST477_THREE_PARTY.map((party) => party.signerName));
  });

  it("labels the four-party payer answer as synthetic test data, not original intake", () => {
    expect(RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA).toMatch(
      /^TEST DATA \(synthetic customer answer; not part of the original intake\)/,
    );
    expect(RELEASE_SCOPE_FOUR_PARTY_FILLED_INTAKE).not.toMatch(/\b(?:pays?|shall pay|will pay|paying party)\b/i);
    expect(RELEASE_SCOPE_FOUR_PARTY_FILLED_INTAKE).not.toContain(RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA);
  });

  it("wires the durable local regressions into the existing phase-2 release checks", () => {
    const config = readFileSync(join(process.cwd(), "vitest.phase2PaidJourney.runner.config.ts"), "utf8");
    for (const path of [
      "src/launch/releaseScopeQualificationCampaign.test.ts",
      "src/launch/releaseScopeQualificationJourney.test.ts",
      "src/launch/qualityEvalCustomerPaper.test.ts",
      "src/launch/customerMeaningProductionPath.test.ts",
      "src/components/agreements/legalPartyRepresentativeBind.test.ts",
      "src/components/agreements/legalPartyIdentityClarification.test.ts",
      "src/components/agreements/paidProPartyEconomicRelationships.test.ts",
      "src/components/agreements/paidProMilestonePayer.test.ts",
      "src/components/agreements/paymentClarificationApplyRecovery.test.ts",
      "src/vs01/paidProTest465RecipientIsolation.test.ts",
    ]) {
      expect(config).toContain(`"${path}"`);
    }
    const phase2 = readFileSync(join(process.cwd(), "../scripts/run_phase2_paid_journey_release_gate.sh"), "utf8");
    for (const path of [
      "backend/tests/test_legal_party_representative_bind.py",
      "backend/tests/test_harbor_six_row_production_path.py",
      "backend/tests/test_draft_quality_trace.py",
    ]) {
      expect(phase2).toContain(path);
    }
  });

  it("does not treat U.S. states as interchangeable", () => {
    const laws = RELEASE_SCOPE_SAMPLES.map((row) => row.governingLaw);
    expect(new Set(laws).size).toBe(4);
    expect(laws).toEqual(["Delaware", "New York", "Oklahoma", "Massachusetts"]);
    for (const sample of RELEASE_SCOPE_SAMPLES) {
      for (const other of sample.forbiddenJurisdictions) {
        expect(other).not.toBe(sample.governingLaw);
      }
    }
  });
});
