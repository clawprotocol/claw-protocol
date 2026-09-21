import { describe, expect, it } from "vitest";
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from "../../launch/corePaidJourneyAcceptanceMatrix";
import {
  RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA,
  RELEASE_SCOPE_SAAS_FILLED_INTAKE,
} from "../../launch/releaseScopeQualificationCampaign";
import { TEST487_PRODUCTION_INTAKE } from "./paidProTest487ProductionValidationFixtures";
import { TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE } from "./paidProTest490Fixtures";
import {
  UNCONFIRMED_MILESTONE_PAYER_QUESTION,
  applySuppliedMilestonePayerToAuthorizedPaper,
  extractConfirmedMilestonePayer,
  milestonePayerMaterialItem,
  milestonePayerNeedsQuestion,
} from "./paidProMilestonePayer";
import {
  clearConfirmedContentAnswersForTests,
  persistConfirmedContentAnswers,
  readConfirmedContentAnswers,
} from "./paidProConfirmedContentAnswers";
import { contentClarificationQuestions } from "./PaidDraftContentAdvisory";
import { paymentClarificationQuestions } from "./paymentClarificationSession";

const FOUR_PARTY_FIRST = [
  "PRECISION MEDICINE DATA PLATFORM AGREEMENT",
  "The parties are Lumen Bioinformatics Inc. (Platform Developer), Thalassa Data Systems LLC (Data Infrastructure Provider), Coastal Meridian Analytics LLC (Analytics Integrator), and Vanguard Regulatory Sciences Ltd. (Regulatory Compliance Advisor).",
  "3. PAYMENT AND CONSIDERATION",
  "Lumen Bioinformatics Inc. receives $250,000 upon execution, $400,000 upon platform alpha delivery, and $350,000 upon validation report acceptance.",
  "Thalassa Data Systems LLC receives $180,000 upon data pipeline readiness and $220,000 upon production cutover.",
  "Coastal Meridian Analytics LLC receives $150,000 upon analytics module delivery and $175,000 upon user acceptance testing completion.",
  "Vanguard Regulatory Sciences Ltd. receives $95,000 upon regulatory gap assessment and $105,000 upon audit readiness certification.",
  "4. TERM AND DURATION",
  "The initial term is 24 months.",
].join("\n");

const GENERATED_PAYER_BODY = `${FOUR_PARTY_FIRST}\nLumen Bioinformatics Inc. pays each listed milestone amount to the named recipient.`;

const INTAKE_WITH_EXPLICIT_PAYER = `${TEST487_PRODUCTION_INTAKE}\nLumen Bioinformatics Inc. pays each listed milestone amount to the named recipient.`;

describe("paidProMilestonePayer", () => {
  it("still asks when stored intake is thin but the painted paper has named recipients", () => {
    expect(
      milestonePayerNeedsQuestion({
        intakeRaw: "Precision Medicine Data Platform Agreement\nMassachusetts\nparty-specific milestones",
        body: FOUR_PARTY_FIRST,
      }),
    ).toBe(true);
    expect(
      contentClarificationQuestions({
        intake: "Precision Medicine Data Platform Agreement\nMassachusetts\nparty-specific milestones",
        body: FOUR_PARTY_FIRST,
      }),
    ).toEqual([UNCONFIRMED_MILESTONE_PAYER_QUESTION]);
    expect(
      paymentClarificationQuestions({
        intake: TEST487_PRODUCTION_INTAKE,
        body: FOUR_PARTY_FIRST,
        authorizedBody: FOUR_PARTY_FIRST,
      }),
    ).toEqual([]);
  });

  it("asks only when named milestone recipients exist and no existing party is the payer", () => {
    const ask = milestonePayerMaterialItem({ intakeRaw: TEST487_PRODUCTION_INTAKE, body: FOUR_PARTY_FIRST });
    expect(ask?.question).toBe(UNCONFIRMED_MILESTONE_PAYER_QUESTION);
    expect(ask?.canProceedWithoutAnswer).toBe(true);
    expect(milestonePayerNeedsQuestion({ intakeRaw: CORE_PAID_JOURNEY_FILLED_INTAKE, body: "" })).toBe(false);
    expect(milestonePayerNeedsQuestion({ intakeRaw: RELEASE_SCOPE_SAAS_FILLED_INTAKE, body: "" })).toBe(false);
    expect(
      milestonePayerNeedsQuestion({ intakeRaw: TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE, body: "" }),
    ).toBe(false);
  });

  it("does not treat unsupported generated paper as payer confirmation", () => {
    expect(extractConfirmedMilestonePayer(TEST487_PRODUCTION_INTAKE, "", GENERATED_PAYER_BODY)).toBeNull();
    expect(
      milestonePayerNeedsQuestion({
        intakeRaw: TEST487_PRODUCTION_INTAKE,
        userGapAnswers: "",
        body: GENERATED_PAYER_BODY,
      }),
    ).toBe(true);
    expect(
      contentClarificationQuestions({
        intake: TEST487_PRODUCTION_INTAKE,
        appliedAnswers: "",
        body: GENERATED_PAYER_BODY,
      }),
    ).toEqual([UNCONFIRMED_MILESTONE_PAYER_QUESTION]);
  });

  it("accepts an explicit payer already supplied in intake", () => {
    expect(extractConfirmedMilestonePayer(INTAKE_WITH_EXPLICIT_PAYER, "")).toBe("Lumen Bioinformatics Inc.");
    expect(
      milestonePayerNeedsQuestion({
        intakeRaw: INTAKE_WITH_EXPLICIT_PAYER,
        userGapAnswers: "",
        body: FOUR_PARTY_FIRST,
      }),
    ).toBe(false);
  });

  it("accepts a confirmed customer answer and keeps canProceedWithoutAnswer", () => {
    expect(RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA).toMatch(/^TEST DATA \(synthetic customer answer/);
    expect(
      extractConfirmedMilestonePayer(TEST487_PRODUCTION_INTAKE, RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA),
    ).toBe("Lumen Bioinformatics Inc.");
    expect(
      milestonePayerNeedsQuestion({
        intakeRaw: TEST487_PRODUCTION_INTAKE,
        userGapAnswers: RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA,
        body: FOUR_PARTY_FIRST,
      }),
    ).toBe(false);
    expect(
      milestonePayerMaterialItem({ intakeRaw: TEST487_PRODUCTION_INTAKE, body: FOUR_PARTY_FIRST })
        ?.canProceedWithoutAnswer,
    ).toBe(true);
  });

  it("applies the labeled payer answer when stored intake is thin but painted parties remain", () => {
    const thin = "Precision Medicine Data Platform Agreement\nMassachusetts\nparty-specific milestones";
    expect(
      extractConfirmedMilestonePayer(thin, RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA, FOUR_PARTY_FIRST),
    ).toBe("Lumen Bioinformatics Inc.");
    const applied = applySuppliedMilestonePayerToAuthorizedPaper(
      FOUR_PARTY_FIRST,
      thin,
      RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA,
    );
    expect(applied).toMatch(/Lumen Bioinformatics Inc\. pays each listed milestone amount to the named recipient/);
    expect(applied).toMatch(/Thalassa Data Systems LLC receives \$180,000/);
    expect(
      milestonePayerNeedsQuestion({
        intakeRaw: thin,
        userGapAnswers: RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA,
        body: applied,
      }),
    ).toBe(false);
  });

  it("restores a saved confirmed answer after a fresh session without asking again", () => {
    clearConfirmedContentAnswersForTests();
    persistConfirmedContentAnswers({
      userId: "owner-a",
      organizationId: "org-a",
      agreementId: "agr-four",
      revisionId: "rev-applied",
      answers: RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA,
    });
    const restored = readConfirmedContentAnswers({
      userId: "owner-a",
      organizationId: "org-a",
      agreementId: "agr-four",
      revisionId: "rev-applied",
    });
    expect(restored).toBe(RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA);
    expect(
      milestonePayerNeedsQuestion({
        intakeRaw: TEST487_PRODUCTION_INTAKE,
        userGapAnswers: restored,
        body: GENERATED_PAYER_BODY,
      }),
    ).toBe(false);
    expect(
      contentClarificationQuestions({
        intake: TEST487_PRODUCTION_INTAKE,
        appliedAnswers: restored,
        body: GENERATED_PAYER_BODY,
      }),
    ).toEqual([]);
    clearConfirmedContentAnswersForTests();
  });

  it("applies the labeled synthetic Lumen answer and refuses an unknown fifth party", () => {
    expect(RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA).toMatch(/^TEST DATA \(synthetic customer answer/);
    const applied = applySuppliedMilestonePayerToAuthorizedPaper(
      FOUR_PARTY_FIRST,
      TEST487_PRODUCTION_INTAKE,
      RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA,
    );
    expect(extractConfirmedMilestonePayer(TEST487_PRODUCTION_INTAKE, RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA)).toBe(
      "Lumen Bioinformatics Inc.",
    );
    expect(applied).toMatch(/Lumen Bioinformatics Inc\. pays each listed milestone amount to the named recipient/);
    expect(applied).toMatch(/Thalassa Data Systems LLC receives \$180,000/);
    const fifth = applySuppliedMilestonePayerToAuthorizedPaper(
      FOUR_PARTY_FIRST,
      TEST487_PRODUCTION_INTAKE,
      "Acme Holdings LLC shall pay every milestone as a fifth party.",
    );
    expect(fifth).toBe(FOUR_PARTY_FIRST);
    expect(extractConfirmedMilestonePayer(TEST487_PRODUCTION_INTAKE, "Acme Holdings LLC shall pay")).toBeNull();
  });

  it("replaces a changed payer answer without leaving contradictory payer sentences", () => {
    const lumenApplied = applySuppliedMilestonePayerToAuthorizedPaper(
      FOUR_PARTY_FIRST,
      TEST487_PRODUCTION_INTAKE,
      RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA,
    );
    const changed = applySuppliedMilestonePayerToAuthorizedPaper(
      lumenApplied,
      TEST487_PRODUCTION_INTAKE,
      "TEST DATA (synthetic customer answer; not part of the original intake): Thalassa Data Systems LLC pays each listed milestone amount to the named recipient.",
    );
    expect(changed).toMatch(/Thalassa Data Systems LLC pays each listed milestone amount to the named recipient/);
    expect(changed).not.toMatch(/Lumen Bioinformatics Inc\. pays each listed milestone amount/);
    expect(changed).toMatch(/Lumen Bioinformatics Inc\. receives \$250,000/);
  });

  it("does not invent a payer when the question stays unanswered", () => {
    expect(
      applySuppliedMilestonePayerToAuthorizedPaper(FOUR_PARTY_FIRST, TEST487_PRODUCTION_INTAKE, ""),
    ).toBe(FOUR_PARTY_FIRST);
    expect(milestonePayerNeedsQuestion({ intakeRaw: TEST487_PRODUCTION_INTAKE, body: FOUR_PARTY_FIRST })).toBe(
      true,
    );
  });
});
