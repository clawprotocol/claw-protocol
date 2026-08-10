/**
 * GTM retest (2026-08-09): 3-party services draft painted and signer details filled, but
 * finalize hard-failed with "Missing durable agreement id… Reload from the dashboard".
 * Finalize must mint/bind a workspace id (or offer Retry to save) before advancing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isRecipientHandoffSeedDisposable,
  pickRecipientNameForHandoff,
} from "./reviewPlaceholderGuard";

describe("paidPro signer finalize durable agreement id", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("finalize ensures a workspace agreement id before snapshot/persist", () => {
    const fnStart = intake.indexOf(
      "const finalizePaidProSignerMetadataAndOpenReviewDecision = React.useCallback",
    );
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = intake.indexOf(
      "finalizePaidProSignerMetadataAndOpenReviewDecisionRef.current",
      fnStart,
    );
    const block = intake.slice(fnStart, fnEnd);
    expect(block).toContain("ensureReviewAgreementWorkspaceId");
    expect(block).toContain("setCreateFlowDraftPersistError(null)");
    expect(block.indexOf("ensureReviewAgreementWorkspaceId")).toBeLessThan(
      block.indexOf("createAuthoritativeSigningSnapshot"),
    );
    expect(block).toMatch(/could not save this agreement before finalizing signers/i);
    expect(block).toMatch(/Tap Retry to save/i);
    expect(block).not.toMatch(/Reload from the dashboard and try again/i);
  });

  it("signer-setup arm also best-effort mints workspace id before finalize", () => {
    expect(intake).toContain("signerSetupWorkspaceEnsureStartedRef");
    const armIdx = intake.indexOf('action: "arm_latch"');
    expect(armIdx).toBeGreaterThan(-1);
    const armBlock = intake.slice(armIdx, armIdx + 1800);
    expect(armBlock).toContain("ensureReviewAgreementWorkspaceId");
  });

  it("canonical review handoff prefers intake legal names over disposable demo seeds", () => {
    expect(intake).toContain("pickRecipientNameForHandoff(prev, legalNames[0]!)");
    expect(intake).toContain("pickRecipientNameForHandoff(prev, legalNames[1]!)");
    expect(isRecipientHandoffSeedDisposable("ABC LLC")).toBe(true);
    expect(isRecipientHandoffSeedDisposable("Sample Corp")).toBe(true);
    expect(isRecipientHandoffSeedDisposable("Alpha LLC")).toBe(false);
    expect(pickRecipientNameForHandoff("ABC LLC", "Alpha LLC")).toBe("Alpha LLC");
    expect(pickRecipientNameForHandoff("Sample Corp", "Beacon Inc")).toBe("Beacon Inc");
    expect(pickRecipientNameForHandoff("Alpha LLC", "Beacon Inc")).toBe("Alpha LLC");
  });
});
