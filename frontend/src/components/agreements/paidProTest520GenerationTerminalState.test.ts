/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { isPaidProFinishedAgreement, validatePaidProOutput } from "./paidProCorpusAcceptance";
import {
  isPaidProGenerationProcessingDeadlock,
  logPaidProGenerationTerminalTransition,
  resolvePaidProGenerationFailurePostCheckoutPhase,
  shouldRunModelPassFinallyDismissProcessing,
} from "./paidProGenerationTerminalState";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  buildTest519MalformedProfessionalServerBody,
  TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
  test519Draft,
} from "./paidProTest519Fixtures";

const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

beforeEach(() => {
  sessionStorage.clear();
  clearCurrentSessionProEntitlementMarkers();
  getOrInitSessionAgreementGenerationId();
  markCurrentSessionProIntent();
  markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
});

afterEach(() => {
  sessionStorage.clear();
  clearCurrentSessionProEntitlementMarkers();
});

describe("TEST520 — paid Pro generation exits processing after validation failure", () => {
  it("terminal helper returns null and detects processing deadlock", () => {
    expect(resolvePaidProGenerationFailurePostCheckoutPhase()).toBe(null);
    expect(
      isPaidProGenerationProcessingDeadlock({
        premiumPostCheckoutPhase: "processing",
        qualityRetryActive: true,
        authoritativeBodyLen: 0,
        validationAccepted: false,
      }),
    ).toBe(true);
    expect(
      isPaidProGenerationProcessingDeadlock({
        premiumPostCheckoutPhase: null,
        qualityRetryActive: true,
        authoritativeBodyLen: 0,
        validationAccepted: false,
      }),
    ).toBe(false);
  });

  it("runModelPass finally dismisses processing when checkout completed without SoT or retry armed", () => {
    expect(
      shouldRunModelPassFinallyDismissProcessing({
        currentPhase: "processing",
        qualityRetryActive: true,
        paidCheckoutCompleted: false,
        hasSourceOfTruth: false,
      }),
    ).toBe(true);
    expect(
      shouldRunModelPassFinallyDismissProcessing({
        currentPhase: "processing",
        qualityRetryActive: false,
        paidCheckoutCompleted: true,
        hasSourceOfTruth: false,
      }),
    ).toBe(true);
    expect(
      shouldRunModelPassFinallyDismissProcessing({
        currentPhase: null,
        qualityRetryActive: true,
        paidCheckoutCompleted: true,
        hasSourceOfTruth: false,
      }),
    ).toBe(false);
  });

  it("professional validation failure on quad-party intake is not a finished agreement", () => {
    const body = buildTest519MalformedProfessionalServerBody();
    const intake = TEST519_PRODUCTION_QUAD_PARTY_INTAKE;
    const contract = resolveAgreementIntentContract(intake);
    const validation = validatePaidProOutput({
      text: body,
      rawIntake: intake,
      intentContract: contract,
      draft: test519Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok).toBe(false);

    const fin = isPaidProFinishedAgreement({
      text: body,
      rawIntake: intake,
      readonlyRenderSource: "server_full_document_text",
      pipelineSource: "server_full_draft",
      stale: false,
      intentContract: contract,
      draft: test519Draft(),
      qualityRetryActive: false,
      serverGenerationDegraded: false,
    });
    expect(fin.ok).toBe(false);
    expect(
      isPaidProGenerationProcessingDeadlock({
        premiumPostCheckoutPhase: resolvePaidProGenerationFailurePostCheckoutPhase(),
        qualityRetryActive: true,
        authoritativeBodyLen: 0,
        validationAccepted: validation.ok,
      }),
    ).toBe(false);
  });

  it("AgreementBuilderIntake never sets processing after arming quality retry on validation failure paths", () => {
    const applySuccessBlock = intakeSrc.slice(
      intakeSrc.indexOf("const applySuccess = (result: PremiumCompletionResult) =>"),
      intakeSrc.indexOf("const runModelPass = async"),
    );
    expect(applySuccessBlock).toContain("resolvePaidProGenerationFailurePostCheckoutPhase");
    expect(applySuccessBlock).not.toMatch(
      /setProFullDraftQualityRetry\(true\)[\s\S]{0,400}setPremiumPostCheckoutPhase\("processing"\)/,
    );

    const rewriteBlock = intakeSrc.slice(
      intakeSrc.indexOf("const runEntitledPremiumImprovementRewrite = React.useCallback"),
      intakeSrc.indexOf("useLayoutEffect(() => {", intakeSrc.indexOf("const runEntitledPremiumImprovementRewrite")),
    );
    expect(rewriteBlock).toContain("entitled_rewrite_validation_failed");
    expect(rewriteBlock).toContain("resolvePaidProGenerationFailurePostCheckoutPhase");
    expect(rewriteBlock).not.toMatch(
      /isPaidProFinishedAgreement\([\s\S]*?entitled_rewrite_validation_failed[\s\S]*?setPremiumPostCheckoutPhase\("processing"\)/,
    );
  });

  it("logs paid-pro-generation-terminal without throwing in test mode", () => {
    expect(() =>
      logPaidProGenerationTerminalTransition({
        reason: "professional_validation_failed",
        outcome: "retry_recoverable",
      }),
    ).not.toThrow();
  });
});
