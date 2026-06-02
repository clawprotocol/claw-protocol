import { describe, expect, it } from "vitest";
import {
  isPaidProExplicitRecoveryRetryLabel,
  meetsPaidProDegradedRecoveryDisplayRequirements,
  PAID_PRO_RECOVERY_MIN_DISPLAY_LEN,
  shouldSkipPremiumStructuralRetryForDegradedDisplay,
  shouldSuppressPaidProGuidedCompletionUi,
} from "./paidProPostCheckoutRenderGate";

const INTAKE =
  "I need a consulting agreement between Blue Canyon Analytics LLC and Iron Vale Systems Inc. for AI workflow implementation services. Fixed fee $8,500. Client owns work product after full payment. Delaware law.";

const GENERIC_INTAKE =
  "I need a services agreement between Acme Corp and Beta LLC for general consulting. Fixed fee $5,000. California law.";

function buildBlueCanyonDegradedBody(targetLen: number): string {
  const header = [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    "Blue Canyon Analytics LLC and Iron Vale Systems Inc. agree to AI workflow implementation.",
    "Fixed fee $8,500. Delaware law governs.",
    "",
  ].join("\n");
  let body = header;
  let i = 0;
  while (body.length < targetLen) {
    body += `\nSection ${i + 1}. Operative clause ${i + 1} for milestone delivery and acceptance. `;
    i += 1;
  }
  return `${body}\n\nIN WITNESS WHEREOF\nCLIENT: Blue Canyon Analytics LLC\nSERVICE PROVIDER: Iron Vale Systems Inc.`;
}

function buildGenericLongBody(targetLen: number): string {
  let body = "GENERIC SERVICES AGREEMENT\n\nAcme Corp and Beta LLC.\n";
  let i = 0;
  while (body.length < targetLen) {
    body += `\nSection ${i + 1}. Generic clause without Delaware or named recovery anchors.\n`;
    i += 1;
  }
  return body;
}

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

  describe("shouldSkipPremiumStructuralRetryForDegradedDisplay", () => {
    const displayEligibleBody = buildBlueCanyonDegradedBody(6_220);

    const baseSkipArgs = {
      documentText: displayEligibleBody,
      intakeText: INTAKE,
      generationOutcome: "degraded",
      failureCode: "json_parse",
      accRejected: true,
    };

    it("returns true for display-eligible degraded json_parse when acc rejected", () => {
      expect(meetsPaidProDegradedRecoveryDisplayRequirements(displayEligibleBody, INTAKE)).toBe(true);
      expect(shouldSkipPremiumStructuralRetryForDegradedDisplay(baseSkipArgs)).toBe(true);
    });

    it.each([
      {
        label: "wrong failureCode",
        patch: { failureCode: "airlock_blocked" },
      },
      {
        label: "documentText under 6000 chars",
        patch: { documentText: buildBlueCanyonDegradedBody(6_220).slice(0, 5_999) },
      },
      {
        label: "generationOutcome not degraded",
        patch: { generationOutcome: "ok" },
      },
      {
        label: "accRejected false",
        patch: { accRejected: false },
      },
      {
        label: "missing display requirements on body",
        patch: { documentText: buildGenericLongBody(6_500) },
      },
      {
        label: "non-Blue Canyon intake without recovery anchors",
        patch: {
          documentText: buildGenericLongBody(6_500),
          intakeText: GENERIC_INTAKE,
        },
      },
    ])("returns false when $label", ({ patch }) => {
      expect(
        shouldSkipPremiumStructuralRetryForDegradedDisplay({
          ...baseSkipArgs,
          ...patch,
        }),
      ).toBe(false);
    });
  });
});
