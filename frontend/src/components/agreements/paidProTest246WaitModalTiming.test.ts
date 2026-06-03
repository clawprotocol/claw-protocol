import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PREMIUM_POST_CHECKOUT_EXTENDED_WAIT_COPY_MS,
  PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS,
  PREMIUM_POST_CHECKOUT_INFLIGHT_PATIENCE_EXTENDED_MS,
  shouldFailOpenAfterHardCeiling,
} from "../../lib/postCheckoutModalTimeout";
import {
  PREMIUM_PAID_CORPUS_REJECTED_HEADLINE,
  resolvePremiumProWaitModalView,
  resolvePremiumProWaitVisualPhase,
  shouldEnterPremiumReturnPatienceExtended,
  shouldTriggerPremiumModalFailopen,
} from "../../lib/premiumPostCheckoutReturnUx";
import {
  assertAtMostOneCheckoutPremiumGenerationCall,
  clearPremiumGenerationCallAudit,
  recordPremiumFullDraftCall,
} from "./paidProPremiumGenerationCallAudit";

const agreementsDir = dirname(fileURLToPath(import.meta.url));

describe("paidPro Test246 wait modal timing", () => {
  it("uses 60s extended-wait copy, 150s in-flight patience, and 180s terminal failopen ceilings", () => {
    expect(PREMIUM_POST_CHECKOUT_EXTENDED_WAIT_COPY_MS).toBe(60_000);
    expect(PREMIUM_POST_CHECKOUT_INFLIGHT_PATIENCE_EXTENDED_MS).toBe(150_000);
    expect(PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS).toBe(180_000);
  });

  it("121s in-flight successful window does not enter patience extended or failopen", () => {
    expect(
      shouldEnterPremiumReturnPatienceExtended({
        elapsedMs: 121_383,
        authoritativeRequestInFlight: true,
        hasAcceptedServerFullDraftBody: false,
      }),
    ).toBe(false);
    expect(
      shouldTriggerPremiumModalFailopen({
        hasAcceptedServerFullDraftBody: false,
        premiumFullDraftRequestFailed: false,
        authoritativeRequestInFlight: true,
      }),
    ).toBe(false);
    expect(
      shouldFailOpenAfterHardCeiling({
        elapsedMs: 121_383,
        hasAcceptedServerFullDraftBody: false,
        premiumFullDraftRequestFailed: false,
        authoritativeRequestInFlight: true,
      }),
    ).toBe(false);
  });

  it("121s in-flight uses soft_wait not terminal failure copy", () => {
    const phase = resolvePremiumProWaitVisualPhase({
      successFlash: false,
      terminalFailure: false,
      patienceExtended: false,
      softProgress: true,
    });
    expect(phase).toBe("soft_wait");
    const view = resolvePremiumProWaitModalView(phase);
    expect(view.title).not.toBe(PREMIUM_PAID_CORPUS_REJECTED_HEADLINE);
    expect(view.showRecoveryActions).toBe(false);
    expect(view.statusLine).toMatch(/payment is complete/i);
  });

  it("true terminal failure still surfaces retry copy when request is not in flight", () => {
    expect(
      shouldFailOpenAfterHardCeiling({
        elapsedMs: PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS,
        hasAcceptedServerFullDraftBody: false,
        premiumFullDraftRequestFailed: false,
        authoritativeRequestInFlight: false,
      }),
    ).toBe(true);
    const view = resolvePremiumProWaitModalView("terminal_failure");
    expect(view.showRecoveryActions).toBe(true);
    expect(view.title).toBe(PREMIUM_PAID_CORPUS_REJECTED_HEADLINE);
  });

  it("request failure triggers failopen immediately even under 150s", () => {
    expect(
      shouldFailOpenAfterHardCeiling({
        elapsedMs: 5_000,
        hasAcceptedServerFullDraftBody: false,
        premiumFullDraftRequestFailed: true,
        authoritativeRequestInFlight: false,
      }),
    ).toBe(true);
  });

  it("blocks duplicate checkout premium-full-draft orchestration in one session", () => {
    clearPremiumGenerationCallAudit();
    const first = recordPremiumFullDraftCall({
      reason: "checkout_completion",
      intakeFingerprint: "fp-246",
      agreementGenerationId: "gen-246",
    });
    const second = recordPremiumFullDraftCall({
      reason: "checkout_completion",
      intakeFingerprint: "fp-246",
      agreementGenerationId: "gen-246",
    });
    expect(first.duplicateBlocked).toBe(false);
    expect(second.duplicateBlocked).toBe(true);
    expect(() => assertAtMostOneCheckoutPremiumGenerationCall()).not.toThrow();
    clearPremiumGenerationCallAudit();
  });

  it("wires separate in-flight patience and hard failopen timers in AgreementBuilderIntake", () => {
    const src = readFileSync(join(agreementsDir, "AgreementBuilderIntake.tsx"), "utf8");
    expect(src).toContain("onInflightPatienceExtendedTimeout");
    expect(src).toContain("[premium-modal-inflight-patience-extended]");
    expect(src).toContain("[premium-modal-inflight-wait-continued]");
    expect(src).not.toContain("[premium-modal-hard-ceiling-nonterminal]");
    expect(src).toContain("PREMIUM_POST_CHECKOUT_EXTENDED_WAIT_COPY_MS");
    expect(src).toContain("PREMIUM_POST_CHECKOUT_INFLIGHT_PATIENCE_EXTENDED_MS");
    expect(src).toMatch(
      /modalInflightPatienceTimerId = window\.setTimeout\(\s*onInflightPatienceExtendedTimeout/,
    );
    expect(src).toMatch(
      /modalHardFailopenTimerId = window\.setTimeout\(\s*onHardPatienceThresholdTimeout,\s*PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS/,
    );
  });
});
