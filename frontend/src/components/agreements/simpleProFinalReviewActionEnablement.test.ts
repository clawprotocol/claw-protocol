import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("SimpleProFinalReviewScreen action enablement rule", () => {
  it("sendDisabledReason prop exists on SimpleProFinalReviewScreen", () => {
    const screen = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(screen).toContain("sendDisabledReason?: string | null;");
    expect(screen).toContain("sendDisabledReason = null");
  });

  it("shows sendDisabledReason when signersReady and sendDisabled", () => {
    const screen = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(screen).toContain("!signerSetupRequired && signersReady && sendDisabled && sendDisabledReason");
    expect(screen).toContain('data-testid="simple-pro-send-disabled-reason"');
  });

  it("AgreementBuilderIntake passes sendDisabledReason to SimpleProFinalReviewScreen", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("sendDisabledReason={");
    expect(intake).toContain("guidedFinalizeModalActive");
    expect(intake).toContain("simpleProFinalReviewCorpus.corpusBlocked");
    expect(intake).toContain("guidedPacketSendBlocked");
  });

  it("sendDisabledReason includes clear user-facing messages for each blocker", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const sendDisabledReasonBlock = intake.slice(
      intake.indexOf("sendDisabledReason={"),
      intake.indexOf("sendDisabledReason={") + 2500,
    );
    expect(sendDisabledReasonBlock).toContain("Finalizing agreement");
    expect(sendDisabledReasonBlock).toContain("Agreement corpus unavailable");
    expect(sendDisabledReasonBlock).toContain("Agreement is still generating");
    expect(sendDisabledReasonBlock).toContain("Agreement upgrade in progress");
    expect(sendDisabledReasonBlock).toContain("Saving agreement");
    expect(sendDisabledReasonBlock).toContain("Agreement changed after links were created");
    expect(sendDisabledReasonBlock).toContain("Creating review links");
  });

  it("universal path rule: signersReady + sendDisabled shows reason, not silent disabled", () => {
    const screen = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
    const actionRegion = screen.slice(
      screen.indexOf('data-testid="simple-pro-final-review-actions"'),
      screen.indexOf('data-testid="simple-pro-edit-agreement-text-card"'),
    );
    expect(actionRegion).toContain("simple-pro-send-disabled-reason");
  });

  it("demo session users see reason when buttons are disabled after signer details complete", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("demoSessionUserActive");
    expect(intake).toContain("hasDemoSessionUser");
    expect(intake).toContain("sendDisabledReason");
  });

  it("rule: buttons enabled when signersReady and no blockers active", () => {
    const screen = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(screen).toContain("disabled={sendDisabled || packetStale || bulkApplyBusy}");
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("signersReady={paidProReviewSignerStatusReady}");
  });

  it("completed paid session + finalized signer metadata bypasses loading blocker", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain(
      "(loading && !(paidProSignerMetadataFinalized && paidProReviewSignerStatusReady))",
    );
  });

  it("finalizePaidProSignerMetadataAndOpenReviewDecision clears loading state", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const fnStart = intake.indexOf("const finalizePaidProSignerMetadataAndOpenReviewDecision = React.useCallback");
    const fnEnd = intake.indexOf("finalizePaidProSignerMetadataAndOpenReviewDecisionRef.current =");
    expect(fnStart).toBeGreaterThan(-1);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const finalizeBlock = intake.slice(fnStart, fnEnd);
    expect(finalizeBlock).toContain("setPaidProSignerMetadataFinalizedLatch(true)");
    expect(finalizeBlock).toContain("setLoading(false)");
  });

  it("sendDisabled bypasses loading for finalized signer metadata + ready signers", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const sendDisabledBlock = intake.slice(
      intake.indexOf("<SimpleProFinalReviewScreen"),
      intake.indexOf("</SimpleProFinalReviewScreen") || intake.indexOf("/>", intake.indexOf("<SimpleProFinalReviewScreen") + 100),
    );
    expect(sendDisabledBlock).toContain("sendDisabled={");
    expect(sendDisabledBlock).toContain("paidProSignerMetadataFinalized && paidProReviewSignerStatusReady");
  });
});
