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
  logAuthoritativeCreateFlowReviewShellResolved,
  resolveAuthoritativeCreateFlowReviewShell,
  shouldUsePaidProCreateFlowReviewShell,
} from "./authoritativeCreateFlowReviewShell";

const agreementsDir = join(__dirname);

const LEAF_PROBE_FILES = [
  "paidCreateFlowEntitlementProbe.ts",
  "paidCreateFlowWorkspaceEntitlementProbe.ts",
  "paidCreateFlowPremiumSessionProbe.ts",
  "paidCreateFlowPipelineAcceptanceProbe.ts",
  "paidProSourceOfTruthState.ts",
  "paidProReviewSessionCorpusInvariantState.ts",
] as const;

const FORBIDDEN_LEAF_IMPORTS = [
  "authoritativeCreateFlowReviewShell",
  "returningPaidCreateBootstrap",
  "paidProCreateFlowReviewHandoff",
  "premiumCompletionStorage",
  "paidProSourceOfTruth.ts",
  "paidProReviewRenderCorpus",
  "paidProReviewSotParity",
  "paidProReviewSessionCorpusInvariant.ts",
] as const;

describe("TEST517 — production create route module graph (founder → Create)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    clearPaidDashboardCreateContextForTests();
    markAuthenticatedWorkspaceSession();
    setOrgId("user-test-517");
    setCachedAccessToken("test-token-517");
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    clearPaidDashboardCreateContextForTests();
    vi.restoreAllMocks();
  });

  it("leaf probes do not import review shell / handoff / premiumCompletionStorage barrels", () => {
    for (const file of LEAF_PROBE_FILES) {
      const src = readFileSync(join(agreementsDir, file), "utf8");
      for (const forbidden of FORBIDDEN_LEAF_IMPORTS) {
        expect(src, `${file} must not import ${forbidden}`).not.toContain(`from "./${forbidden}"`);
        expect(src, `${file} must not import ${forbidden}`).not.toContain(`from '../${forbidden}"`);
      }
    }
  });

  it("paidProAgreementAuthority does not import paidProCreateFlowReviewHandoff (breaks 3-node cycle)", () => {
    const src = readFileSync(join(agreementsDir, "paidProAgreementAuthority.ts"), "utf8");
    expect(src).not.toContain('from "./paidProCreateFlowReviewHandoff"');
    expect(src).toContain('from "./paidCreateFlowWorkspaceEntitlementProbe"');
    expect(src).toContain('from "./paidProAuthorityConstants"');
  });

  it("paidCreateFlowEntitlementProbe does not import premiumCompletionStorage", () => {
    const src = readFileSync(join(agreementsDir, "paidCreateFlowEntitlementProbe.ts"), "utf8");
    expect(src).not.toContain("premiumCompletionStorage");
    expect(src).toContain("paidCreateFlowPremiumSessionProbe");
  });

  it("paidProAuthoritativeRef is declared before hasFullDraftAccess memo (in-component TDZ guard)", () => {
    const intake = readFileSync(join(agreementsDir, "AgreementBuilderIntake.tsx"), "utf8");
    const idxRef = intake.indexOf("const paidProAuthoritativeRef = useRef(false)");
    const idxMemo = intake.indexOf("const hasFullDraftAccess = useMemo(");
    const idxSync = intake.indexOf("const syncUpgradeIntentRefs = React.useCallback(");
    expect(idxRef).toBeGreaterThan(-1);
    expect(idxMemo).toBeGreaterThan(-1);
    expect(idxSync).toBeGreaterThan(-1);
    expect(idxRef).toBeLessThan(idxSync);
    expect(idxRef).toBeLessThan(idxMemo);
    expect(intake.indexOf("const paidProAuthoritativeRef = useRef(false)", idxRef + 1)).toBe(-1);
  });

  it(
    "founder → Create dynamic import graph resolves paid_pro shell and AgreementBuilderIntake without TDZ",
    async () => {
      vi.stubGlobal("location", { ...window.location, pathname: "/founder" });
      markPaidDashboardCreateContext("founder_top_nav_create");
      vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });

      const launchNav = await import("../../launch/LaunchNavContext");
      expect(launchNav).toBeTruthy();

      const shell = await import("./authoritativeCreateFlowReviewShell");
      expect(shell.resolveAuthoritativeCreateFlowReviewShell()).toBe("paid_pro");
      expect(shell.shouldUsePaidProCreateFlowReviewShell()).toBe(true);

      const authority = await import("./paidProAgreementAuthority");
      expect(typeof authority.isPaidProAgreementAuthoritative).toBe("function");

      const handoff = await import("./paidProCreateFlowReviewHandoff");
      expect(typeof handoff.resolveCreateFlowPaidAcceptedCorpusPlain).toBe("function");

      const intake = await import("./AgreementBuilderIntake");
      expect(intake.default).toBeTruthy();

      logAuthoritativeCreateFlowReviewShellResolved({});
      expect(shouldUsePaidProCreateFlowReviewShell()).toBe(true);
      expect(resolveAuthoritativeCreateFlowReviewShell()).toBe("paid_pro");
    },
    60_000,
  );
});
