import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  authoritativePremiumPipelineResultForUiApply,
  paidProCheckoutCompletionHasVisibleOutcome,
  PREMIUM_USABLE_BODY_MIN_LEN,
} from "./premiumPostCheckoutApplyEligible";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import type { PremiumCompletionResult } from "./premiumCompletionPipeline";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST358_INTAKE = [
  `Create a services agreement between ${RED_MESA} and ${HARBOR_PEAK}.`,
  `${HARBOR_PEAK} will provide AI workflow consulting, implementation support,`,
  "process documentation, configuration assistance, staff training, and automation deployment services",
  `for ${RED_MESA}. The engagement term is 12 months. Fixed fee of $48,000 paid monthly.`,
  "Oklahoma law. Both parties must review before signing.",
].join(" ");

function test358Draft(): ParsedDraftShape {
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

function buildTest358ValidBody(targetLen: number, opts?: { omitJurisdictionAnchor?: boolean }): string {
  const governingLaw = opts?.omitJurisdictionAnchor
    ? "3. Governing Law. This Agreement is governed by applicable commercial contract principles."
    : "3. Governing Law. This Agreement is governed by the laws of the State of Oklahoma.";
  const header = [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is entered into between ${RED_MESA} ("Client") and ${HARBOR_PEAK} ("Service Provider").`,
    "",
    "1. Scope of Services. Service Provider shall deliver AI workflow consulting and implementation support.",
    "2. Payment. Client shall pay Service Provider a fixed fee of $48,000 paid monthly.",
    governingLaw,
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

function buildTest358JsonEnvelopeWire(
  body: string,
  failureCode = "json_parse",
): PremiumFullDraftResult {
  const wrapper = JSON.stringify({
    title: "Services Agreement",
    agreement_family: "services_agreement",
    generation_outcome: "degraded",
    server_generation_failure_code: failureCode,
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
    server_generation_failure_code: failureCode,
    server_generation_failure_message: "Structured intelligence JSON failed to parse.",
  };
}

const renderGateMock = vi.hoisted(() => ({
  forceStructuralRetry: false,
}));

vi.mock("./paidProPostCheckoutRenderGate", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./paidProPostCheckoutRenderGate")>();
  return {
    ...mod,
    shouldSkipPremiumStructuralRetryForDegradedDisplay: (
      args: Parameters<typeof mod.shouldSkipPremiumStructuralRetryForDegradedDisplay>[0],
    ) => {
      if (renderGateMock.forceStructuralRetry) return false;
      return mod.shouldSkipPremiumStructuralRetryForDegradedDisplay(args);
    },
  };
});

const premiumApiMock = vi.hoisted(() => ({
  firstWire: null as PremiumFullDraftResult | null,
  structuralRetryFails502: false,
  onceCalls: 0,
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () =>
      premiumApiMock.firstWire
        ? Promise.resolve({ ok: true as const, result: premiumApiMock.firstWire })
        : Promise.resolve({
            ok: false as const,
            failure_kind: "http" as const,
            retryable: false,
            error_code: "test_mode_skipped",
            document_text: "" as const,
            attemptCount: 0,
          }),
    postPremiumFullDraftOnce: () => {
      premiumApiMock.onceCalls += 1;
      if (premiumApiMock.structuralRetryFails502) {
        return Promise.reject(new Error("HTTP 502 Bad Gateway"));
      }
      return premiumApiMock.firstWire
        ? Promise.resolve(premiumApiMock.firstWire)
        : Promise.reject(new Error("HTTP 502 Bad Gateway"));
    },
  };
});

async function runTest358Completion(): Promise<PremiumCompletionResult> {
  const { runPremiumCompletion } = await import("./premiumCompletionPipeline");
  return runPremiumCompletion({
    intakeText: TEST358_INTAKE,
    originalUserIntakeRawForMerge: TEST358_INTAKE,
    structuredDraft: test358Draft(),
    simpleProductFlow: true,
    partyRoleLabels: defaultIntakePartyRoleLabels(),
    userGapAnswers: null,
    agreementGenerationId: "g-test358",
    premiumRequestIntakeFingerprint: "fp-test358",
    isPremiumRequestStillValid: () => true,
    parseDraft: async () => test358Draft(),
  });
}

function expectAcceptedPaidProSoT(out: PremiumCompletionResult): void {
  expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
  expect(out.winningPremiumBodyText.trim().length).toBeGreaterThanOrEqual(PREMIUM_USABLE_BODY_MIN_LEN);
  expect(out.winningPremiumBodyText).toContain(RED_MESA);
  expect(out.winningPremiumBodyText).toContain(HARBOR_PEAK);
  expect(countPaidProExecutionBlocks(out.winningPremiumBodyText)).toBe(1);
  expect(authoritativePremiumPipelineResultForUiApply(out)).toBe(true);
  expect(paidProCheckoutCompletionHasVisibleOutcome(out)).toBe(true);
  expect(out.proIntentGateMessage).toBeNull();
}

describe("paidPro test358 json_parse retry 502 preserves recovery", () => {
  beforeEach(() => {
    clearFrozenPremiumSessionBodiesForTests();
    clearPremiumParseSessionGuard();
    clearPremiumGenerationCallAudit();
    clearPaidProSourceOfTruth();
    premiumApiMock.onceCalls = 0;
    premiumApiMock.structuralRetryFails502 = false;
    renderGateMock.forceStructuralRetry = false;
    premiumApiMock.firstWire = buildTest358JsonEnvelopeWire(buildTest358ValidBody(5_547));
    (globalThis as { __paidProAllowStructuralRetryInTest?: boolean }).__paidProAllowStructuralRetryInTest =
      true;
  });

  afterEach(() => {
    delete (globalThis as { __paidProAllowStructuralRetryInTest?: boolean }).__paidProAllowStructuralRetryInTest;
    clearPaidProSourceOfTruth();
    vi.restoreAllMocks();
  });

  it("does not mark serverFullDocExists when validating an empty server_full_draft body", () => {
    const decision = validatePaidProOutput({
      text: "",
      rawIntake: TEST358_INTAKE,
      draft: test358Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(decision.ok).toBe(false);
  });

  it("accepts degraded/json_parse display-eligible corpus without structural retry", async () => {
    const out = await runTest358Completion();

    expect(premiumApiMock.onceCalls).toBe(0);
    expect(out.premiumRenderSource).toMatch(/server_full_draft/);
    expectAcceptedPaidProSoT(out);
  });

  it("keeps first degraded/json_parse corpus when structural retry fails with 502", async () => {
    premiumApiMock.structuralRetryFails502 = true;
    renderGateMock.forceStructuralRetry = true;
    premiumApiMock.firstWire = buildTest358JsonEnvelopeWire(buildTest358ValidBody(5_547), "json_parse");

    const acceptance = await import("./premiumFullDraftClientAcceptance");
    const originalReject = acceptance.rejectPremiumBodyForProRender;
    let acc0GateFailed = false;
    vi.spyOn(acceptance, "rejectPremiumBodyForProRender").mockImplementation((text, ctx) => {
      const len = (text || "").trim().length;
      if (!acc0GateFailed && len >= 5_000) {
        acc0GateFailed = true;
        return { ok: false, reasons: ["test358_force_structural_retry"] };
      }
      return originalReject(text, ctx);
    });

    const out = await runTest358Completion();

    expect(acc0GateFailed).toBe(true);
    expect(premiumApiMock.onceCalls).toBeGreaterThanOrEqual(1);
    expect(out.premiumRenderSource).toMatch(/server_full_draft/);
    expectAcceptedPaidProSoT(out);
  });
});
