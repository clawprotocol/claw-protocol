/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  establishAuthoritativeAgreementDocument,
  clearAuthoritativeAgreementDocument,
} from "./authoritativeAgreementDocument";
import { clearFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import {
  PaidProDocumentBodyForcedRoute,
  PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN,
  resetPaidProDocumentBodyRouterLogsForTests,
  resolvePaidProDocumentBodyRouter,
} from "./paidProDocumentBodyRouter";
import {
  assertPaidProReviewRenderInvariant,
  countDomMatches,
  enablePaidProReviewInstrumentationForTests,
  logPaidProReviewBranch,
  PAID_PRO_REVIEW_CTA_REGION_SELECTORS,
  PAID_PRO_REVIEW_DOCUMENT_RENDERER_SELECTORS,
  resetPaidProReviewBranchInstrumentationForTests,
  resolvePaidProReviewBranchPath,
} from "./paidProReviewBranchInstrumentation";
import { PaidProReviewRenderInvariantProbe } from "./PaidProReviewRenderInvariantProbe";
import {
  resetPaidProVisibleDocumentShellLogsForTests,
  resolveCanonicalPlainForVisibleShell,
} from "./paidProVisibleDocumentShell";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";

const CANONICAL_PLAIN = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  "Section 1. Scope of services and deliverables.",
  "",
  ...Array.from({ length: 34 }, (_, i) => `Section ${i + 2}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
].join("\n\n");

describe("Test289 paid Pro review render branch + invariant", () => {
  afterEach(() => {
    resetPaidProDocumentBodyRouterLogsForTests();
    resetPaidProVisibleDocumentShellLogsForTests();
    resetPaidProReviewBranchInstrumentationForTests();
    clearPaidProSourceOfTruth();
    clearAuthoritativeAgreementDocument();
    clearFrozenCanonicalAgreementCorpus();
    cleanup();
    vi.restoreAllMocks();
  });

  it("resolvePaidProDocumentBodyRouter forces from authoritative document without SoT", () => {
    establishAuthoritativeAgreementDocument({
      fullCorpusText: CANONICAL_PLAIN,
      generationMetadata: { source: "server_full_draft", acceptedAt: Date.now(), rawAcceptedLen: CANONICAL_PLAIN.length },
    });
    const router = resolvePaidProDocumentBodyRouter();
    expect(router.hasSoT).toBe(false);
    expect(router.sotLen).toBeGreaterThanOrEqual(PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN);
    expect(router.branch).toBe("paid_pro_visible_shell_forced");
    expect(router.reason).toBe("canonical_review_corpus_len_meets_threshold");
    expect(router.forced).toBe(true);
  });

  it("resolveCanonicalPlainForVisibleShell reads authoritative when SoT absent", () => {
    establishAuthoritativeAgreementDocument({
      fullCorpusText: CANONICAL_PLAIN,
      generationMetadata: { source: "server_full_draft", acceptedAt: Date.now(), rawAcceptedLen: CANONICAL_PLAIN.length },
    });
    const plain = resolveCanonicalPlainForVisibleShell();
    expect(plain.source).toBe("authoritativeAgreementDocument");
    expect(plain.plain.length).toBeGreaterThanOrEqual(PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN);
  });

  it("resolvePaidProReviewBranchPath selects forced_embedded when corpus ready but canDisplay false", () => {
    const path = resolvePaidProReviewBranchPath({
      premiumPaidDocumentSurface: true,
      showPaidProReviewDocumentCard: true,
      proUpgradeUseStarterView: false,
      paidProForcedFirstReviewActive: true,
      guidedPreReviewSignerSetupActive: false,
      paidProAwaitingRuntimeAuthority: false,
      simpleProFinalReviewShellActive: false,
      failedPremiumCorpusActive: false,
      premiumReturnWaitActive: false,
    });
    expect(path.path).toBe("forced_embedded");
  });

  it("resolvePaidProReviewBranchPath reports blocked_can_display when card gate false", () => {
    const path = resolvePaidProReviewBranchPath({
      premiumPaidDocumentSurface: true,
      showPaidProReviewDocumentCard: false,
      proUpgradeUseStarterView: false,
      paidProForcedFirstReviewActive: false,
      guidedPreReviewSignerSetupActive: false,
      paidProAwaitingRuntimeAuthority: false,
      simpleProFinalReviewShellActive: false,
      failedPremiumCorpusActive: false,
      premiumReturnWaitActive: false,
    });
    expect(path.path).toBe("blocked_can_display");
  });

  it("PaidProReviewRenderInvariantProbe fires invariant when shell mounted with corpus but no document", () => {
    enablePaidProReviewInstrumentationForTests();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    render(
      <div id="fadeWrapper">
        <PaidProReviewRenderInvariantProbe
          reviewShellMounted
          snapshot={{
            forcedReviewActive: false,
            firstReviewSurfaceActive: false,
            simpleReviewActive: false,
            signerSetupActive: false,
            canDisplayPaidProDocument: false,
            canonicalReviewCorpusReady: true,
            canonicalReviewCorpusLen: CANONICAL_PLAIN.length,
            hasCanonicalCorpus: true,
            premiumPaidDocumentSurface: true,
            documentMounted: false,
            chromeMounted: false,
            signerMounted: false,
            path: "blocked_can_display",
            reason: "review_document_card_gate_false",
          }}
        />
      </div>,
    );

    expect(errorSpy).toHaveBeenCalled();
    const invariantCall = errorSpy.mock.calls.find((c) =>
      String(c[0]).includes("[paid-pro-review-render-invariant]"),
    );
    expect(invariantCall).toBeTruthy();
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("assertPaidProReviewRenderInvariant fires when corpus exists but document renderer count is zero", () => {
    enablePaidProReviewInstrumentationForTests();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    assertPaidProReviewRenderInvariant({
      reviewShellMounted: true,
      hasCanonicalCorpus: true,
      canonicalReviewCorpusLen: CANONICAL_PLAIN.length,
      documentRendererCount: 0,
      ctaRegionCount: 0,
      path: "blocked_can_display",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "[paid-pro-review-render-invariant]",
      expect.objectContaining({ documentRendererCount: 0 }),
    );
    errorSpy.mockRestore();
  });

  it("assertPaidProReviewRenderInvariant is silent when document renderer present", () => {
    enablePaidProReviewInstrumentationForTests();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const root = document.createElement("div");
    root.innerHTML = '<div data-testid="paid-pro-document-body-forced-route">doc</div>';
    assertPaidProReviewRenderInvariant({
      reviewShellMounted: true,
      hasCanonicalCorpus: true,
      canonicalReviewCorpusLen: CANONICAL_PLAIN.length,
      documentRendererCount: countDomMatches(root, PAID_PRO_REVIEW_DOCUMENT_RENDERER_SELECTORS),
      ctaRegionCount: countDomMatches(root, PAID_PRO_REVIEW_CTA_REGION_SELECTORS),
      path: "forced_embedded",
    });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("PaidProDocumentBodyForcedRoute renders authoritative plain without SoT", () => {
    establishAuthoritativeAgreementDocument({
      fullCorpusText: CANONICAL_PLAIN,
      generationMetadata: { source: "server_full_draft", acceptedAt: Date.now(), rawAcceptedLen: CANONICAL_PLAIN.length },
    });
    const router = resolvePaidProDocumentBodyRouter();
    render(
      <PaidProDocumentBodyForcedRoute
        embedded
        router={router}
        html=""
        authoritativeSource="authoritativeAgreementDocument"
      />,
    );
    expect(screen.getByTestId("paid-pro-document-body-forced-route")).toBeTruthy();
    expect(screen.getByText(/CONSULTING AND IMPLEMENTATION AGREEMENT/i)).toBeTruthy();
  });

  it("AgreementBuilderIntake widens review document card gate and wires branch instrumentation", () => {
    const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intakeSrc).toContain("showPaidProReviewDocumentCard");
    expect(intakeSrc).toContain("resolveShowPaidProReviewDocumentCard");
    expect(intakeSrc).toContain("shouldForcePaidProReviewDocumentRender");
    expect(intakeSrc).toContain("PaidProReviewRenderInvariantProbe");
    expect(intakeSrc).toContain("logPaidProReviewBranch");
    expect(intakeSrc).toContain("paidProCanonicalReviewCorpusReady");
    const instrumentationSrc = readFileSync(
      join(__dirname, "paidProReviewBranchInstrumentation.ts"),
      "utf8",
    );
    expect(instrumentationSrc).toContain("[paid-pro-review-branch]");
    expect(instrumentationSrc).toContain("[paid-pro-review-render-invariant]");
    const gateIdx = intakeSrc.indexOf("showPaidProReviewDocumentCard ? (");
    const legacyIdx = intakeSrc.indexOf("canDisplayPaidProAgreementDocument");
    expect(gateIdx).toBeGreaterThan(legacyIdx);
  });

  it("logPaidProReviewBranch emits structured branch payload", () => {
    resetPaidProReviewBranchInstrumentationForTests();
    enablePaidProReviewInstrumentationForTests();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logPaidProReviewBranch({
      forcedReviewActive: true,
      firstReviewSurfaceActive: true,
      simpleReviewActive: false,
      signerSetupActive: false,
      canDisplayPaidProDocument: false,
      canonicalReviewCorpusReady: true,
      canonicalReviewCorpusLen: 15890,
      hasCanonicalCorpus: true,
      premiumPaidDocumentSurface: true,
      documentMounted: true,
      chromeMounted: true,
      signerMounted: false,
      path: "forced_embedded",
      reason: "paid_pro_forced_first_review_active",
    });
    expect(infoSpy).toHaveBeenCalledWith(
      "[paid-pro-review-branch]",
      expect.objectContaining({
        forcedReviewActive: true,
        documentMounted: true,
        chromeMounted: true,
      }),
    );
    infoSpy.mockRestore();
  });
});
