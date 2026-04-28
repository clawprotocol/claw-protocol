import { describe, expect, it } from "vitest";
import {
  resolverTrustedForPremiumVisibleCommit,
  shouldImmediateAuthoritativePremiumCommit,
} from "./premiumImmediateAuthoritativeCommitGate";

/**
 * Regression: post-checkout modal soft timeout + late premium-full-draft success (~16k server_full_draft).
 * Immediate authoritative commit must still run — extended-wait / fail-open UI must not block this gate.
 */
describe("shouldImmediateAuthoritativePremiumCommit", () => {
  it("commits when body >10k, pipeline server_full_draft, validation ok (typical production path)", () => {
    expect(
      shouldImmediateAuthoritativePremiumCommit({
        usePaidAuthoritativeBody: true,
        snapshotPlainTrimLen: 16200,
        premiumPipelineSource: "server_full_draft",
        validatePaidProOutputOk: true,
        premiumRenderResolveSource: "server_full_document_text",
      }),
    ).toBe(true);
  });

  it("commits when validation fails but resolver already pinned server_full_document_text (client gate mismatch)", () => {
    expect(
      shouldImmediateAuthoritativePremiumCommit({
        usePaidAuthoritativeBody: true,
        snapshotPlainTrimLen: 16200,
        premiumPipelineSource: "server_full_draft",
        validatePaidProOutputOk: false,
        premiumRenderResolveSource: "server_full_document_text",
      }),
    ).toBe(true);
  });

  it("commits for server_full_draft_retry with resolver-trusted repair path", () => {
    expect(
      shouldImmediateAuthoritativePremiumCommit({
        usePaidAuthoritativeBody: true,
        snapshotPlainTrimLen: 12000,
        premiumPipelineSource: "server_full_draft_retry",
        validatePaidProOutputOk: false,
        premiumRenderResolveSource: "server_repair_document_text",
      }),
    ).toBe(true);
  });

  it("commits for server_full_draft_degraded when resolver pinned server_full_document_text (paid short-circuit)", () => {
    expect(
      shouldImmediateAuthoritativePremiumCommit({
        usePaidAuthoritativeBody: true,
        snapshotPlainTrimLen: 9000,
        premiumPipelineSource: "server_full_draft_degraded",
        validatePaidProOutputOk: false,
        premiumRenderResolveSource: "server_full_document_text",
      }),
    ).toBe(true);
  });

  it("does not commit when snapshot too short even if pipeline says server_full_draft", () => {
    expect(
      shouldImmediateAuthoritativePremiumCommit({
        usePaidAuthoritativeBody: true,
        snapshotPlainTrimLen: 400,
        premiumPipelineSource: "server_full_draft",
        validatePaidProOutputOk: true,
        premiumRenderResolveSource: "server_full_document_text",
      }),
    ).toBe(false);
  });

  it("does not commit when resolver still live_generated_preview and validation fails", () => {
    expect(
      shouldImmediateAuthoritativePremiumCommit({
        usePaidAuthoritativeBody: true,
        snapshotPlainTrimLen: 16200,
        premiumPipelineSource: "server_full_draft",
        validatePaidProOutputOk: false,
        premiumRenderResolveSource: "live_generated_preview",
      }),
    ).toBe(false);
  });
});

describe("resolverTrustedForPremiumVisibleCommit", () => {
  it("is true for server_full_document_text and server_repair_document_text only", () => {
    expect(resolverTrustedForPremiumVisibleCommit("server_full_document_text")).toBe(true);
    expect(resolverTrustedForPremiumVisibleCommit("server_repair_document_text")).toBe(true);
    expect(resolverTrustedForPremiumVisibleCommit("live_generated_preview")).toBe(false);
    expect(resolverTrustedForPremiumVisibleCommit(null)).toBe(false);
  });
});
