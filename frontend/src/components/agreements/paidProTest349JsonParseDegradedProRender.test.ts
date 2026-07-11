import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  meetsPaidProDegradedRecoveryDisplayRequirements,
  PAID_PRO_RECOVERY_MIN_DISPLAY_LEN,
} from "./paidProPostCheckoutRenderGate";
import {
  previewPostCheckoutRecoverySotCommit,
} from "./paidProPostCheckoutRecoveryAuthority";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";
import {
  paidProCheckoutCompletionHasVisibleOutcome,
  PREMIUM_USABLE_BODY_MIN_LEN,
} from "./premiumPostCheckoutApplyEligible";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { normalizePremiumFullDraftResponsePayload } from "./premiumFullDraftResponseNormalization";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST349_INTAKE = [
  `Create a services agreement between ${RED_MESA} and ${HARBOR_PEAK}.`,
  `${HARBOR_PEAK} will provide AI workflow consulting, implementation support,`,
  "process documentation, configuration assistance, staff training, and automation deployment services",
  `for ${RED_MESA}. The engagement term is 12 months. Fixed fee of $48,000 paid monthly.`,
  "Oklahoma law. Both parties must review before signing.",
].join(" ");

function test349Draft(): ParsedDraftShape {
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

function buildTest349ValidBody(targetLen: number): string {
  const header = [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is entered into between ${RED_MESA} ("Client") and ${HARBOR_PEAK} ("Service Provider").`,
    "",
    "1. Scope of Services. Service Provider shall deliver AI workflow consulting and implementation support.",
    "2. Payment. Client shall pay Service Provider a fixed fee of $48,000 paid monthly.",
    "3. Governing Law. This Agreement is governed by the laws of the State of Oklahoma.",
    "4. Electronic Signatures. The parties agree that electronic signatures are valid and binding.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    RED_MESA,
    "By: __________________________",
    "",
    "SERVICE PROVIDER:",
    HARBOR_PEAK,
    "By: __________________________",
  ].join("\n");
  let body = header;
  let i = 5;
  while (body.length < targetLen) {
    body +=
      `\n${i}. Additional Provision. The parties acknowledge milestone delivery and acceptance obligations ` +
      "in connection with the engagement.";
    i += 1;
  }
  return body;
}

function buildTest349JsonEnvelopeWire(body: string): PremiumFullDraftResult {
  const wrapper = JSON.stringify({
    title: "Services Agreement",
    agreement_family: "services_agreement",
    generation_outcome: "degraded",
    server_generation_failure_code: "json_parse",
    server_generation_failure_message: "Structured intelligence JSON failed to parse.",
    document_text: body,
    server_full_document_text: "",
    key_terms_found: [],
    missing_material_info: [],
  });
  return {
    title: "Services Agreement",
    agreement_family: "services_agreement",
    document_text: wrapper,
    server_full_document_text: "",
    key_terms_found: [],
    missing_material_info: [],
    generation_outcome: "degraded",
    server_generation_failure_code: "json_parse",
    server_generation_failure_message: "Structured intelligence JSON failed to parse.",
  };
}

const premiumApiMock = vi.hoisted(() => ({
  mockResponses: [] as PremiumFullDraftResult[],
  callIndex: 0,
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () => {
      const r =
        premiumApiMock.mockResponses[premiumApiMock.callIndex] ??
        premiumApiMock.mockResponses[premiumApiMock.mockResponses.length - 1];
      premiumApiMock.callIndex += 1;
      return r
        ? Promise.resolve({ ok: true as const, result: r })
        : Promise.resolve({
            ok: false as const,
            failure_kind: "http" as const,
            retryable: false,
            error_code: "test_mode_skipped",
            document_text: "" as const,
            attemptCount: 0,
          });
    },
    postPremiumFullDraftOnce: () => {
      const r =
        premiumApiMock.mockResponses[premiumApiMock.callIndex] ??
        premiumApiMock.mockResponses[premiumApiMock.mockResponses.length - 1];
      premiumApiMock.callIndex += 1;
      return Promise.resolve(r);
    },
  };
});

describe("paidPro test349 json_parse degraded Pro render", () => {
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPremiumParseSessionGuard();
    clearPremiumGenerationCallAudit();
    clearPaidProSourceOfTruth();
    premiumApiMock.mockResponses = [];
    premiumApiMock.callIndex = 0;
    (globalThis as { __paidProAllowStructuralRetryInTest?: boolean }).__paidProAllowStructuralRetryInTest =
      true;
  });

  afterEach(() => {
    delete (globalThis as { __paidProAllowStructuralRetryInTest?: boolean }).__paidProAllowStructuralRetryInTest;
    resetPaidProPipelineTestIsolation();
    clearPaidProSourceOfTruth();
    vi.restoreAllMocks();
  });

  it("normalizes operative prose from a JSON envelope in document_text", () => {
    const body = buildTest349ValidBody(5_547);
    const wire = buildTest349JsonEnvelopeWire(body);
    const normalized = normalizePremiumFullDraftResponsePayload(wire);
    expect(normalized.sourceField).toBe("json_envelope.document_text");
    expect(normalized.authoritativeText.length).toBeGreaterThanOrEqual(PAID_PRO_RECOVERY_MIN_DISPLAY_LEN);
    expect(normalized.authoritativeText).toContain(RED_MESA);
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(normalized.authoritativeText, TEST349_INTAKE)).toBe(
      true,
    );
  });

  it("accepts HTTP 200 degraded/json_parse envelope on both attempts without stranding checkout", async () => {
    const body = buildTest349ValidBody(5_547);
    const wire = buildTest349JsonEnvelopeWire(body);
    premiumApiMock.mockResponses = [wire, wire];

    const out = await runPremiumCompletion({
      intakeText: TEST349_INTAKE,
      originalUserIntakeRawForMerge: TEST349_INTAKE,
      structuredDraft: test349Draft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test349",
      premiumRequestIntakeFingerprint: "fp-test349",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test349Draft(),
    });

    expect(out.premiumRenderSource).toMatch(/server_full_draft/);
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
    expect(out.premiumRenderSource).not.toBe("fallback_preview");
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThanOrEqual(PREMIUM_USABLE_BODY_MIN_LEN);
    expect(out.winningPremiumBodyText).toContain(RED_MESA);
    expect(out.winningPremiumBodyText).toContain(HARBOR_PEAK);
    expect(out.winningPremiumBodyText.toLowerCase()).toContain("oklahoma");
    expect(countPaidProExecutionBlocks(out.winningPremiumBodyText)).toBe(1);
    expect(out.proIntentGateMessage).toBeNull();
    expect(paidProCheckoutCompletionHasVisibleOutcome(out)).toBe(true);
    expect(premiumApiMock.callIndex).toBeGreaterThanOrEqual(1);
  });

  it("falls back to local recovery when envelope prose fails client gates but intake can stitch Pro", async () => {
    const rejectedBody = buildTest349ValidBody(5_547).replace(
      /Additional Provision/g,
      "[claw_full_draft_expansion_v1] Additional Provision",
    );
    const wire = buildTest349JsonEnvelopeWire(rejectedBody);
    premiumApiMock.mockResponses = [wire, wire];

    const out = await runPremiumCompletion({
      intakeText: TEST349_INTAKE,
      originalUserIntakeRawForMerge: TEST349_INTAKE,
      structuredDraft: test349Draft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test349-recovery",
      premiumRequestIntakeFingerprint: "fp-test349-recovery",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test349Draft(),
    });

    expect(out.premiumRenderSource).toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(out.premiumDegradedServerLocalRecovery).toBe(true);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThanOrEqual(PREMIUM_USABLE_BODY_MIN_LEN);
    expect(meetsPaidProDegradedRecoveryDisplayRequirements(out.winningPremiumBodyText, TEST349_INTAKE)).toBe(
      true,
    );

    const recoveryPreview = previewPostCheckoutRecoverySotCommit({
      body: out.winningPremiumBodyText,
      draft: out.premiumDraft,
      intakeText: TEST349_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recoveryPreview.eligible).toBe(true);
    expect(recoveryPreview.displayPlainLen).toBeGreaterThan(PAID_PRO_RECOVERY_MIN_DISPLAY_LEN);
  });
});
