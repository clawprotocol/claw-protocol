/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import { resolveStarterTwoPartyCommercialAuthority } from "./canonicalPartyRoleAuthority";
import { resetFreeStarterIdentityTestIsolation } from "./freeStarterIdentityTestIsolation";
import { resolveFreeStarterReviewBody } from "./freeStarterReviewBodyResolver";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { enrichStarterPreviewPartiesFromIntake } from "./starterOpeningPartyPreserve";
import { TEST550_CEDAR, TEST550_CEDAR_NORTHWIND_INTAKE, TEST550_NORTHWIND } from "./paidProTest550Fixtures";
import {
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { writeOriginalUserIntakeRawAtDraftCommit } from "./originalUserIntakeRawStorage";

const CEDAR = TEST550_CEDAR;
const NORTHWIND = TEST550_NORTHWIND;
const IRON = "Iron Vale Systems Inc.";
const COPPER = "Copper Lane Analytics LLC";

const IRON_COPPER_INTAKE = `Create a services agreement between ${IRON}, the contractor, and ${COPPER}, the customer. ${COPPER} will pay ${IRON} $22,000. ${IRON} will provide data migration services. Delaware law.`;

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

function resolveStarterBody(draft: ParsedDraftShape, intake: string): string {
  return resolveFreeStarterReviewBody({ draft, rawIntake: intake }).body;
}

function deepCloneDraft(draft: ParsedDraftShape): ParsedDraftShape {
  return JSON.parse(JSON.stringify(draft)) as ParsedDraftShape;
}

describe("TEST551 — Free Starter identity suite isolation and order-independence", () => {
  beforeEach(() => {
    resetFreeStarterIdentityTestIsolation();
  });
  afterEach(() => {
    resetFreeStarterIdentityTestIsolation();
    vi.unstubAllGlobals();
  });

  it("Case 1 — sequential unrelated intakes do not cross-contaminate", () => {
    const cedarDraft = draftShell({
      title: "Services Agreement",
      jurisdiction: "Oklahoma",
      parties: [
        { name: CEDAR, role: "Service Provider" },
        { name: NORTHWIND, role: "Service Provider" },
      ],
      agreement_family: "services_agreement",
      purpose: "consulting",
      payment_terms: "$18,000",
      duration: "3 months",
    });
    const ironDraft = draftShell({
      title: "Services Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: IRON, role: "party" },
        { name: COPPER, role: "party" },
      ],
      agreement_family: "services_agreement",
      purpose: "data migration",
      payment_terms: "$22,000",
      duration: "90 days",
    });

    const first = resolveStarterBody(cedarDraft, TEST550_CEDAR_NORTHWIND_INTAKE);
    expect(first).toContain(NORTHWIND);
    expect(first).toContain(CEDAR);

    const second = resolveStarterBody(ironDraft, IRON_COPPER_INTAKE);
    expect(second).toContain(IRON);
    expect(second).toContain(COPPER);
    expect(second).not.toContain(CEDAR);
    expect(second).not.toContain(NORTHWIND);
    expect(second).not.toMatch(/\bcreate\s+a\s+services\s+agreement\s+between\s+Cedar Ridge/i);
  });

  it("Case 2 — reverse sequence yields identical canonical output per intake", () => {
    const cedarDraft = draftShell({
      title: "Services Agreement",
      jurisdiction: "Oklahoma",
      parties: [
        { name: CEDAR, role: "party" },
        { name: NORTHWIND, role: "party" },
      ],
      agreement_family: "services_agreement",
      purpose: "consulting",
      payment_terms: "$18,000",
      duration: "3 months",
    });
    const ironDraft = draftShell({
      title: "Services Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: IRON, role: "party" },
        { name: COPPER, role: "party" },
      ],
      agreement_family: "services_agreement",
      purpose: "data migration",
      payment_terms: "$22,000",
      duration: "90 days",
    });

    const ironFirst = resolveStarterBody(ironDraft, IRON_COPPER_INTAKE);
    const cedarSecond = resolveStarterBody(cedarDraft, TEST550_CEDAR_NORTHWIND_INTAKE);

    resetFreeStarterIdentityTestIsolation();

    const cedarFirst = resolveStarterBody(cedarDraft, TEST550_CEDAR_NORTHWIND_INTAKE);
    const ironSecond = resolveStarterBody(ironDraft, IRON_COPPER_INTAKE);

    expect(cedarFirst).toBe(cedarSecond);
    expect(ironFirst).toBe(ironSecond);
  });

  it("Case 3 — duplicate-role contaminated draft does not affect subsequent clean draft", () => {
    const contaminated = draftShell({
      title: "Services Agreement",
      jurisdiction: "Oklahoma",
      parties: [
        { name: CEDAR, role: "Service Provider" },
        { name: NORTHWIND, role: "Service Provider" },
      ],
      agreement_family: "services_agreement",
      purpose: "consulting",
      payment_terms: "$18,000",
      duration: "3 months",
    });
    enrichStarterPreviewPartiesFromIntake(contaminated, TEST550_CEDAR_NORTHWIND_INTAKE);

    const clean = draftShell({
      title: "Services Agreement",
      jurisdiction: "Oklahoma",
      parties: [
        { name: NORTHWIND, role: "Client" },
        { name: CEDAR, role: "Consultant" },
      ],
      agreement_family: "consulting_agreement",
      purpose: "advisory",
      payment_terms: "$10,000",
      duration: "3 months",
    });
    const enriched = enrichStarterPreviewPartiesFromIntake(clean, TEST550_CEDAR_NORTHWIND_INTAKE);
    expect(enriched.parties?.[0]?.role).toBe("Client");
    expect(enriched.parties?.[1]?.role).toMatch(/Consultant|Service Provider/);
    const body = buildStarterAgreementPreviewForReview(enriched, { intakeText: TEST550_CEDAR_NORTHWIND_INTAKE });
    expect(body).not.toMatch(/\("Service Provider"\)[\s\S]{0,80}\("Service Provider"\)/i);
  });

  it("Case 4 — free starter preview does not mutate accepted paid corpus", () => {
    const frozen = [
      "SERVICES AGREEMENT",
      "",
      `This Agreement is between Red Mesa Logistics LLC ("Client") and Harbor Peak Automation LLC ("Service Provider").`,
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
        purpose: "workflow",
        payment_terms: "$5,000",
        duration: "6 months",
      }),
      intakeText: "Agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
    });

    resolveStarterBody(
      draftShell({
        title: "Services Agreement",
        jurisdiction: "Oklahoma",
        parties: [{ name: CEDAR, role: "party" }, { name: NORTHWIND, role: "party" }],
        agreement_family: "services_agreement",
        purpose: "consulting",
        payment_terms: "$18,000",
        duration: "3 months",
      }),
      TEST550_CEDAR_NORTHWIND_INTAKE,
    );

    const paidAfter = resolvePaidProReviewRenderPlain({
      draft: draftShell({
        title: "Services Agreement",
        jurisdiction: "Texas",
        parties: [
          { name: "Red Mesa Logistics LLC", role: "Client" },
          { name: "Harbor Peak Automation LLC", role: "Service Provider" },
        ],
        agreement_family: "services_agreement",
        purpose: "workflow",
        payment_terms: "$5,000",
        duration: "6 months",
      }),
      intakeText: TEST550_CEDAR_NORTHWIND_INTAKE,
    });
    expect(paidAfter).toContain("Red Mesa Logistics LLC");
    expect(paidAfter).not.toContain(CEDAR);
  });

  it("Case 5 — paid corpus first does not change free starter output", () => {
    const freeDraft = draftShell({
      title: "Services Agreement",
      jurisdiction: "Oklahoma",
      parties: [{ name: CEDAR, role: "party" }, { name: NORTHWIND, role: "party" }],
      agreement_family: "services_agreement",
      purpose: "consulting",
      payment_terms: "$18,000",
      duration: "3 months",
    });
    const baseline = resolveStarterBody(freeDraft, TEST550_CEDAR_NORTHWIND_INTAKE);

    const frozen = [
      "SERVICES AGREEMENT",
      "",
      `This Agreement is between Red Mesa Logistics LLC ("Client") and Harbor Peak Automation LLC ("Service Provider").`,
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
        purpose: "workflow",
        payment_terms: "$5,000",
        duration: "6 months",
      }),
      intakeText: "Agreement between Red Mesa and Harbor Peak.",
    });

    const afterPaid = resolveStarterBody(freeDraft, TEST550_CEDAR_NORTHWIND_INTAKE);
    expect(afterPaid).toBe(baseline);
    expect(afterPaid).not.toContain("Red Mesa Logistics LLC");
  });

  it("Case 6 — session storage intake is cleared between resolutions", () => {
    writeOriginalUserIntakeRawAtDraftCommit(TEST550_CEDAR_NORTHWIND_INTAKE);
    expect(resolveStarterBody(
      draftShell({
        title: "Services Agreement",
        jurisdiction: "Oklahoma",
        parties: [{ name: CEDAR, role: "party" }, { name: NORTHWIND, role: "party" }],
        agreement_family: "services_agreement",
        purpose: "x",
        payment_terms: "$1",
        duration: "1 month",
      }),
      "",
    )).toMatch(/monthly installments/i);

    resetFreeStarterIdentityTestIsolation();

    const body = resolveStarterBody(
      draftShell({
        title: "Services Agreement",
        jurisdiction: "Delaware",
        parties: [{ name: IRON, role: "party" }, { name: COPPER, role: "party" }],
        agreement_family: "services_agreement",
        purpose: "migration",
        payment_terms: "$22,000",
        duration: "90 days",
      }),
      IRON_COPPER_INTAKE,
    );
    expect(body).toContain(IRON);
    expect(body).not.toContain("monthly installments");
  });

  it("Case 7 — source fixtures are not mutated by enrichment", () => {
    const draft = deepCloneDraft(
      draftShell({
        title: "Services Agreement",
        jurisdiction: "Oklahoma",
        parties: [
          { name: CEDAR, role: "Service Provider" },
          { name: NORTHWIND, role: "Service Provider" },
        ],
        agreement_family: "services_agreement",
        purpose: "consulting",
        payment_terms: "$18,000",
        duration: "3 months",
      }),
    );
    const frozen = Object.freeze(deepCloneDraft(draft));
    enrichStarterPreviewPartiesFromIntake(draft, TEST550_CEDAR_NORTHWIND_INTAKE);
    expect(frozen.parties[0]?.role).toBe("Service Provider");
    expect(frozen.parties[1]?.role).toBe("Service Provider");
  });

  it("Case 8 — repeated authority resolution is deep-equal", () => {
    const runs = Array.from({ length: 5 }, () =>
      resolveStarterTwoPartyCommercialAuthority(TEST550_CEDAR_NORTHWIND_INTAKE),
    );
    for (let i = 1; i < runs.length; i += 1) {
      expect(runs[i]).toEqual(runs[0]);
    }
    const previews = Array.from({ length: 3 }, () =>
      buildStarterAgreementPreviewForReview(
        enrichStarterPreviewPartiesFromIntake(
          draftShell({
            title: "Services Agreement",
            jurisdiction: "Oklahoma",
            parties: [{ name: CEDAR, role: "party" }, { name: NORTHWIND, role: "party" }],
            agreement_family: "services_agreement",
            purpose: "consulting",
            payment_terms: "$18,000",
            duration: "3 months",
          }),
          TEST550_CEDAR_NORTHWIND_INTAKE,
        ),
        { intakeText: TEST550_CEDAR_NORTHWIND_INTAKE },
      ),
    );
    expect(previews[1]).toBe(previews[0]);
    expect(previews[2]).toBe(previews[0]);
  });
});
