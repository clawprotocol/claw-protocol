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
import { applySignerPartyIdentityToAuthoritativeAgreement } from "./guidedDealCompletion/signerPartyIdentity";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { applyPaidProSoTSignerExecutionOverlay } from "./paidProSoTSignerExecutionOverlay";
import { finalizePaidProSigningCorpusText } from "./paidProSignerSigningCorpusHygiene";
import { reconcileExecutionBlockToRoleIdentities } from "./paidProSignerMetadataMergeGate";
import { shouldPreserveApprovedAddedPartyExecutionTail } from "./paidProDeclaredConsultantClientPaper";

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
    const inferredSignerParties = [
      { name: HARBOR, role: "Consultant", signerName: "Alex Rivera" },
      { name: IRONVALE, role: "Client", signerName: IRONVALE },
    ];
    const inferredPaper = [
      `This Services Agreement is entered into by and between ${HARBOR} ("Consultant") and ${IRONVALE} ("Client"). Consultant and Client may be referred to individually as a "Party" and collectively as the "Parties."`,
      `If to ${HARBOR}:`,
      HARBOR,
      "Attn: Alex Rivera",
      "Email: alex.rivera@advisor.test",
      "CLIENT:",
      IRONVALE,
      "Name: Alex Rivera",
      "CONSULTANT:",
      HARBOR,
      "Name: __________________________",
    ].join("\n");
    const inferredIntake =
      `${INTAKE.replace("Alex Rivera is involved.", "Alex Rivera, alex.rivera@advisor.test, is involved.")}`;
    expect(
      contentClarificationQuestions({
        intake: inferredIntake,
        body: inferredPaper,
        parsedParties: inferredSignerParties,
        unresolvedSubjects: [
          { name: "Alex Rivera", source: "customer_mentioned" },
          { name: "Riley Chen", source: "extraction_only" },
        ],
      }),
    ).toContain(QUESTION);
    const stripped = applyIdentityClarificationAnswers({
      parties: inferredSignerParties,
      intake: inferredIntake,
      unresolvedSubjects: [{ name: "Alex Rivera", source: "customer_mentioned" }],
    });
    expect(stripped.clarificationQuestion).toBe(QUESTION);
    expect(stripped.parties[0]?.signerName || "").toBe("");
    expect(stripped.parties.map((p) => p.name)).toEqual([HARBOR, IRONVALE]);
    const reopened = applyIdentityClarificationAnswers({
      parties: inferredSignerParties,
      intake: inferredIntake,
      unresolvedSubjects: [],
    });
    expect(reopened.clarificationQuestion).toBeNull();
    expect(reopened.parties[0]?.signerName).toBe("Alex Rivera");
    expect(
      contentClarificationQuestions({
        intake: inferredIntake,
        body: `${inferredPaper}\nConsultant's authorized signer is Alex Rivera.`,
        parsedParties: inferredSignerParties,
        unresolvedSubjects: [],
        additionalTerms: `${IDENTITY_RESOLUTION_MARKER} Harbor Peak Analytics LLC signer: Alex Rivera`,
      }),
    ).not.toContain(QUESTION);
    const added = applyIdentityClarificationAnswers({
      parties: [
        ...NORMALIZED_PARTIES,
        { name: "Alex Rivera", role: "Advisor", email: "alex.rivera@advisor.test" },
      ],
      intake: inferredIntake,
      unresolvedSubjects: [],
    });
    expect(added.parties.map((p) => p.name)).toEqual([HARBOR, IRONVALE, "Alex Rivera"]);
    expect(added.clarificationQuestion).toBeNull();
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

  it("does not keep an identity question for boilerplate Either Party after Alex is Advisor", () => {
    const individualAnswer =
      "Alex Rivera, alex.rivera@advisor.test, is contracting as their own legal party (Advisor).";
    const intake = `${INTAKE}\nEither Party may terminate on 30 days written notice.`;
    const paper = [
      `This Services Agreement is entered into by and between ${HARBOR} ("Consultant") and ${IRONVALE} ("Client").`,
      `Consultant and Client may be referred to individually as a "Party" and collectively as the "Parties."`,
      "Either Party may terminate on 30 days written notice.",
    ].join("\n");
    const applied = applyIdentityClarificationAnswers({
      parties: NORMALIZED_PARTIES,
      intake,
      answers: individualAnswer,
      unresolvedSubjects: [
        { name: "Riley Chen", source: "extraction_only" },
        { name: "Either Party", source: "customer_mentioned" },
      ],
    });
    expect(applied.parties.map((party) => party.name)).toEqual([HARBOR, IRONVALE, "Alex Rivera"]);
    expect(applied.parties[2]).toMatchObject({ name: "Alex Rivera", role: "Advisor" });
    expect(applied.clarificationQuestion).toBeNull();
    expect(applied.unresolvedSubjects.some((row) => /Either Party/i.test(row.name))).toBe(false);
    expect(applied.unresolvedSubjects.some((row) => /Riley Chen/i.test(row.name))).toBe(true);
    const item = identityClarificationMaterialItem({
      intakeRaw: intake,
      userGapAnswers: individualAnswer,
      parsedParties: applied.parties,
      additionalTerms: mergeUnresolvedIdentityIntoText("", [
        { name: "Riley Chen", source: "extraction_only" },
        { name: "Either Party", source: "customer_mentioned" },
      ]),
      body: paper,
      unresolvedSubjects: [
        { name: "Riley Chen", source: "extraction_only" },
        { name: "Either Party", source: "customer_mentioned" },
      ],
    });
    expect(item?.question || "").not.toMatch(/Either Party/);
    expect(item).toBeNull();
    expect(
      identityClarificationMaterialItem({
        intakeRaw: intake,
        parsedParties: applied.parties,
        additionalTerms: mergeUnresolvedIdentityIntoText("", [
          { name: "Riley Chen", source: "extraction_only" },
          { name: "Either Party", source: "customer_mentioned" },
        ]),
        body: paper,
        unresolvedSubjects: [
          { name: "Riley Chen", source: "extraction_only" },
          { name: "Either Party", source: "customer_mentioned" },
        ],
      }),
    ).toBeNull();
    expect(
      contentClarificationQuestions({
        intake,
        body: paper,
        parsedParties: applied.parties,
        additionalTerms: mergeUnresolvedIdentityIntoText("", [
          { name: "Riley Chen", source: "extraction_only" },
          { name: "Either Party", source: "customer_mentioned" },
        ]),
        unresolvedSubjects: [
          { name: "Riley Chen", source: "extraction_only" },
          { name: "Either Party", source: "customer_mentioned" },
        ],
      }).filter(isIdentityClarificationQuestion),
    ).toEqual([]);
  });

  it("does not treat job titles or street fragments as leftover identity subjects", () => {
    const three = releaseScopeSample("three_party");
    const paper = [
      "The coordinator is not a party, signer, notice recipient, or beneficiary.",
      "Stonebridge Wellness LLC's authorized signer is Sandra Wells, Managing Member.",
      "NovaPath Learning Inc.'s authorized signer is Caleb Price, Chief Product Officer.",
      "ClearSpring Distribution LLC's authorized signer is Maya Coleman, President.",
      "Attn: Sandra Wells, Managing Member",
      "2841 Foundry Ave.",
      "Either Party may terminate on written notice as permitted herein.",
    ].join("\n");
    const parties = [
      { name: "Stonebridge Wellness LLC", role: "Licensor", signerName: "Sandra Wells" },
      { name: "NovaPath Learning Inc.", role: "Platform Provider", signerName: "Caleb Price" },
      { name: "ClearSpring Distribution LLC", role: "Distributor", signerName: "Maya Coleman" },
    ];
    const applied = applyIdentityClarificationAnswers({
      parties,
      intake: `${three.filledIntake}\n${paper}`,
      unresolvedSubjects: [
        { name: "Managing Member", source: "customer_mentioned", email: "cryptocurated21+s@gmail.com" },
        { name: "Chief Product Officer", source: "customer_mentioned" },
        { name: "Foundry Ave", source: "customer_mentioned" },
        { name: "Either Party", source: "customer_mentioned" },
      ],
    });
    expect(applied.clarificationQuestion).toBeNull();
    expect(applied.parties.map((party) => party.signerName)).toEqual([
      "Sandra Wells",
      "Caleb Price",
      "Maya Coleman",
    ]);
    expect(applied.unresolvedSubjects.some((row) => /Managing Member|Chief Product Officer|Foundry Ave|Either Party/i.test(row.name))).toBe(
      false,
    );
    expect(
      identityClarificationMaterialItem({
        intakeRaw: three.filledIntake,
        parsedParties: parties,
        body: paper,
        additionalTerms: mergeUnresolvedIdentityIntoText("", [
          { name: "Managing Member", source: "customer_mentioned" },
          { name: "Foundry Ave", source: "customer_mentioned" },
        ]),
        unresolvedSubjects: [
          { name: "Managing Member", source: "customer_mentioned" },
          { name: "Foundry Ave", source: "customer_mentioned" },
        ],
      }),
    ).toBeNull();
    expect(
      contentClarificationQuestions({
        intake: three.filledIntake,
        body: paper,
        parsedParties: parties,
      }).filter(isIdentityClarificationQuestion),
    ).toEqual([]);
  });

  it("drops safeguard clause fragments that leaked into the party list", () => {
    const four = releaseScopeSample("four_party");
    const applied = applyIdentityClarificationAnswers({
      parties: [
        { name: "Lumen Bioinformatics Inc.", role: "Platform Developer", signerName: "Dr. Elena Vasquez" },
        { name: "Thalassa Data Systems LLC", role: "Data Infrastructure Provider", signerName: "Marcus Webb" },
        { name: "Coastal Meridian Analytics LLC", role: "Analytics Integrator", signerName: "Priya Nair" },
        {
          name: "Vanguard Regulatory Sciences Ltd.",
          role: "Regulatory Compliance Advisor",
          signerName: "James O'Sullivan",
        },
        {
          name: "No authority to bind: the service provider has no authority to bind the company",
          role: "Platform Developer",
          signerName: "Priya Nair",
        },
        {
          name: "Authority, representations, and access controls: provider may not make false or misleading promises, and company",
          role: "Data Infrastructure Provider",
          signerName: "James O'Sullivan",
        },
      ],
      intake: four.filledIntake,
    });
    expect(applied.parties.map((party) => party.name)).toEqual([
      "Lumen Bioinformatics Inc.",
      "Thalassa Data Systems LLC",
      "Coastal Meridian Analytics LLC",
      "Vanguard Regulatory Sciences Ltd.",
    ]);
    expect(applied.clarificationQuestion).toBeNull();
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

  it("keeps opening Consultant/Client collective roles when stored parties say Client/Service Provider", () => {
    const before = [
      `This Services Agreement (this "Agreement") is entered into by and between ${HARBOR} ("Consultant") and ${IRONVALE} ("Client"). Client, Service Provider, and Advisor may be referred to individually as a "Party" and collectively as the "Parties".`,
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      IRONVALE,
      "By: __________________________",
      "",
      "CONSULTANT:",
      HARBOR,
      "By: __________________________",
    ].join("\n");
    const after = applyIdentityResolutionToAuthorizedPaper(before, [
      { name: HARBOR, role: "Client" },
      { name: IRONVALE, role: "Service Provider" },
      { name: "Alex Rivera", role: "Advisor", email: "alex.rivera@advisor.test" },
    ]);
    expect(after).toMatch(/Consultant, Client, and Advisor may be referred to individually as a "Party"/);
    expect(after).not.toMatch(/Client, Service Provider, and Advisor may be referred to/);
  });

  it("does not treat a governing-law state as Harbor's authorized signer", () => {
    const before =
      'This Services Agreement is entered into by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client"). Consultant\'s authorized signer is ________.';
    const after = applyIdentityResolutionToAuthorizedPaper(before, [
      { name: HARBOR, role: "Consultant", signerName: "Delaware. Alex Rivera" },
      { name: IRONVALE, role: "Client" },
    ]);
    expect(after).not.toContain("Consultant's authorized signer is Delaware. Alex Rivera");
    expect(after).toContain("Consultant's authorized signer is ________.");
  });

  it("keeps an approved Consultant/Client/Advisor tail through freeze overlay", () => {
    const accepted = [
      `This Services Agreement (this "Agreement") is entered into by and between ${HARBOR} ("Consultant") and ${IRONVALE} ("Client"). Consultant, Client, and Advisor may be referred to individually as a "Party" and collectively as the "Parties".`,
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "Ironvale Manufacturing Inc",
      "By: __________________________",
      "Name: Sam Ironvale",
      "Title: _________________________",
      "Date: _____________________________",
      "",
      "CONSULTANT:",
      HARBOR,
      "By: __________________________",
      "Name: __________________________",
      "Title: _________________________",
      "Date: _____________________________",
      "",
      "ADVISOR:",
      "Alex Rivera",
      "By: __________________________",
      "Name: Alex Rivera",
      "Title: ________",
      "Date: _____________________________",
    ].join("\n");
    const identities = [
      {
        index: 0,
        partyDisplayName: HARBOR,
        email: "pat.harbor@harbor.test",
        representativeName: "Pat Harbor",
        title: null,
        blockHeading: "CLIENT",
        isIndividual: false,
      },
      {
        index: 1,
        partyDisplayName: IRONVALE,
        email: "sam.ironvale@ironvale.test",
        representativeName: "Sam Ironvale",
        title: null,
        blockHeading: "SERVICE PROVIDER",
        isIndividual: false,
      },
      {
        index: 2,
        partyDisplayName: "Alex Rivera",
        email: "alex.rivera@advisor.test",
        representativeName: "Alex Rivera",
        title: null,
        blockHeading: "ADVISOR",
        isIndividual: true,
      },
    ];
    const enforced = enforcePaidProSingleExecutionBlock(accepted, {
      draftPartyNames: [HARBOR, IRONVALE, "Alex Rivera"],
    }).text;
    const reconciled = reconcileExecutionBlockToRoleIdentities(enforced, identities).text;
    const overlaid = applySignerPartyIdentityToAuthoritativeAgreement(reconciled, identities, "", {
      signatureRegionOnly: true,
    }).text;
    expect(overlaid).toMatch(/CLIENT:\s*\nIronvale Manufacturing Inc/);
    expect(overlaid).toMatch(/CONSULTANT:\s*\nHarbor Peak Analytics LLC/);
    expect(overlaid).toMatch(/ADVISOR:\s*\nAlex Rivera/);
    expect(overlaid).not.toMatch(/CLIENT:\s*\nHarbor Peak Analytics LLC/);
    expect(overlaid.match(/Name: Delaware\. Alex Rivera/g)).toBeNull();
  });

  it("keeps the accepted Advisor tail through the production freeze overlay", () => {
    const generated = [
      `This Services Agreement (this "Agreement") is entered into by and between ${HARBOR} ("Consultant") and ${IRONVALE} ("Client"). Consultant and Client may be referred to individually as a "Party" and collectively as the "Parties."`,
      "",
      "1. PARTIES AND ROLES",
      "",
      "Consultant is an independent professional services firm. Client is retaining Consultant to perform the services described in this Agreement. The Provider (\"Provider\") will not become a party by that recitation.",
      "",
      "Consultant's authorized signer is Alex Rivera.",
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
      "Name: Alex Rivera",
      "Title: _________________________",
      "Date: _____________________________",
      "",
      "SERVICE PROVIDER:",
      IRONVALE,
      "By: __________________________",
      "Name: __________________________",
      "Title: _________________________",
      "Date: _____________________________",
    ].join("\n");
    const accepted = applyIdentityResolutionToAuthorizedPaper(generated, [
      { name: HARBOR, role: "Consultant" },
      { name: IRONVALE, role: "Client" },
      { name: "Alex Rivera", role: "Advisor", email: "alex.rivera@advisor.test" },
    ]);
    expect(accepted).toMatch(/CONSULTANT:\s*\nHarbor Peak Analytics LLC/);
    expect(accepted).toMatch(/CLIENT:\s*\nIronvale Manufacturing Inc/);
    expect(accepted).toMatch(/ADVISOR:\s*\nAlex Rivera/);
    expect(accepted).not.toContain("Consultant's authorized signer is Alex Rivera");
    expect(accepted).not.toMatch(/CLIENT:[\s\S]{0,160}Name: Alex Rivera/);
    expect(shouldPreserveApprovedAddedPartyExecutionTail(accepted, [HARBOR, IRONVALE, "Alex Rivera"])).toBe(
      true,
    );
    const parties = [
      {
        partyIndex: 0,
        partyLegalName: HARBOR,
        signerEmail: "pat.harbor@harbor.test",
        signerName: "Pat Harbor",
        signerTitle: "",
        partyAddress: "",
      },
      {
        partyIndex: 1,
        partyLegalName: IRONVALE.replace(/\.$/, ""),
        signerEmail: "sam.ironvale@ironvale.test",
        signerName: "Sam Ironvale",
        signerTitle: "",
        partyAddress: "",
      },
      {
        partyIndex: 2,
        partyLegalName: "Alex Rivera",
        signerEmail: "alex.rivera@advisor.test",
        signerName: "Alex Rivera",
        signerTitle: "",
        partyAddress: "",
      },
    ];
    const roleContext = {
      intakeText: INTAKE,
      acceptedCorpus: accepted,
      draftPartyNames: parties.map((party) => party.partyLegalName),
    };
    const enforced = enforcePaidProSingleExecutionBlock(accepted, {
      authorityParties: parties,
      intakeText: INTAKE,
      draftPartyNames: roleContext.draftPartyNames,
    }).text;
    const finalized = finalizePaidProSigningCorpusText(enforced, parties, roleContext, {
      signatureRegionOnly: true,
    }).text;
    const overlaid = applyPaidProSoTSignerExecutionOverlay(accepted, parties, roleContext);
    expect(enforced).toMatch(/CLIENT:\s*\nIronvale Manufacturing Inc/);
    expect(enforced).toMatch(/CONSULTANT:\s*\nHarbor Peak Analytics LLC/);
    expect(finalized).toMatch(/CLIENT:\s*\nIronvale Manufacturing Inc/);
    expect(finalized).not.toMatch(/CLIENT:\s*\nHarbor Peak Analytics LLC/);
    expect(overlaid).toMatch(/CLIENT:\s*\nIronvale Manufacturing Inc/);
    expect(overlaid).toMatch(/CONSULTANT:\s*\nHarbor Peak Analytics LLC/);
    expect(overlaid).toMatch(/ADVISOR:\s*\nAlex Rivera/);
    expect(overlaid).toMatch(/CONSULTANT:[\s\S]{0,220}Name: Pat Harbor/);
    expect(overlaid).toMatch(/CLIENT:[\s\S]{0,220}Name: Sam Ironvale/);
    expect(overlaid).toMatch(/ADVISOR:[\s\S]{0,220}Name: Alex Rivera/);
    expect(overlaid).not.toMatch(/CLIENT:\s*\nHarbor Peak Analytics LLC/);
    expect(overlaid).not.toMatch(/CONSULTANT:[\s\S]{0,160}Name: Alex Rivera/);
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
