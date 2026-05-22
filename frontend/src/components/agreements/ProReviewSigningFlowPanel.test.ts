import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveProReviewSigningFlowState } from "./proReviewSigningFlowState";
import { invalidateSigningPacketPrep, markSigningPacketPreparedAtGuidedVersion, resolveSigningPacketStale } from "./guidedDealCompletion/guidedSigningPacketVersion";

describe("ProReviewSigningFlowPanel", () => {
  it("source includes Continue to signing and Upload edited version", () => {
    const src = readFileSync(join(__dirname, "ProReviewSigningFlowPanel.tsx"), "utf8");
    expect(src).toContain("Continue to signing");
    expect(src).toContain("Upload edited version");
    expect(src).toContain("data-testid=\"pro-review-continue-to-signing\"");
    expect(src).toContain("Your agreement is ready to review");
    expect(src).toContain("pro-review-suggest-edits-card");
  });

  it("resolveProReviewSigningFlowState returns final_review by default", () => {
    const s = resolveProReviewSigningFlowState({
      uploadedSource: null,
      editedIntent: null,
      packetPrepared: false,
      packetStale: false,
      signersReady: false,
      guidedApplied: true,
    });
    expect(s.id).toBe("final_review");
  });

  it("upload invalidates packet version when prepared", () => {
    invalidateSigningPacketPrep("test");
    markSigningPacketPreparedAtGuidedVersion("v1", "hash1");
    expect(
      resolveSigningPacketStale({ currentVersionId: "v2", currentBodyHash: "hash1" }).stale,
    ).toBe(true);
  });
});
