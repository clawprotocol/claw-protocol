/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  clearFrozenCanonicalAgreementCorpus,
  hasFrozenCanonicalAgreementCorpus,
} from "./canonicalAgreementSnapshot";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  canChooseProDeliveryTrack,
  logAgreementFlowStep,
  resolveProDeliveryTrackSelected,
} from "./proDeliveryTrackState";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

function canonicalBody(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    "This Services Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
    "",
    "1. Scope. Service Provider will deliver AI workflow setup and related services.",
    "2. Fees. Client will pay $5,000.",
    "3. Governing Law. Texas law governs.",
    "",
    "Commercial implementation details. ".repeat(120),
    "",
    "IN WITNESS WHEREOF, the parties execute this Agreement.",
    "",
    "CLIENT:",
    "Red Mesa Logistics LLC",
    "By: ______________________",
    "",
    "SERVICE PROVIDER:",
    "Harbor Peak Automation LLC",
    "By: ______________________",
  ].join("\n");
}

function servicesDraft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Texas",
    agreement_family: "services_agreement",
    parties: [
      { name: "Red Mesa Logistics LLC", role: "Client" },
      { name: "Harbor Peak Automation LLC", role: "Service Provider" },
    ],
    purpose: "AI workflow setup.",
    payment_terms: "$5,000",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: emptyPayment,
  };
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearFrozenCanonicalAgreementCorpus();
});

describe("proDeliveryTrackState", () => {
  it("canChooseProDeliveryTrack when paid Pro is draft_ready_for_review with frozen canonical corpus", () => {
    establishPaidProSourceOfTruth({
      text: canonicalBody(),
      draft: servicesDraft(),
      intakeText: "Services agreement for AI workflow setup.",
    });
    expect(hasFrozenCanonicalAgreementCorpus()).toBe(true);
    expect(
      canChooseProDeliveryTrack({
        isPaidPro: true,
        createFlowPhase: "draft_ready_for_review",
      }),
    ).toBe(true);
  });

  it("resolveProDeliveryTrackSelected returns null until user picks a track", () => {
    expect(
      resolveProDeliveryTrackSelected({
        sendModeTouched: false,
        effectiveSendMode: "signature",
        premiumSignersSurfaceReady: false,
      }),
    ).toBeNull();
    expect(
      resolveProDeliveryTrackSelected({
        sendModeTouched: true,
        effectiveSendMode: "review",
        premiumSignersSurfaceReady: false,
      }),
    ).toBe("review");
    expect(
      resolveProDeliveryTrackSelected({
        sendModeTouched: true,
        effectiveSendMode: "signature",
        premiumSignersSurfaceReady: false,
      }),
    ).toBe("signature");
  });

  it("agreement-flow-step logging contract carries address requirement as false by default", () => {
    expect(typeof logAgreementFlowStep).toBe("function");
    logAgreementFlowStep({
      step: "review_ready",
      selectedAction: null,
      hasCanonicalCorpus: true,
      requiresPartyAddress: false,
    });
  });
});
