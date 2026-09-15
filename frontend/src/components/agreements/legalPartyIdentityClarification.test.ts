import { describe, expect, it } from "vitest";
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from "../../launch/corePaidJourneyAcceptanceMatrix";
import { releaseScopeSample } from "../../launch/releaseScopeQualificationCampaign";
import { contentClarificationQuestions } from "./PaidDraftContentAdvisory";
import { buildMaterialMissingItems } from "./proAgreementCompleteness/revisionQuestionEngine";
import {
  applyIdentityClarificationAnswers,
  applyIdentityResolutionToAuthorizedPaper,
  canonicalizeIdentityAnswer,
  identityClarificationMaterialItem,
  identityClarificationResolved,
  IDENTITY_RESOLUTION_MARKER,
  isIdentityClarificationQuestion,
  mergeUnresolvedIdentityIntoText,
  persistableIdentityResolution,
} from "./legalPartyIdentityClarification";
import { bindRepresentativesToLegalParties } from "./legalPartyRepresentativeBind";

const HARBOR = "Harbor Peak Analytics LLC";
const IRONVALE = "Ironvale Manufacturing Inc.";
const INTAKE = `Draft a consulting agreement between ${HARBOR} (Consultant) and ${IRONVALE} (Client). Scope is AI workflow implementation. Fixed fee $48,000. Delaware. Alex Rivera is involved.`;
const NORMALIZED_PARTIES = [
  { name: HARBOR, role: "Consultant" },
  { name: IRONVALE, role: "Client" },
];
const EXTRACTION_ROWS = [...NORMALIZED_PARTIES, { name: "Alex Rivera", role: "party" }];
const QUESTION =
  "Is Alex Rivera signing for one of the named companies, or contracting as their own legal party?";

describe("legal party identity clarification", () => {
  it("asks about a customer-mentioned person who is not a confirmed legal party", () => {
    const bound = bindRepresentativesToLegalParties(EXTRACTION_ROWS, INTAKE);
    expect(bound.parties.map((p) => p.name)).toEqual([HARBOR, IRONVALE]);
    expect(bound.unresolvedExtractionRows.map((p) => p.name)).toEqual(["Alex Rivera"]);
    const item = identityClarificationMaterialItem({
      intakeRaw: INTAKE,
      parsedParties: NORMALIZED_PARTIES,
    });
    expect(item?.question).toBe(QUESTION);
    expect(item?.canProceedWithoutAnswer).toBe(true);
  });

  it("adds an individual party from the answer after production normalization removed the extraction row", () => {
    const answer = "Alex Rivera is contracting as their own legal party (Advisor).";
    const applied = applyIdentityClarificationAnswers({
      parties: NORMALIZED_PARTIES,
      intake: INTAKE,
      answers: answer,
    });
    expect(applied.parties.map((p) => p.name)).toEqual([HARBOR, IRONVALE, "Alex Rivera"]);
    expect(applied.parties[2]).toMatchObject({ name: "Alex Rivera", role: "Advisor" });
    expect(applied.clarificationQuestion).toBeNull();
    const withEmail = applyIdentityClarificationAnswers({
      parties: NORMALIZED_PARTIES,
      intake: INTAKE,
      answers: "Alex Rivera, alex.rivera@advisor.test, is contracting as their own legal party (Advisor).",
    });
    expect(withEmail.parties.map((p) => p.name)).toEqual([HARBOR, IRONVALE, "Alex Rivera"]);
    expect(withEmail.parties[2]).toMatchObject({
      name: "Alex Rivera",
      role: "Advisor",
      email: "alex.rivera@advisor.test",
    });
    const fromInferredRow = applyIdentityClarificationAnswers({
      parties: [...NORMALIZED_PARTIES, { name: "Alex Rivera", role: "party" }],
      intake: INTAKE,
      answers: answer,
    });
    expect(fromInferredRow.parties.map((p) => p.name)).toEqual([HARBOR, IRONVALE, "Alex Rivera"]);
    expect(fromInferredRow.clarificationQuestion).toBeNull();
  });

  it("binds a representative answer to the intended existing party only", () => {
    const answer = "Alex Rivera is signing for Harbor Peak Analytics LLC.";
    const applied = applyIdentityClarificationAnswers({
      parties: NORMALIZED_PARTIES,
      intake: INTAKE,
      answers: answer,
    });
    expect(applied.parties.map((p) => p.name)).toEqual([HARBOR, IRONVALE]);
    expect(applied.parties[0]).toMatchObject({ signerName: "Alex Rivera", role: "Consultant" });
    expect(applied.parties[1]?.signerName).toBeFalsy();
    expect(applied.clarificationQuestion).toBeNull();
    const fromInferredRow = applyIdentityClarificationAnswers({
      parties: [...NORMALIZED_PARTIES, { name: "Alex Rivera", role: "party" }],
      intake: INTAKE,
      answers: answer,
    });
    expect(fromInferredRow.parties.map((p) => p.name)).toEqual([HARBOR, IRONVALE]);
    expect(fromInferredRow.parties[0]).toMatchObject({ signerName: "Alex Rivera" });
    expect(fromInferredRow.clarificationQuestion).toBeNull();
    const withoutPhantom = applyIdentityClarificationAnswers({
      parties: [
        { name: "000 Harbor Peak Analytics LLC", role: "party" },
        ...NORMALIZED_PARTIES,
      ],
      intake: INTAKE,
      answers: answer,
    });
    expect(withoutPhantom.parties.map((p) => p.name)).toEqual([HARBOR, IRONVALE]);
    expect(withoutPhantom.parties[0]).toMatchObject({ signerName: "Alex Rivera" });
  });

  it("does not mark a negation or unmatched company as resolved", () => {
    const negation = "Alex Rivera is not signing for Harbor Peak Analytics LLC.";
    expect(canonicalizeIdentityAnswer(negation)).toBeNull();
    expect(identityClarificationResolved(negation, QUESTION, { knownEntities: [HARBOR, IRONVALE] })).toBe(
      false,
    );
    expect(identityClarificationResolved(QUESTION, QUESTION)).toBe(false);
    expect(identityClarificationResolved(IDENTITY_RESOLUTION_MARKER, QUESTION)).toBe(false);
    expect(
      identityClarificationResolved("Alex Rivera is signing for Acme Corp.", QUESTION, {
        knownEntities: [HARBOR, IRONVALE],
      }),
    ).toBe(false);
    const stillOpen = applyIdentityClarificationAnswers({
      parties: NORMALIZED_PARTIES,
      intake: INTAKE,
      answers: negation,
    });
    expect(stillOpen.parties.map((p) => p.name)).toEqual([HARBOR, IRONVALE]);
    expect(stillOpen.clarificationQuestion).toBe(QUESTION);
  });

  it("does not silently drop an existing party when adding would exceed four", () => {
    const four = [
      { name: HARBOR, role: "Consultant" },
      { name: IRONVALE, role: "Client" },
      { name: "Stonebridge Wellness LLC", role: "Licensor" },
      { name: "NovaPath Learning Inc.", role: "Host" },
    ];
    const applied = applyIdentityClarificationAnswers({
      parties: four,
      intake: `${INTAKE} Stonebridge Wellness LLC and NovaPath Learning Inc. are also parties.`,
      answers: "Alex Rivera is contracting as their own legal party (Advisor).",
    });
    expect(applied.parties.map((p) => p.name)).toEqual(four.map((p) => p.name));
    expect(applied.parties).toHaveLength(4);
  });

  it("does not ask about an extraction-only invented person", () => {
    const intake = `Draft a consulting agreement between ${HARBOR} (Consultant) and ${IRONVALE} (Client).`;
    const item = identityClarificationMaterialItem({
      intakeRaw: intake,
      parsedParties: NORMALIZED_PARTIES,
      additionalTerms: mergeUnresolvedIdentityIntoText("", [
        { name: "Riley Chen", source: "extraction_only" },
      ]),
    });
    expect(item).toBeNull();
    const applied = applyIdentityClarificationAnswers({
      parties: NORMALIZED_PARTIES,
      intake,
      unresolvedSubjects: [{ name: "Riley Chen", source: "extraction_only" }],
    });
    expect(applied.parties.map((p) => p.name)).toEqual([HARBOR, IRONVALE]);
    expect(applied.clarificationQuestion).toBeNull();
  });

  it("applies a signer answer, persists a confirmed resolution, and does not re-ask", () => {
    const answer = "Alex Rivera is signing for Harbor Peak Analytics LLC.";
    const persisted = persistableIdentityResolution(answer, { knownEntities: [HARBOR, IRONVALE] });
    expect(persisted).toBe(`${IDENTITY_RESOLUTION_MARKER} Harbor Peak Analytics LLC signer: Alex Rivera`);
    expect(
      identityClarificationMaterialItem({
        intakeRaw: INTAKE,
        userGapAnswers: answer,
        additionalTerms: persisted,
        parsedParties: NORMALIZED_PARTIES,
      }),
    ).toBeNull();
    expect(identityClarificationResolved(persisted, QUESTION, { knownEntities: [HARBOR, IRONVALE] })).toBe(
      true,
    );
    const missing = buildMaterialMissingItems({
      intakeRaw: INTAKE,
      userGapAnswers: answer,
      additionalTerms: persisted,
      body: "Consultant will provide AI workflow implementation. Client will pay $48,000. Delaware.",
      parsedParties: NORMALIZED_PARTIES,
      serverMissing: [QUESTION],
    });
    expect(missing.some((row) => row.question === QUESTION)).toBe(false);
  });

  it("shows the identity question from intake after normalization removed the person", () => {
    const body =
      'This Consulting Services Agreement is entered into by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client").';
    const questions = contentClarificationQuestions({
      intake: INTAKE,
      body,
      parsedParties: NORMALIZED_PARTIES,
    });
    expect(questions).toContain(QUESTION);
    expect(contentClarificationQuestions({ intake: INTAKE, body })).toContain(QUESTION);
    expect(
      contentClarificationQuestions({
        intake: INTAKE,
        body,
        parsedParties: [...NORMALIZED_PARTIES, { name: "Alex Rivera", role: "party" }],
      }),
    ).toContain(QUESTION);
    expect(
      contentClarificationQuestions({
        intake: CORE_PAID_JOURNEY_FILLED_INTAKE,
        body,
      }).filter(isIdentityClarificationQuestion),
    ).toEqual([]);
    for (const id of ["saas", "three_party", "four_party"] as const) {
      const sample = releaseScopeSample(id);
      expect(
        contentClarificationQuestions({
          intake: sample.filledIntake,
          body: sample.filledIntake,
        }).filter(isIdentityClarificationQuestion),
        id,
      ).toEqual([]);
    }
  });

  it("does not ask again for an individual already stated in customer input", () => {
    const intake = `Draft a consulting agreement between ${HARBOR} (Consultant) and ${IRONVALE} (Client). Jordan Hale as an individual (Advisor) is the third contracting party.`;
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

  it("adds an individual to Parties, notices, and execution without inventing obligations", () => {
    const before = [
      `This Services Agreement (this "Agreement") is entered into by and between ${HARBOR} ("Consultant") and ${IRONVALE} ("Client"). Consultant and Client may be referred to individually as a "Party" and collectively as the "Parties."`,
      "",
      "1. PARTIES AND ROLES",
      "",
      "Consultant is an independent professional services firm. Client is retaining Consultant to perform the services described in this Agreement.",
      "",
      "11. NOTICES",
      "",
      `If to ${HARBOR}:`,
      HARBOR,
      "Email: alex.rivera@advisor.test",
      "",
      `If to ${IRONVALE}:`,
      IRONVALE,
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      HARBOR,
      "By: __________________________",
      "",
      "SERVICE PROVIDER:",
      IRONVALE,
      "By: __________________________",
    ].join("\n");
    const after = applyIdentityResolutionToAuthorizedPaper(before, [
      { name: HARBOR, role: "Consultant" },
      { name: IRONVALE, role: "Client" },
      { name: "Alex Rivera", role: "Advisor", email: "alex.rivera@advisor.test" },
    ]);
    expect(after).toContain(`and Alex Rivera ("Advisor")`);
    expect(after).toMatch(/Consultant, Client, and Advisor may be referred to individually as a "Party"/);
    expect(after).toMatch(/If to Alex Rivera:[\s\S]*Email: alex\.rivera@advisor\.test/);
    expect(after).not.toMatch(
      /If to Harbor Peak Analytics LLC:\s*\nHarbor Peak Analytics LLC\s*\nEmail: alex\.rivera@advisor\.test/,
    );
    expect(after).toMatch(/CONSULTANT:\s*\nHarbor Peak Analytics LLC/);
    expect(after).toMatch(/CLIENT:\s*\nIronvale Manufacturing Inc/);
    expect(after).toMatch(/ADVISOR:\s*\nAlex Rivera/);
    expect(after).not.toMatch(/SERVICE PROVIDER:\s*\nIronvale Manufacturing Inc/);
    expect(after).not.toMatch(/Advisor shall/);
  });

  it("does not invent a numbered party when applying a representative to existing paper", () => {
    const before =
      'This Consulting Services Agreement is entered into by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client"). Consultant and Client may be referred to individually as a "Party". Consultant\'s authorized signer is ________.';
    const after = applyIdentityResolutionToAuthorizedPaper(before, [
      { name: HARBOR, role: "Consultant", signerName: "Alex Rivera" },
      { name: IRONVALE, role: "Client" },
    ]);
    expect(after).toContain("Consultant's authorized signer is Alex Rivera");
    expect(after).not.toMatch(/000\s+Harbor Peak Analytics LLC/);
    expect(after.match(/Harbor Peak Analytics LLC/g)?.length).toBe(
      before.match(/Harbor Peak Analytics LLC/g)?.length,
    );
  });
});
