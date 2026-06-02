import { describe, expect, it } from "vitest";
import {
  isPaidProExplicitRecoveryRetryLabel,
  meetsPaidProDegradedRecoveryDisplayRequirements,
  PAID_PRO_RECOVERY_MIN_DISPLAY_LEN,
  shouldSuppressPaidProGuidedCompletionUi,
} from "./paidProPostCheckoutRenderGate";

const INTAKE =
  "I need a consulting agreement between Blue Canyon Analytics LLC and Iron Vale Systems Inc. for AI workflow implementation services. Fixed fee $8,500. Client owns work product after full payment. Delaware law.";

describe("paidProPostCheckoutRenderGate", () => {
  it("suppresses guided UI for paid post-checkout and degraded recovery", () => {
    expect(
      shouldSuppressPaidProGuidedCompletionUi({
        premiumPaidDocumentSurface: true,
        premiumCheckoutCompleted: true,
        premiumRenderSource: "premium_degraded_server_local_recovery",
        premiumDegradedServerLocalRecovery: true,
      }),
    ).toBe(true);
    expect(
      shouldSuppressPaidProGuidedCompletionUi({
        premiumPaidDocumentSurface: true,
        premiumCompletionSessionActive: true,
      }),
    ).toBe(true);
    expect(
      shouldSuppressPaidProGuidedCompletionUi({
        premiumPaidDocumentSurface: false,
        premiumCheckoutCompleted: false,
      }),
    ).toBe(false);
  });

  it("validates degraded recovery display floor", () => {
    let body = [
      "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
      "",
      "Blue Canyon Analytics LLC (Client) and Iron Vale Systems Inc. (Service Provider).",
      "Governing law: Delaware. Fixed fee $8,500.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "CLIENT: Blue Canyon Analytics LLC",
      "SERVICE PROVIDER: Iron Vale Systems Inc.",
    ].join("\n");
    let i = 1;
    while (body.length <= PAID_PRO_RECOVERY_MIN_DISPLAY_LEN) {
      body = `${body}\n${i}. Implementation scope and acceptance criteria for AI workflow services.`;
      i += 1;
    }
    expect(body.length).toBeGreaterThan(4_000);
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(body, INTAKE)).toBe(true);
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(body.slice(0, 500), INTAKE)).toBe(false);
  });

  it("recovery retry label does not imply guided completion", () => {
    expect(isPaidProExplicitRecoveryRetryLabel("Retry Pro draft")).toBe(true);
    expect(isPaidProExplicitRecoveryRetryLabel("Question 1 of 2")).toBe(false);
    expect(isPaidProExplicitRecoveryRetryLabel("We're almost done")).toBe(false);
  });
});
