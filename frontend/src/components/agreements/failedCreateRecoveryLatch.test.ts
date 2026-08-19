import { afterEach, describe, expect, it } from "vitest";
import { CreateUiStage } from "./createUiStage";
import { feedbackAfterFailedCreate, feedbackAfterModelFailure } from "./journeyActionFeedback";
import {
  buildFailedCreateRecoveryCopy,
  clearFailedCreateRecoveryLatch,
  commitEntitledRewriteGenerationFailureTerminal,
  extractSafeFailedCreateReason,
  FAILED_CREATE_RECOVERY_TITLE,
  FAILED_CREATE_RECOVERY_UNCHANGED,
  hasFailedCreateRecoveryLatch,
  latchFailedCreateRecovery,
  planEntitledRewriteGenerationFailureTerminal,
  readFailedCreateRecoveryLatch,
  shouldHoldFailedCreateIntakeRecovery,
} from "./paidProEntitledRewriteLaunch";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const INTAKE =
  "Draft an agreement between Acme LLC and Beta Inc for website redesign work.";
const PARTIES = ["Acme LLC", "Beta Inc"];

afterEach(() => {
  clearFailedCreateRecoveryLatch();
});

describe("failed-create recovery latch", () => {
  it("first creation failure with no prior agreement returns to intake and latches until retry", () => {
    const plan = commitEntitledRewriteGenerationFailureTerminal({
      reason: "entitled_rewrite_aborted",
      intakeNotes: INTAKE,
      partyNames: PARTIES,
      safeReason: "The Pro draft did not complete.",
    });
    expect(plan.holdIntakeRecovery).toBe(true);
    expect(plan.clearLocalDraft).toBe(true);
    expect(plan.displayPhase).toBe("intake");
    expect(plan.createUiStage).toBe(CreateUiStage.INPUT);
    expect(plan.createFlowPhase).toBe("capturing_input");
    expect(plan.recoveryTitle).toBe(FAILED_CREATE_RECOVERY_TITLE);
    expect(plan.hardError).toMatch(/Your information is unchanged/);
    expect(plan.hardError).toMatch(/The Pro draft did not complete/);
    expect(shouldHoldFailedCreateIntakeRecovery()).toBe(true);
    const latch = readFailedCreateRecoveryLatch();
    expect(latch?.notes).toBe(INTAKE);
    expect(latch?.partyNames).toEqual(PARTIES);
  });

  it("failure after an existing authoritative agreement keeps that agreement and does not latch intake", () => {
    const plan = planEntitledRewriteGenerationFailureTerminal({
      reason: "entitled_rewrite_aborted",
      hasAuthoritativeAgreement: true,
      intakeNotes: INTAKE,
      partyNames: PARTIES,
    });
    expect(plan.holdIntakeRecovery).toBe(false);
    expect(plan.clearLocalDraft).toBe(false);
    expect(plan.displayPhase).toBe("review");
    expect(plan.createUiStage).toBe(CreateUiStage.DRAFT);
    expect(plan.hardError).toMatch(/last saved agreement is unchanged/i);
    expect(hasFailedCreateRecoveryLatch()).toBe(false);
  });

  it("exact intake and parties survive on the latch until explicit retry", () => {
    latchFailedCreateRecovery({ notes: INTAKE, partyNames: PARTIES, reason: "timeout" });
    expect(readFailedCreateRecoveryLatch()?.notes).toBe(INTAKE);
    expect(readFailedCreateRecoveryLatch()?.partyNames).toEqual(PARTIES);
    clearFailedCreateRecoveryLatch();
    expect(shouldHoldFailedCreateIntakeRecovery()).toBe(false);
  });

  it("retry after an initial failure is allowed only after the latch is cleared", () => {
    commitEntitledRewriteGenerationFailureTerminal({
      reason: "no_server_authority",
      intakeNotes: INTAKE,
      partyNames: PARTIES,
    });
    expect(shouldHoldFailedCreateIntakeRecovery()).toBe(true);
    clearFailedCreateRecoveryLatch();
    expect(shouldHoldFailedCreateIntakeRecovery()).toBe(false);
    const retry = planEntitledRewriteGenerationFailureTerminal({
      reason: "entitled_rewrite_aborted",
      hasAuthoritativeAgreement: true,
    });
    expect(retry.holdIntakeRecovery).toBe(false);
    expect(retry.displayPhase).toBe("review");
  });

  it("does not emit a false creation event, review state, or success banner copy", () => {
    const copy = buildFailedCreateRecoveryCopy({ safeReason: "The Pro draft did not complete." });
    expect(copy.title).toBe(FAILED_CREATE_RECOVERY_TITLE);
    expect(copy.body).not.toMatch(/Agreement created/i);
    expect(copy.body).toContain(FAILED_CREATE_RECOVERY_UNCHANGED);
    const banner = feedbackAfterFailedCreate("The Pro draft did not complete.");
    expect(banner.kind).toBe("failed");
    expect(banner.title).toBe(FAILED_CREATE_RECOVERY_TITLE);
    expect(banner.remedyLabel).toBe("Retry");
    expect(feedbackAfterModelFailure()).toBe(FAILED_CREATE_RECOVERY_UNCHANGED);
  });

  it("extracts a customer-safe reason and rejects internal traces", () => {
    expect(
      extractSafeFailedCreateReason({
        detail: { message: "The Pro draft did not complete. Your notes are still here — retry." },
      }),
    ).toMatch(/Pro draft did not complete/);
    expect(extractSafeFailedCreateReason(new Error("mislabeled_server_full_draft_below_substantive_min"))).toBeNull();
    expect(extractSafeFailedCreateReason("TypeError: stack\n    at node_modules/x.js")).toBeNull();
  });

  it("AgreementBuilderIntake holds failed-create recovery against later review remounts", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("shouldHoldFailedCreateIntakeRecovery");
    expect(intake).toContain("commitEntitledRewriteGenerationFailureTerminal");
    expect(intake).toContain("clearFailedCreateRecoveryLatch");
    expect(intake).toContain("feedbackAfterFailedCreate");
    expect(intake).toMatch(/if \(shouldHoldFailedCreateIntakeRecovery\(\)\) return false;/);
    expect(intake).toContain("failed_create_retry");
  });
});
