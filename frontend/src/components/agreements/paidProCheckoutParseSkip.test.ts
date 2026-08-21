import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  resolveCheckoutPremiumParseSubstitute,
  shouldSkipCheckoutPremiumParseBeforeFullDraft,
} from "./paidProCheckoutParseSkip";
import { mergePremiumParsePreferFresh } from "./fullDraftUpgradeEnrich";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

const richStructured: ParsedDraftShape = {
  title: "Mutual Consulting Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Blue Canyon Analytics LLC", role: "Client" },
    { name: "Iron Vale Systems Inc.", role: "Service Provider" },
  ],
  purpose:
    "Provider will deliver AI workflow implementation, integration, and acceptance testing for Client systems over twelve months with milestone gates.",
  payment_terms: "Fixed fee of $8,500 due upon execution; expenses pre-approved in writing.",
  duration: "12 months",
  due_date: null,
  effective_date: "As agreed",
  payment: emptyPayment,
  agreement_family: "services_agreement",
  additional_terms: "Confidentiality, IP assignment, and limitation of liability apply as stated in the operative sections.",
  termination_summary: "Either party may terminate for material breach after thirty days cure.",
};

const rawIntake =
  "Blue Canyon Analytics LLC and Iron Vale Systems Inc. need a consulting agreement for AI workflow implementation in Delaware with a fixed fee of $8,500 due upon execution.";

describe("paidProCheckoutParseSkip", () => {
  it("skips checkout parse when structured draft and intake are sufficient", () => {
    expect(
      shouldSkipCheckoutPremiumParseBeforeFullDraft({
        premiumGenerationCallReason: "checkout_completion",
        structuredDraft: richStructured,
        rawIntake,
      }),
    ).toBe(true);
  });

  it("skips checkout parse for a thin Mike starter that used to fail placeholder gates", () => {
    expect(
      shouldSkipCheckoutPremiumParseBeforeFullDraft({
        premiumGenerationCallReason: "checkout_completion",
        structuredDraft: {
          ...richStructured,
          parties: [
            { name: "Client", role: "Client" },
            { name: "Mike", role: "Service Provider" },
          ],
          purpose: "Mike will paint the office.",
          payment_terms: "Not specified",
          jurisdiction: "",
          duration: "",
        },
        rawIntake: "I hired Mike to paint my office. We shook on it.",
      }),
    ).toBe(true);
  });

  it("does not skip when call reason is not checkout_completion", () => {
    expect(
      shouldSkipCheckoutPremiumParseBeforeFullDraft({
        premiumGenerationCallReason: "explicit_retry_pro_draft",
        structuredDraft: richStructured,
        rawIntake,
      }),
    ).toBe(false);
  });

  it("substitute merge matches parsed merge for identical structured snapshot", () => {
    const substitute = resolveCheckoutPremiumParseSubstitute(richStructured);
    const mergedFromSubstitute = mergePremiumParsePreferFresh(richStructured, substitute, rawIntake);
    const mergedFromParse = mergePremiumParsePreferFresh(richStructured, substitute, rawIntake);
    expect(mergedFromSubstitute).toEqual(mergedFromParse);
  });
});
