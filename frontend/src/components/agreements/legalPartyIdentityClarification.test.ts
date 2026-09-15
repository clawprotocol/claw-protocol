import { describe, expect, it } from "vitest";
import { buildMaterialMissingItems } from "./proAgreementCompleteness/revisionQuestionEngine";
import {
  applyIdentityClarificationAnswers,
  identityClarificationMaterialItem,
  identityClarificationResolved,
  mergeIdentityResolutionsIntoIntake,
  persistableIdentityResolution,
} from "./legalPartyIdentityClarification";
import { bindRepresentativesToLegalParties } from "./legalPartyRepresentativeBind";

const HARBOR = "Harbor Peak Analytics LLC";
const IRONVALE = "Ironvale Manufacturing Inc.";
const INTAKE = `Draft a consulting agreement between ${HARBOR} (Consultant) and ${IRONVALE} (Client). Scope is AI workflow implementation. Fixed fee $48,000. Delaware.`;
const EXTRACTION_ROWS = [
  { name: HARBOR, role: "Consultant" },
  { name: IRONVALE, role: "Client" },
  { name: "Alex Rivera", role: "party" },
];
const QUESTION =
  "Is Alex Rivera signing for one of the named companies, or contracting as their own legal party?";

describe("legal party identity clarification", () => {
  it("asks about an extracted person who is not a confirmed legal party", () => {
    const bound = bindRepresentativesToLegalParties(EXTRACTION_ROWS, INTAKE);
    expect(bound.parties.map((p) => p.name)).toEqual([HARBOR, IRONVALE]);
    expect(bound.unresolvedExtractionRows.map((p) => p.name)).toEqual(["Alex Rivera"]);
    const item = identityClarificationMaterialItem({
      intakeRaw: INTAKE,
      parsedParties: EXTRACTION_ROWS,
    });
    expect(item?.question).toBe(QUESTION);
    expect(item?.canProceedWithoutAnswer).toBe(true);
    const missing = buildMaterialMissingItems({
      intakeRaw: INTAKE,
      body: "Consultant will provide AI workflow implementation. Client will pay $48,000.",
      parsedParties: EXTRACTION_ROWS,
      serverMissing: [QUESTION],
    });
    expect(missing.filter((row) => row.question === QUESTION)).toHaveLength(1);
  });

  it("applies a signer answer, persists it, and does not re-ask after reopen inputs", () => {
    const answer = "Alex Rivera is signing for Harbor Peak Analytics LLC.";
    const applied = applyIdentityClarificationAnswers({
      parties: EXTRACTION_ROWS,
      intake: INTAKE,
      answers: answer,
    });
    expect(applied.parties.map((p) => p.name)).toEqual([HARBOR, IRONVALE]);
    expect(applied.parties[0]).toMatchObject({ signerName: "Alex Rivera", role: "Consultant" });
    expect(applied.parties[1]?.signerName).toBeFalsy();
    expect(applied.clarificationQuestion).toBeNull();
    expect(applied.unresolvedExtractionRows).toEqual([]);

    const persisted = persistableIdentityResolution(answer);
    expect(persisted).toMatch(/IDENTITY_RESOLUTION:/);
    const reopenedIntake = mergeIdentityResolutionsIntoIntake(INTAKE, persisted);
    const reopened = applyIdentityClarificationAnswers({
      parties: EXTRACTION_ROWS,
      intake: reopenedIntake,
      answers: persisted,
    });
    expect(reopened.clarificationQuestion).toBeNull();
    expect(reopened.parties[0]?.signerName).toBe("Alex Rivera");
    expect(
      identityClarificationMaterialItem({
        intakeRaw: INTAKE,
        userGapAnswers: answer,
        additionalTerms: persisted,
        parsedParties: EXTRACTION_ROWS,
      }),
    ).toBeNull();
    expect(identityClarificationResolved(persisted, QUESTION)).toBe(true);
    const missing = buildMaterialMissingItems({
      intakeRaw: INTAKE,
      userGapAnswers: answer,
      additionalTerms: persisted,
      body: "Consultant will provide AI workflow implementation. Client will pay $48,000. Delaware.",
      parsedParties: EXTRACTION_ROWS,
      serverMissing: [QUESTION],
    });
    expect(missing.some((row) => row.question === QUESTION)).toBe(false);
  });

  it("promotes a genuine individual party without inventing extra companies", () => {
    const answer = "Alex Rivera is contracting as their own legal party (Advisor).";
    const applied = applyIdentityClarificationAnswers({
      parties: EXTRACTION_ROWS,
      intake: INTAKE,
      answers: answer,
    });
    expect(applied.parties.map((p) => p.name)).toEqual([HARBOR, IRONVALE, "Alex Rivera"]);
    expect(applied.parties[2]).toMatchObject({ name: "Alex Rivera", role: "Advisor" });
    expect(applied.clarificationQuestion).toBeNull();
  });

  it("does not ask again for an individual already stated in customer input", () => {
    const intake = `${INTAKE} Jordan Hale as an individual (Advisor) is the third contracting party.`;
    const item = identityClarificationMaterialItem({
      intakeRaw: intake,
      parsedParties: [
        { name: HARBOR, role: "Consultant" },
        { name: IRONVALE, role: "Client" },
        { name: "Jordan Hale", role: "Advisor" },
      ],
    });
    expect(item).toBeNull();
  });
});
