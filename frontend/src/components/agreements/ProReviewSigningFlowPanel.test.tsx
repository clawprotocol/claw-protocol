/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ProReviewSigningFlowPanel } from "./ProReviewSigningFlowPanel";
import { resolveProReviewSigningFlowState } from "./proReviewSigningFlowState";
import {
  invalidateSigningPacketPrep,
  markSigningPacketPreparedAtGuidedVersion,
  resolveSigningPacketStale,
} from "./guidedDealCompletion/guidedSigningPacketVersion";

const baseFlow = resolveProReviewSigningFlowState({
  uploadedSource: null,
  editedIntent: null,
  packetPrepared: false,
  packetStale: false,
  signersReady: false,
  guidedApplied: true,
});

describe("ProReviewSigningFlowPanel", () => {
  it("final review moment shows Read agreement and Add signers controls", () => {
    const onContinueToSigning = vi.fn();
    const onReadAgreement = vi.fn();
    render(
      <ProReviewSigningFlowPanel
        flowState={baseFlow}
        uploadedSource={null}
        finalReviewMoment
        onContinueToSigning={onContinueToSigning}
        onReadAgreement={onReadAgreement}
        onUploadFile={vi.fn()}
      />,
    );
    expect(screen.getByTestId("pro-review-read-agreement")).toBeTruthy();
    expect(screen.getByTestId("pro-review-continue-to-signing").textContent).toContain(
      "Add signers / prepare signature links",
    );
    fireEvent.click(screen.getByTestId("pro-review-read-agreement"));
    expect(onReadAgreement).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("pro-review-continue-to-signing"));
    expect(onContinueToSigning).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("post-recipient flow shows clear signer prep CTA and hides upload by default", () => {
    const onContinueToSigning = vi.fn();
    render(
      <ProReviewSigningFlowPanel
        flowState={baseFlow}
        uploadedSource={null}
        onContinueToSigning={onContinueToSigning}
        onUploadFile={vi.fn()}
      />,
    );
    expect(screen.getByTestId("pro-review-continue-to-signing")).toBeTruthy();
    expect(screen.getByTestId("pro-review-continue-to-signing").textContent).toContain(
      "Add signers / prepare signature links",
    );
    expect(screen.queryByTestId("pro-review-upload-edited-version")).toBeNull();
    expect(screen.queryByTestId("pro-review-upload-revised-document")).toBeNull();
    fireEvent.click(screen.getByTestId("pro-review-continue-to-signing"));
    expect(onContinueToSigning).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("source includes signer-prep copy", () => {
    const src = readFileSync(join(__dirname, "ProReviewSigningFlowPanel.tsx"), "utf8");
    expect(src).toContain("Add signers / prepare signature links");
    expect(src).toContain("showReviewComparisonActions");
  });

  it("resolveProReviewSigningFlowState returns final_review by default", () => {
    expect(baseFlow.id).toBe("final_review");
  });

  it("upload invalidates packet version when prepared", () => {
    invalidateSigningPacketPrep("test");
    markSigningPacketPreparedAtGuidedVersion("v1", "hash1");
    expect(
      resolveSigningPacketStale({ currentVersionId: "v2", currentBodyHash: "hash1" }).stale,
    ).toBe(true);
  });
});
