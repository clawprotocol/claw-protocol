/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateWorkspaceProEntitlementCache,
  markWorkspaceProEntitlementResolvedForTests,
} from "../../agreement/agreementProFunnelGate";
import { setCachedAccessToken, clearCachedAccessToken } from "../../auth/authAccessTokenCache";
import { markAuthenticatedWorkspaceSession } from "../../launch/completedAgreementViewContext";
import { setOrgId } from "../../launch/orgContext";
import {
  clearPaidDashboardCreateContextForTests,
  markPaidDashboardCreateContext,
} from "../../launch/paidDashboardCreateContext";
import {
  resolveAuthoritativeCreateFlowReviewShell,
  shouldUsePaidProCreateFlowReviewShell,
} from "./authoritativeCreateFlowReviewShell";
import { resolvePaidCreateFlowFullDraftAccess } from "./returningPaidCreateBootstrap";

const agreementsDir = join(__dirname);

describe("TEST516 — /app/create module graph loads without TDZ", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    clearPaidDashboardCreateContextForTests();
    markAuthenticatedWorkspaceSession();
    setOrgId("user-test-516");
    setCachedAccessToken("test-token-516");
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    clearPaidDashboardCreateContextForTests();
    vi.restoreAllMocks();
  });

  it("breaks authoritativeCreateFlowReviewShell ↔ returningPaidCreateBootstrap init cycle", () => {
    const shellSrc = readFileSync(join(agreementsDir, "authoritativeCreateFlowReviewShell.ts"), "utf8");
    const bootstrapSrc = readFileSync(join(agreementsDir, "returningPaidCreateBootstrap.ts"), "utf8");
    expect(shellSrc).not.toContain('from "./returningPaidCreateBootstrap"');
    expect(shellSrc).toContain('from "./paidCreateFlowEntitlementProbe"');
    expect(bootstrapSrc).toContain('from "./paidCreateFlowEntitlementProbe"');
  });

  it("state leaf modules do not import SoT/render/parity barrels", () => {
    const stateSrc = readFileSync(join(agreementsDir, "paidProSourceOfTruthState.ts"), "utf8");
    const invariantStateSrc = readFileSync(
      join(agreementsDir, "paidProReviewSessionCorpusInvariantState.ts"),
      "utf8",
    );
    for (const src of [stateSrc, invariantStateSrc]) {
      expect(src).not.toMatch(/from "\.\/paidProSourceOfTruth"/);
      expect(src).not.toContain("paidProReviewRenderCorpus");
      expect(src).not.toContain("paidProReviewSotParity");
      expect(src).not.toContain("paidProReviewSessionCorpusInvariant.ts");
    }
  });

  it("render hot path reads SoT from state leaf, not establishment module", () => {
    const renderSrc = readFileSync(join(agreementsDir, "paidProReviewRenderCorpus.ts"), "utf8");
    expect(renderSrc).toContain('from "./paidProSourceOfTruthState"');
    expect(renderSrc).not.toMatch(/from "\.\/paidProSourceOfTruth"/);
  });

  it(
    "dynamic import graph for founder → Create resolves paid_pro shell without TDZ",
    async () => {
      vi.stubGlobal("location", { ...window.location, pathname: "/founder" });
      markPaidDashboardCreateContext("founder_top_nav_create");
      vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });

      const probe = await import("./paidCreateFlowEntitlementProbe");
      expect(probe.resolveProvisionalWorkspaceProEntitledForCreate()).toBe(true);

      const shell = await import("./authoritativeCreateFlowReviewShell");
      expect(typeof shell.shouldUsePaidProCreateFlowReviewShell).toBe("function");
      expect(shell.resolveAuthoritativeCreateFlowReviewShell()).toBe("paid_pro");

      const bootstrap = await import("./returningPaidCreateBootstrap");
      expect(typeof bootstrap.resolvePaidCreateFlowFullDraftAccess).toBe("function");
      expect(bootstrap.resolvePaidCreateFlowFullDraftAccess()).toBe(true);

      const state = await import("./paidProSourceOfTruthState");
      expect(typeof state.hashPaidProCorpus).toBe("function");
      expect(state.hasPaidProSourceOfTruth()).toBe(false);

      const render = await import("./paidProReviewRenderCorpus");
      expect(typeof render.resolvePaidProReviewRenderPlain).toBe("function");

      const sot = await import("./paidProSourceOfTruth");
      expect(typeof sot.establishPaidProSourceOfTruth).toBe("function");

      const premiumEnsure = await import("./premiumCompletionEnsure");
      expect(typeof premiumEnsure.ensurePremiumCompletion).toBe("function");

      expect(shouldUsePaidProCreateFlowReviewShell()).toBe(true);
      expect(resolveAuthoritativeCreateFlowReviewShell()).toBe("paid_pro");
      expect(resolvePaidCreateFlowFullDraftAccess()).toBe(true);
    },
    30_000,
  );
});
