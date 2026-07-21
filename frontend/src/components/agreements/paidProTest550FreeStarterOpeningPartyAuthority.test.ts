/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import { shouldShowCreateFlowStarterProRefineUpsell } from "./authoritativeCreateFlowReviewShell";
import {
  resolveStarterTwoPartyCommercialAuthority,
  starterCorpusContainsRawIntakeInstruction,
} from "./canonicalPartyRoleAuthority";
import {
  isCleanFreeStarterServerPreview,
  resolveFreeStarterReviewBody,
} from "./freeStarterReviewBodyResolver";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { enrichStarterPreviewPartiesFromIntake } from "./starterOpeningPartyPreserve";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { markPaidProPipelineValidationPassed, clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { TEST550_CEDAR, TEST550_CEDAR_NORTHWIND_INTAKE, TEST550_NORTHWIND } from "./paidProTest550Fixtures";

function draftShell(partial: Partial<ParsedDraftShape> & Pick<ParsedDraftShape, "title" | "jurisdiction" | "parties" | "agreement_family">): ParsedDraftShape {
  return {
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: true },
    ...partial,
  };
}

const TEST372_FREE_STACKED_PARTY_INTAKE = `Create a services agreement.

Party 1:
Blue Canyon Analytics LLC
Sarah Mitchell
CEO
sarah@bluecanyonanalytics.com

Party 2:
Harbor Peak Automation LLC
Michael Torres
President
michael@harborpeakautomation.com

Scope: Strategic business consulting and operational planning services.
Blue Canyon Analytics LLC will pay Harbor Peak Automation LLC $48,000 in monthly installments.
Term: twelve (12) months.
Governing law: Oklahoma.
Effective date: Upon full execution by all parties.`;


function contaminatedDraft(purpose: string = "operations consulting"): ParsedDraftShape {
  return draftShell({
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    purpose,
    payment_terms: "$18,000 in three monthly installments",
    duration: "three months",
    parties: [
      { name: TEST550_CEDAR_NORTHWIND_INTAKE, role: "Service Provider" },
      { name: TEST550_NORTHWIND, role: "Service Provider" },
    ],
    agreement_family: "services_agreement",
  });
}

function resolveVisibleStarterCorpus(
  draft: ParsedDraftShape,
  intake: string,
  apiDocumentText?: string,
): { body: string; source: string } {
  const resolved = resolveFreeStarterReviewBody({
    draft,
    rawIntake: intake,
    hasDraftPayload: Boolean(apiDocumentText),
    apiPayload: apiDocumentText ? { document_text: apiDocumentText } : null,
  });
  return { body: resolved.body, source: resolved.source };
}

function assertCedarNorthwindAuthority(body: string): void {
  expect(body).not.toMatch(/\bcreate\s+a\s+services\s+agreement\b/i);
  expect(body).toContain(TEST550_CEDAR);
  expect(body).toContain(TEST550_NORTHWIND);
  expect(body).toMatch(new RegExp(`${TEST550_NORTHWIND.replace(/\./g, "\\.")}[\\s\\S]{0,120}\\("Client"\\)`, "i"));
  expect(body).toMatch(new RegExp(`${TEST550_CEDAR.replace(/\./g, "\\.")}[\\s\\S]{0,120}\\("(Service Provider|Consultant)"\\)`, "i"));
  expect(body).not.toMatch(
    new RegExp(`${TEST550_CEDAR.replace(/\./g, "\\.")}[\\s\\S]{0,80}\\("Client"\\)[\\s\\S]{0,200}${TEST550_NORTHWIND.replace(/\./g, "\\.")}[\\s\\S]{0,80}\\("Service Provider"\\)`, "i"),
  );
  expect(body).not.toMatch(/\("Service Provider"\)[\s\S]{0,120}\("Service Provider"\)/i);
  expect(body).toMatch(/Northwind[\s\S]{0,80}pay[\s\S]{0,80}Cedar Ridge/i);
  expect(body).toMatch(/Cedar Ridge[\s\S]{0,120}provide/i);
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
});

describe("TEST550 — Free Starter opening, party identity, and role authority", () => {
  it("Case 1 — Cedar Ridge / Northwind natural-language intake", () => {
    const draft = contaminatedDraft();
    const { body, source } = resolveVisibleStarterCorpus(draft, TEST550_CEDAR_NORTHWIND_INTAKE, TEST550_CEDAR_NORTHWIND_INTAKE);
    expect(source).toBe("repaired_starter_preview");
    assertCedarNorthwindAuthority(body);
    expect(body.length).toBeGreaterThan(200);
  });

  it("Case 2 — reversed intake mention order (provider named before client)", () => {
    const intake = TEST550_CEDAR_NORTHWIND_INTAKE;
    const authority = resolveStarterTwoPartyCommercialAuthority(intake);
    expect(authority?.clientName).toContain("Northwind");
    expect(authority?.providerName).toContain("Cedar Ridge");
    const draft = contaminatedDraft();
    const { body } = resolveVisibleStarterCorpus(draft, intake);
    assertCedarNorthwindAuthority(body);
  });

  it("Case 3 — client mentioned first still yields same canonical roles", () => {
    const intake = `Create a services agreement between ${TEST550_NORTHWIND}, the client, and ${TEST550_CEDAR}, the service provider. ${TEST550_NORTHWIND} will pay ${TEST550_CEDAR} $18,000 in three monthly installments. ${TEST550_CEDAR} will provide operations consulting. Oklahoma law.`;
    const draft = draftShell({
      title: "Services Agreement",
      jurisdiction: "Oklahoma",
      purpose: "operations consulting",
      payment_terms: "$18,000",
      duration: "three months",
      parties: [
        { name: TEST550_NORTHWIND, role: "party" },
        { name: TEST550_CEDAR, role: "party" },
      ],
      agreement_family: "services_agreement",
    });
    const { body } = resolveVisibleStarterCorpus(draft, intake);
    assertCedarNorthwindAuthority(body);
  });

  it("Case 4 — Consultant vocabulary maps to a single consultant role", () => {
    const intake = `Services agreement between ${TEST550_CEDAR}, the consultant, and ${TEST550_NORTHWIND}, the client. ${TEST550_NORTHWIND} will pay ${TEST550_CEDAR} $10,000. ${TEST550_CEDAR} will provide advisory services.`;
    const draft = draftShell({
      title: "Services Agreement",
      jurisdiction: "Oklahoma",
      parties: [
        { name: TEST550_CEDAR, role: "Consultant" },
        { name: TEST550_NORTHWIND, role: "Consultant" },
      ],
      agreement_family: "consulting_agreement",
      purpose: "advisory services",
      payment_terms: "$10,000",
      duration: "3 months",
    });
    const enriched = enrichStarterPreviewPartiesFromIntake(draft, intake);
    expect(enriched.parties?.map((p) => p.role)).toEqual(["Client", "Consultant"]);
    const preview = buildStarterAgreementPreviewForReview(enriched, { intakeText: intake });
    expect(preview).toMatch(/Consultant/i);
    expect(preview).not.toMatch(/\("Consultant"\)[\s\S]{0,80}\("Consultant"\)/i);
  });

  it("Case 5 — explicit payer/payee language reinforces canonical roles", () => {
    const intake = `${TEST550_NORTHWIND} will pay ${TEST550_CEDAR} $18,000 in three monthly installments for operations consulting.`;
    const draft = draftShell({
      title: "Services Agreement",
      jurisdiction: "Oklahoma",
      parties: [
        { name: TEST550_CEDAR, role: "Service Provider" },
        { name: TEST550_NORTHWIND, role: "Service Provider" },
      ],
      agreement_family: "services_agreement",
      purpose: "operations consulting",
      payment_terms: "$18,000",
      duration: "three months",
    });
    const { body } = resolveVisibleStarterCorpus(draft, `${TEST550_CEDAR_NORTHWIND_INTAKE} ${intake}`);
    assertCedarNorthwindAuthority(body);
  });

  it("Case 6 — no explicit role words; payment and performance infer roles", () => {
    const apex = "Apex Field Services LLC";
    const beacon = "Beacon Operations Group Inc.";
    const intake = `Agreement between ${apex} and ${beacon}. ${beacon} will provide logistics consulting. ${apex} will pay ${beacon} $9,500 monthly. Texas law.`;
    const draft = draftShell({
      title: "Services Agreement",
      jurisdiction: "Texas",
      parties: [
        { name: apex, role: "party" },
        { name: beacon, role: "party" },
      ],
      agreement_family: "services_agreement",
      purpose: "logistics consulting",
      payment_terms: "$9,500 monthly",
      duration: "6 months",
    });
    const { body } = resolveVisibleStarterCorpus(draft, intake);
    expect(body).not.toMatch(/\bcreate\s+a\b/i);
    expect(body).toMatch(/Apex Field Services LLC/i);
    expect(body).toMatch(/Beacon Operations Group Inc\.?/i);
    expect(body).toMatch(/\$?\s*9,?500/i);
    expect(body).toMatch(/Beacon[\s\S]{0,120}provide/i);
    expect(body).not.toMatch(/\("Service Provider"\)[\s\S]{0,120}\("Service Provider"\)/i);
  });

  it("Case 7 — anti-fixture guard with unrelated entities", () => {
    const left = "Iron Vale Systems Inc.";
    const right = "Copper Lane Analytics LLC";
    const intake = `Create a services agreement between ${left}, the contractor, and ${right}, the customer. ${right} will pay ${left} $22,000. ${left} will provide data migration services. Delaware law.`;
    const draft = draftShell({
      title: "Services Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: intake, role: "party" },
        { name: right, role: "party" },
      ],
      agreement_family: "services_agreement",
      purpose: "data migration",
      payment_terms: "$22,000",
      duration: "90 days",
    });
    const { body } = resolveVisibleStarterCorpus(draft, intake);
    expect(body).toContain(left);
    expect(body).toContain(right);
    expect(body).toMatch(/Copper Lane[\s\S]{0,80}\("Client"\)/i);
    expect(body).not.toMatch(/\bcreate\s+a\s+services\s+agreement\s+between\b/i);
  });

  it("Case 8 — TEST372 stacked identity intake still preserves legal entities", () => {
    const draft = draftShell({
      title: "Services Agreement",
      jurisdiction: "Oklahoma",
      parties: [
        { name: "Blue Canyon Analytics LLC Sarah Mitchell CEO sarah", role: "Client" },
        { name: "Harbor Peak Automation LLC Michael Torres President michael", role: "Service Provider" },
      ],
      agreement_family: "services_agreement",
      purpose: "Strategic business consulting.",
      payment_terms: "$48,000 in monthly installments",
      duration: "twelve (12) months",
    });
    const { body } = resolveVisibleStarterCorpus(draft, TEST372_FREE_STACKED_PARTY_INTAKE);
    expect(body).toContain("Blue Canyon Analytics LLC");
    expect(body).toContain("Harbor Peak Automation LLC");
    expect(body).not.toMatch(/\bcreate\s+a\s+services\s+agreement\b/i);
  });

  it("Case 9 — conversion-flow parity: free_starter shell without comparison card", () => {
    const draft = contaminatedDraft();
    const { body } = resolveVisibleStarterCorpus(draft, TEST550_CEDAR_NORTHWIND_INTAKE);
    assertCedarNorthwindAuthority(body);
    expect(
      shouldShowCreateFlowStarterProRefineUpsell({
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
    expect(starterCorpusContainsRawIntakeInstruction(body)).toBe(false);
    expect(isCleanFreeStarterServerPreview(TEST550_CEDAR_NORTHWIND_INTAKE)).toBe(false);
    // Rendered DOM + checkout wiring: paidProTest552RenderedConversionSurface.test.tsx
  });

  it("Case 10 — paid frozen corpus is not mutated by starter party authority", () => {
    const frozen = [
      "SERVICES AGREEMENT",
      "",
      `This Services Agreement is between Red Mesa Logistics LLC ("Client") and Harbor Peak Automation LLC ("Service Provider").`,
      "",
      "1. Services",
      "Provider performs workflow consulting.",
      "",
      "IN WITNESS WHEREOF",
      "CLIENT: Red Mesa Logistics LLC",
      "SERVICE PROVIDER: Harbor Peak Automation LLC",
    ].join("\n");
    markPaidProPipelineValidationPassed({ text: frozen, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: frozen,
      source: "server_full_draft",
      draft: draftShell({
        title: "Services Agreement",
        jurisdiction: "Texas",
        parties: [
          { name: "Red Mesa Logistics LLC", role: "Client" },
          { name: "Harbor Peak Automation LLC", role: "Service Provider" },
        ],
        agreement_family: "services_agreement",
        purpose: "workflow consulting",
        payment_terms: "$5,000",
        duration: "6 months",
      }),
      intakeText: "Agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
    });
    const paidRender = resolvePaidProReviewRenderPlain({
      draft: draftShell({
        title: "Services Agreement",
        jurisdiction: "Texas",
        parties: [
          { name: "Red Mesa Logistics LLC", role: "Client" },
          { name: "Harbor Peak Automation LLC", role: "Service Provider" },
        ],
        agreement_family: "services_agreement",
        purpose: "workflow consulting",
        payment_terms: "$5,000",
        duration: "6 months",
      }),
      intakeText: TEST550_CEDAR_NORTHWIND_INTAKE,
    });
    expect(paidRender).toContain("Red Mesa Logistics LLC");
    expect(paidRender).not.toContain(TEST550_CEDAR);
    expect(paidRender).not.toContain(TEST550_NORTHWIND);

    clearPaidProSourceOfTruth();
    const starterOnly = buildStarterAgreementPreviewForReview(
      enrichStarterPreviewPartiesFromIntake(contaminatedDraft(), TEST550_CEDAR_NORTHWIND_INTAKE),
      { intakeText: TEST550_CEDAR_NORTHWIND_INTAKE },
    );
    expect(starterOnly).toContain(TEST550_NORTHWIND);
    expect(starterOnly).not.toBe(frozen);
  });
});
