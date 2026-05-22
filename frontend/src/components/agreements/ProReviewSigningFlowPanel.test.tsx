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
  it("final review shows only Read agreement, Suggest changes, and Continue to signing", () => {
    render(
      <ProReviewSigningFlowPanel
        flowState={baseFlow}
        uploadedSource={null}
        finalReviewMoment
        suggestEditsDraft=""
        onSuggestEditsDraftChange={vi.fn()}
        onApplySuggestEdits={vi.fn()}
        onContinueToSigning={vi.fn()}
        onUploadFile={vi.fn()}
        onReadAgreement={vi.fn()}
      />,
    );
    expect(screen.getByTestId("pro-review-continue-to-signing")).toBeTruthy();
    expect(screen.getByTestId("pro-review-read-agreement")).toBeTruthy();
    expect(screen.getByTestId("pro-review-suggest-changes-toggle")).toBeTruthy();
    expect(screen.queryByTestId("pro-review-upload-edited-version")).toBeNull();
    expect(screen.queryByTestId("pro-review-compare-versions")).toBeNull();
    expect(screen.getByText(/Your agreement is ready to review/i)).toBeTruthy();
    cleanup();
  });

  it("expands suggest changes with textarea and upload", () => {
    render(
      <ProReviewSigningFlowPanel
        flowState={baseFlow}
        uploadedSource={null}
        finalReviewMoment
        suggestEditsDraft="Add indemnity cap"
        onSuggestEditsDraftChange={vi.fn()}
        onApplySuggestEdits={vi.fn()}
        onContinueToSigning={vi.fn()}
        onUploadFile={vi.fn()}
        onReadAgreement={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("pro-review-suggest-changes-toggle"));
    expect(screen.getByTestId("pro-review-suggest-edits-card")).toBeTruthy();
    expect(screen.getByText(/Side-by-side redline comparison is not available yet/i)).toBeTruthy();
    expect(screen.getByTestId("pro-review-upload-revised-document")).toBeTruthy();
    cleanup();
  });

  it("source includes final review test ids", () => {
    const src = readFileSync(join(__dirname, "ProReviewSigningFlowPanel.tsx"), "utf8");
    expect(src).toContain("Continue to signing");
    expect(src).toContain("pro-review-suggest-changes-toggle");
    expect(src).toContain("Your agreement is ready to review");
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
