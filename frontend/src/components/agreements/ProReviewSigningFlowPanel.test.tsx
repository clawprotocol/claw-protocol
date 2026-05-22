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
  it("post-recipient flow shows continue and upload edited version", () => {
    render(
      <ProReviewSigningFlowPanel
        flowState={baseFlow}
        uploadedSource={null}
        onContinueToSigning={vi.fn()}
        onUploadFile={vi.fn()}
      />,
    );
    expect(screen.getByTestId("pro-review-continue-to-signing")).toBeTruthy();
    expect(screen.getByTestId("pro-review-upload-edited-version")).toBeTruthy();
    cleanup();
  });

  it("source includes continue to signing", () => {
    const src = readFileSync(join(__dirname, "ProReviewSigningFlowPanel.tsx"), "utf8");
    expect(src).toContain("Continue to signing");
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
