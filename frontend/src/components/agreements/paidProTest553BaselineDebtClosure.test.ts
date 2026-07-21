/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPremiumPostCheckoutStitchedBody } from "./premiumCheckoutStitchedBody";
import {
  assessProfessionalProClauseCoverage,
  professionalClauseMaterialEvidencePresent,
} from "./paidProProfessionalClauseCoverage";
import {
  evaluatePaidProFreezeCandidateGates,
  preparePaidProFreezeCandidateText,
} from "./paidProFreezeCandidate";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { finalizePaidProSigningCorpusText } from "./paidProSignerSigningCorpusHygiene";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  readConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import { markCurrentSessionProEntitlementComplete, markCurrentSessionFreeStarterIntent } from "./paidProSessionEligibility";
import {
  TEST494_INTAKE,
  TEST494_SIGNERS,
  buildTest494ThreePartySection10Corpus,
  buildTest494ThreePartySection10CorpusWithoutOperativeIp,
  test494Draft,
} from "./paidProTest494Fixtures";
import {
  TEST371_EXPECTED_PARTIES,
  TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE,
} from "./paidProTest371QuadrpartiteFixtures";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { mergeLabeledPartyAuthorityIntoParties } from "./paidProSignerMetadataAuthority";
import {
  resolveAuthoritativeCreateFlowReviewShell,
  shouldShowCreateFlowStarterProRefineUpsell,
} from "./authoritativeCreateFlowReviewShell";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED = "Red Mesa Logistics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const RED_EMAIL = "contracts@redmesa-logistics.com";
const HARBOR_EMAIL = "legal@harborpeakautomation.com";

const ALT_CLIENT = "Cedar Ridge Analytics LLC";
const ALT_PROVIDER = "Summit Workflow Partners LLC";
const ALT_INTAKE = `
Create a services agreement between ${ALT_CLIENT} and ${ALT_PROVIDER} for data pipeline automation.
${ALT_CLIENT}: Jordan Lee, CEO, jordan.lee@cedarridge.io, 500 Market St, Denver, CO 80202
${ALT_PROVIDER}: Priya Shah, President, priya.shah@summitworkflow.com, 88 Harbor Blvd, Seattle, WA 98101
Delaware governing law. Electronic signatures allowed.
`.trim();

function altDraft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Delaware",
    agreement_family: "services_agreement",
    parties: [
      { name: ALT_CLIENT, role: "Client" },
      { name: ALT_PROVIDER, role: "Service Provider" },
    ],
    purpose: "Data pipeline automation.",
    payment_terms: "$12,000",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: { amount: 12_000, cadence: null, valid: true },
  };
}

function test392Intake(): string {
  return [
    `Create a consulting agreement between ${RED} and ${HARBOR}.`,
    `${RED}: Sarah Mitchell, CEO, ${RED_EMAIL}, 100 Commerce Way, Tulsa, OK 74103`,
    `${HARBOR}: Michael Torres, President, ${HARBOR_EMAIL}, 250 Innovation Drive, Austin, TX 78701`,
    "Texas law.",
  ].join("\n");
}

function test392Draft(): ParsedDraftShape {
  return {
    title: "Consulting Agreement",
    jurisdiction: "Texas",
    agreement_family: "consulting_agreement",
    parties: [
      { name: RED, role: "Client", email: RED_EMAIL } as never,
      { name: HARBOR, role: "Service Provider", email: HARBOR_EMAIL } as never,
    ],
    purpose: "Logistics automation consulting.",
    payment_terms: "Fixed monthly fee.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 48_000, cadence: "monthly", valid: true },
  };
}

function test392Parties() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: RED,
    recipient2Name: HARBOR,
    recipient1Email: RED_EMAIL,
    recipient2Email: HARBOR_EMAIL,
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: ["100 Commerce Way, Tulsa, OK 74103", "250 Innovation Drive, Austin, TX 78701"],
  }).parties;
}

function buildTest392SubstantiveCorpus(): string {
  const clause =
    "The Service Provider shall render professional consulting services in a diligent and workmanlike manner. ";
  const body = clause.repeat(180);
  return [
    "CONSULTING AGREEMENT",
    "",
    `This Agreement is between ${RED} ("Client") and ${HARBOR} ("Service Provider").`,
    "",
    body,
    "",
    "10. Notices",
    `If to ${RED}:\nEmail: ${RED_EMAIL}`,
    `If to ${HARBOR}:\nEmail: ${HARBOR_EMAIL}`,
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${RED}`,
    "By: __________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "",
    `SERVICE PROVIDER: ${HARBOR}`,
    "By: __________________________",
    "Name: Michael Torres",
    "Title: President",
  ].join("\n");
}

function freeze494Corpus(raw = buildTest494ThreePartySection10Corpus()) {
  const draft = test494Draft();
  const intake = TEST494_INTAKE;
  const preview = preparePaidProServerDocumentForAcceptance(raw, draft, intake).text;
  const prep = preparePaidProFreezeCandidateText({
    text: preview,
    intakeText: intake,
    draft,
    source: "server_full_draft",
  });
  const freezeGated = evaluatePaidProFreezeCandidateGates(prep, {
    text: preview,
    intakeText: intake,
    draft,
    source: "server_full_draft",
  });
  expect(freezeGated.ok).toBe(true);
  markPaidProPipelineValidationPassed({ text: freezeGated.text, source: "server_full_draft" });
  establishPaidProSourceOfTruth({
    text: freezeGated.text,
    source: "server_full_draft",
    draft,
    intakeText: intake,
    generationOutcome: "ok",
  });
  return { draft, intake, freezeGated, preview };
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
});

describe("TEST553 — Paid Pro baseline debt closure", () => {
  beforeEach(() => {
    markCurrentSessionProEntitlementComplete();
  });

  it("Case 1 — complete professional corpus establishes SoT with stable hash and IP preserved", () => {
    setConsumedPaidProSignerMetadataAuthority({
      parties: TEST494_SIGNERS.map((party, partyIndex) => ({ ...party, partyIndex })),
      source: "live_ui",
      hash: "test553",
      updatedAt: Date.now(),
    });
    const { freezeGated } = freeze494Corpus();
    const sot = getPaidProSourceOfTruth()!;
    expect(sot.text).toBe(freezeGated.text);
    expect(hashPaidProCorpus(sot.text)).toBe(sot.hash);
    expect(professionalClauseMaterialEvidencePresent(sot.text, "intellectual_property")).toBe(true);
    expect(countPaidProExecutionBlocks(sot.text)).toBe(1);
  });

  it("Case 2 — missing operative IP remains blocked at SoT establishment", () => {
    const incomplete = buildTest494ThreePartySection10CorpusWithoutOperativeIp();
    const draft = test494Draft();
    const preview = preparePaidProServerDocumentForAcceptance(incomplete, draft, TEST494_INTAKE).text;
    const prep = preparePaidProFreezeCandidateText({
      text: preview,
      intakeText: TEST494_INTAKE,
      draft,
      source: "server_full_draft",
    });
    expect(() =>
      establishPaidProSourceOfTruth({
        text: prep.text,
        source: "server_full_draft",
        draft,
        intakeText: TEST494_INTAKE,
        generationOutcome: "ok",
      }),
    ).toThrow(/\[professional-pro-clause-coverage-blocked\].*intellectual_property/);
  });

  it("Case 3 — equivalent IP drafting via ownership and license language passes assessment", () => {
    const equivalent = buildTest494ThreePartySection10Corpus().replace(
      "INTELLECTUAL PROPERTY AND LICENSE GRANT",
      "OWNERSHIP AND LICENSE OF PLATFORM MATERIALS",
    );
    const assessment = assessProfessionalProClauseCoverage({
      text: equivalent,
      intake: TEST494_INTAKE,
    });
    expect(assessment.materialClausesMissing).not.toContain("intellectual_property");
    expect(assessment.ok).toBe(true);
  });

  it("Case 4 — minimal intake production composition reaches professional acceptance", () => {
    const intake = `
Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup.
Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.
`.trim();
    const draft: ParsedDraftShape = {
      title: "Services Agreement",
      jurisdiction: "Texas",
      agreement_family: "services_agreement",
      parties: [
        { name: RED, role: "Client" },
        { name: HARBOR, role: "Service Provider" },
      ],
      purpose: "AI workflow setup.",
      payment_terms: "$5,000",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: 5000, cadence: null, valid: true },
    };
    const body = buildPremiumPostCheckoutStitchedBody(draft, intake);
    const professional = assessProfessionalProClauseCoverage({ text: body, intake });
    expect(professional.ok).toBe(true);
    expect(professional.materialClausesMissing).not.toContain("intellectual_property");
    expect(body.toLowerCase()).toMatch(/client owns|work product|pre-existing/);
  });

  it("Case 5 — alternate entities use the same production composition authority", () => {
    const body = buildPremiumPostCheckoutStitchedBody(altDraft(), ALT_INTAKE);
    expect(body).toContain(ALT_CLIENT);
    expect(body).toContain(ALT_PROVIDER);
    const professional = assessProfessionalProClauseCoverage({ text: body, intake: ALT_INTAKE });
    expect(professional.applies).toBe(false);
    const operative = body.split(/\bIN WITNESS WHEREOF\b/i)[0] ?? body;
    expect(operative).not.toMatch(/Create a services agreement between/i);
    expect(body.toLowerCase()).toMatch(/workflow|automation|services/);
  });

  it("Case 6 — TEST392 canonical signing bundle preserves identities through freeze", () => {
    const parties = test392Parties();
    setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "553", updatedAt: 0 });
    markPaidProPipelineValidationPassed({
      text: buildTest392SubstantiveCorpus(),
      source: "server_full_draft",
    });
    establishPaidProSourceOfTruth({
      text: buildTest392SubstantiveCorpus(),
      source: "server_full_draft",
      draft: test392Draft(),
      intakeText: test392Intake(),
    });
    const sot = getPaidProSourceOfTruthText();
    expect(sot).toContain(RED);
    expect(sot).toContain(HARBOR);
    expect(sot).not.toMatch(/CLIENT:\s*Create a consulting agreement/i);
    expect(sot).not.toMatch(/SERVICE PROVIDER:\s*Red Mesa Logistics LLC/i);
  });

  it("Case 7 — raw intake execution-heading language is repaired before freeze", () => {
    const parties = test392Parties();
    setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "553b", updatedAt: 0 });
    const malformed = [
      buildTest392SubstantiveCorpus().replace(
        `CLIENT: ${RED}`,
        `CLIENT: Create a consulting agreement between ${RED}`,
      ),
      `SERVICE PROVIDER: ${RED}`,
    ].join("\n");
    markPaidProPipelineValidationPassed({ text: malformed, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: malformed,
      source: "server_full_draft",
      draft: test392Draft(),
      intakeText: test392Intake(),
    });
    const sot = getPaidProSourceOfTruthText();
    expect(sot).not.toMatch(/CLIENT:\s*Create a consulting agreement/i);
    expect(sot).toContain(HARBOR);
    expect(sot).not.toMatch(/SERVICE PROVIDER:\s*Red Mesa Logistics LLC/i);
  });

  it("Case 8 — signer emails survive canonicalization and signing packet creation", () => {
    const parties = test392Parties();
    setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "553c", updatedAt: 0 });
    markPaidProPipelineValidationPassed({
      text: buildTest392SubstantiveCorpus(),
      source: "server_full_draft",
    });
    establishPaidProSourceOfTruth({
      text: buildTest392SubstantiveCorpus(),
      source: "server_full_draft",
      draft: test392Draft(),
      intakeText: test392Intake(),
    });
    const sot = getPaidProSourceOfTruthText();
    const signing = finalizePaidProSigningCorpusText(sot, parties, {
      intakeText: test392Intake(),
      draftPartyNames: [RED, HARBOR],
    }).text;
    const authority = readConsumedPaidProSignerMetadataAuthority()!;
    expect(authority.parties[0]?.signerEmail).toBe(RED_EMAIL);
    expect(authority.parties[1]?.signerEmail).toBe(HARBOR_EMAIL);
    expect(sot).toContain(RED_EMAIL);
    expect(sot).toContain(HARBOR_EMAIL);
    expect(signing).toContain(HARBOR_EMAIL);
  });

  it("Case 9 — review and signing surfaces share one execution structure", () => {
    const parties = test392Parties();
    setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "553d", updatedAt: 0 });
    markPaidProPipelineValidationPassed({
      text: buildTest392SubstantiveCorpus(),
      source: "server_full_draft",
    });
    establishPaidProSourceOfTruth({
      text: buildTest392SubstantiveCorpus(),
      source: "server_full_draft",
      draft: test392Draft(),
      intakeText: test392Intake(),
    });
    const sot = getPaidProSourceOfTruthText();
    const review = preparePaidProReviewDisplayPlain(sot).text;
    const signing = finalizePaidProSigningCorpusText(sot, parties, {
      intakeText: test392Intake(),
      draftPartyNames: [RED, HARBOR],
    }).text;
    const parity = auditPaidProReviewRenderSotParity({ reviewPlain: review });
    expect(parity.invariantOk).toBe(true);
    expect(countPaidProExecutionBlocks(review)).toBe(1);
    expect(countPaidProExecutionBlocks(signing)).toBe(1);
    expect(review).toContain(RED);
    expect(signing).toContain(HARBOR);
    expect(review).not.toMatch(/CLIENT:\s*Create a consulting agreement/i);
  });

  it("Case 10 — cross-agreement isolation prevents signer metadata leakage", () => {
    setConsumedPaidProSignerMetadataAuthority({
      parties: test392Parties(),
      source: "live_ui",
      hash: "553e",
      updatedAt: 0,
    });
    markPaidProPipelineValidationPassed({
      text: buildTest392SubstantiveCorpus(),
      source: "server_full_draft",
    });
    establishPaidProSourceOfTruth({
      text: buildTest392SubstantiveCorpus(),
      source: "server_full_draft",
      draft: test392Draft(),
      intakeText: test392Intake(),
    });
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();

    const altBody = buildPremiumPostCheckoutStitchedBody(altDraft(), ALT_INTAKE);
    markPaidProPipelineValidationPassed({ text: altBody, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: altBody,
      source: "server_full_draft",
      draft: altDraft(),
      intakeText: ALT_INTAKE,
    });
    const sot = getPaidProSourceOfTruthText();
    expect(sot).not.toContain(RED_EMAIL);
    expect(sot).not.toContain(HARBOR_EMAIL);
    expect(sot).toContain(ALT_CLIENT);
  });

  it("Case 11 — four-party execution retains entity headings (TEST371 / TEST551 non-regression)", () => {
    const parties = mergeLabeledPartyAuthorityIntoParties([], TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    expect(parties).toHaveLength(4);
    const corpus = [
      "SOFTWARE PLATFORM AGREEMENT",
      "",
      "This Agreement is entered into among the parties listed below.",
      "",
      ...Array.from({ length: 8 }, (_, i) => `${i + 1}. Operative clause ${i + 1}.`),
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      ...TEST371_EXPECTED_PARTIES.flatMap((entity) => [
        entity,
        "By: __________________________",
        "Name: Signer",
        "Title: Officer",
        "",
      ]),
    ].join("\n");
    const rebuilt = enforcePaidProSingleExecutionBlock(corpus, {
      authorityParties: parties,
      intakeText: TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE,
    }).text;
    const tailIdx = rebuilt.search(/\bIN WITNESS WHEREOF\b/i);
    const tail = tailIdx >= 0 ? rebuilt.slice(tailIdx) : rebuilt;
    expect((tail.match(/^\s*By\s*:/gim) || []).length).toBe(4);
    for (const entity of TEST371_EXPECTED_PARTIES) {
      expect(tail).toMatch(new RegExp(entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
    expect(tail).not.toMatch(/^\s*CLIENT\s*:/im);
    expect(tail).not.toMatch(/^\s*PARTY\s+\d+\s*:/im);
  });

  it("Case 12 — Free Starter funnel surfaces remain isolated from Paid Pro repair (TEST549 non-regression)", () => {
    markCurrentSessionFreeStarterIntent();
    expect(
      resolveAuthoritativeCreateFlowReviewShell({
        tier: "free",
        workspaceProEntitled: false,
        premiumCheckoutCompleted: false,
      }),
    ).toBe("free_starter");
    expect(
      shouldShowCreateFlowStarterProRefineUpsell({
        shellInput: { tier: "free", workspaceProEntitled: false },
        hasPaidPremiumCompletionSession: () => false,
        authoritativePremiumUiCommitted: false,
        paidProAuthoritative: false,
        suppressIntakePremiumUpsell: false,
        proAgreementEntitled: false,
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        belowDocumentRefineSectionParentEligible: true,
        premiumPaidDocumentSurface: false,
        showStarterProRefineUpsellCardEligible: true,
      }),
    ).toBe(false);
  });
});
