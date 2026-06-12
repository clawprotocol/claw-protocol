/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  buildStarterAgreementPreviewForReview,
} from "./agreementPreviewFromDraft";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { resolveAuthoritativePartySlotCount } from "./partySlotIdentityNormalize";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  enrichStarterPreviewPartiesFromIntake,
  inferStarterCommercialPartyRoles,
} from "./starterOpeningPartyPreserve";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST339_INTAKE = [
  `Create a services agreement between ${RED_MESA} and ${HARBOR_PEAK}.`,
  `${HARBOR_PEAK} will provide AI workflow consulting, implementation support,`,
  "process documentation, configuration assistance, staff training, and automation deployment services.",
  `${RED_MESA} will pay ${HARBOR_PEAK} $48,000 monthly. Oklahoma law. Electronic signatures allowed.`,
].join(" ");

function test339Draft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "services_agreement",
    parties: [
      { name: RED_MESA, role: "party" },
      { name: HARBOR_PEAK, role: "party" },
    ],
    purpose:
      "AI workflow consulting, implementation support, process documentation, configuration assistance, staff training, and automation deployment services.",
    payment_terms: "Fixed fee of $48,000 paid monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 48000, cadence: "monthly", valid: true },
  };
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
});

describe("paidProTest339StarterPartyRoleRegression", () => {
  it("free starter opening never renders generic (party) role parentheticals", () => {
    const draft = test339Draft();
    const enriched = enrichStarterPreviewPartiesFromIntake(draft, TEST339_INTAKE);
    expect(enriched.parties?.[0]?.role).toBe("Client");
    expect(enriched.parties?.[1]?.role).toBe("Service Provider");

    const preview = buildStarterAgreementPreviewForReview(enriched, {
      intakeText: TEST339_INTAKE,
    });
    const opening = preview.slice(0, 1200);
    expect(opening).toContain(RED_MESA);
    expect(opening).toContain(HARBOR_PEAK);
    expect(opening).not.toMatch(/\("party"\)/i);
    expect(opening).toMatch(/\("Client"\)|\("Service Provider"\)|between[\s\S]{0,200}and/i);
  });

  it("inferStarterCommercialPartyRoles only upgrades generic two-party services drafts", () => {
    const upgraded = inferStarterCommercialPartyRoles(test339Draft(), TEST339_INTAKE);
    expect(upgraded.parties?.map((p) => p.role)).toEqual(["Client", "Service Provider"]);

    const leaseDraft: ParsedDraftShape = {
      title: "Residential Lease",
      jurisdiction: "Texas",
      agreement_family: "generic_business_agreement",
      purpose: "Residential tenancy.",
      payment_terms: "$2,500 monthly",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      payment: { amount: 2500, cadence: "monthly", valid: true },
      parties: [
        { name: "Landlord LLC", role: "party" },
        { name: "Tenant LLC", role: "party" },
      ],
    };
    const unchanged = inferStarterCommercialPartyRoles(leaseDraft, "Residential lease between Landlord LLC and Tenant LLC.");
    expect(unchanged.parties?.map((p) => p.role)).toEqual(["party", "party"]);
  });

  it("Pro review still has exactly 2 party slots and 1 execution block after starter intake", () => {
    const draft = enrichStarterPreviewPartiesFromIntake(test339Draft(), TEST339_INTAKE);
    const body = [
      "# SERVICES AGREEMENT",
      "",
      `This Services Agreement ("Agreement") is between ${RED_MESA} ("Client") and ${HARBOR_PEAK} ("Service Provider").`,
      "",
      "1. Services",
      "Provider shall perform AI workflow consulting services.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "CLIENT:",
      RED_MESA,
      "SERVICE PROVIDER:",
      HARBOR_PEAK,
    ].join("\n");
    markPaidProPipelineValidationPassed({ text: body, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: body,
      source: "server_full_draft",
      draft,
      intakeText: TEST339_INTAKE,
    });
    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: TEST339_INTAKE });
    expect(
      resolveAuthoritativePartySlotCount({
        intakeText: TEST339_INTAKE,
        draftPartyNames: [RED_MESA, HARBOR_PEAK],
        rawPartyCount: 2,
      }),
    ).toBe(2);
    expect(countPaidProExecutionBlocks(reviewPlain)).toBe(1);
    expect(reviewPlain).toContain('("Client")');
    expect(reviewPlain).toContain('("Service Provider")');
  });
});
