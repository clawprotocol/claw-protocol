/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import {
  PaidProDocumentBodyForcedRoute,
  PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN,
  resetPaidProDocumentBodyRouterLogsForTests,
  resolvePaidProDocumentBodyRouter,
} from "./paidProDocumentBodyRouter";
import { resetPaidProVisibleDocumentShellLogsForTests } from "./paidProVisibleDocumentShell";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { PAID_PRO_REVIEW_VISIBLE_TEXT_MIN } from "./paidProFirstReviewRenderGuard";

const CANONICAL_PLAIN = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  "Section 1. Scope of services and deliverables.",
  "",
  ...Array.from({ length: 34 }, (_, i) => `Section ${i + 2}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
].join("\n\n");

const HOLLOW_HTML = `<div class="premium-doc-body min-h-[12rem]" aria-hidden="true">${" ".repeat(1800)}</div>`;

describe("Test293 paid Pro document body router forced visible shell", () => {
  afterEach(() => {
    resetPaidProDocumentBodyRouterLogsForTests();
    resetPaidProVisibleDocumentShellLogsForTests();
    clearPaidProSourceOfTruth();
    cleanup();
    vi.restoreAllMocks();
  });

  it("resolvePaidProDocumentBodyRouter forces paid_pro_visible_shell_forced when SoT len >= 1000", () => {
    establishPaidProSourceOfTruth({
      text: CANONICAL_PLAIN,
      source: "server_full_document_text",
    });
    const router = resolvePaidProDocumentBodyRouter();
    expect(router.hasSoT).toBe(true);
    expect(router.sotLen).toBeGreaterThanOrEqual(PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN);
    expect(router.branch).toBe("paid_pro_visible_shell_forced");
    expect(router.reason).toBe("frozen_sot_len_meets_threshold");
    expect(router.forced).toBe(true);
  });

  it("PaidProDocumentBodyForcedRoute mounts PaidProVisibleDocumentShell with visible agreement text", () => {
    establishPaidProSourceOfTruth({
      text: CANONICAL_PLAIN,
      source: "server_full_document_text",
    });
    const router = resolvePaidProDocumentBodyRouter();
    render(
      <PaidProDocumentBodyForcedRoute
        router={router}
        html={HOLLOW_HTML}
        compactDocumentTopPadding
        authoritativeSource="server_full_document_text"
      />,
    );
    const forcedRoute = screen.getByTestId("paid-pro-document-body-forced-route");
    expect(forcedRoute.getAttribute("data-paid-pro-document-body-router")).toBe(
      "paid_pro_visible_shell_forced",
    );
    const shell = within(forcedRoute).getByTestId("paid-pro-visible-document-shell");
    expect(shell.getAttribute("data-paid-pro-render-branch")).toBe("canonical_plain_forced");
    expect(
      within(shell).getByText(/CONSULTING AND IMPLEMENTATION AGREEMENT/i),
    ).toBeTruthy();
    expect((forcedRoute.textContent || "").length).toBeGreaterThan(PAID_PRO_REVIEW_VISIBLE_TEXT_MIN);
  });

  it("AgreementBuilderIntake routes forced document inside paid Pro white card before legacy document branches", () => {
    const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intakeSrc).toContain("paidProForcedFirstReviewActive ? (");
    expect(intakeSrc).toContain("<PaidProDocumentBodyForcedRoute");
    expect(intakeSrc).toContain("embedded");
    const forcedIdx = intakeSrc.indexOf("paidProForcedFirstReviewActive ? (");
    const guidedIdx = intakeSrc.indexOf("guidedPreReviewSignerSetupActive ? (", forcedIdx);
    expect(guidedIdx).toBeGreaterThan(forcedIdx);
    const routerSrc = readFileSync(join(__dirname, "paidProDocumentBodyRouter.tsx"), "utf8");
    expect(routerSrc).toContain('data-paid-pro-document-body-router="paid_pro_visible_shell_forced"');
  });

  it("AgreementBuilderIntake resolves router from frozen SoT only (no shell-active gate)", () => {
    const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intakeSrc).toContain("resolvePaidProDocumentBodyRouter()");
    expect(intakeSrc).toMatch(
      /const paidProDocumentBodyRouter = useMemo\(\s*\(\) => resolvePaidProDocumentBodyRouter\(\)/,
    );
    const routerBlock = intakeSrc.slice(
      intakeSrc.indexOf("const paidProDocumentBodyRouter"),
      intakeSrc.indexOf("const paidProDocumentBodyRouter") + 280,
    );
    expect(routerBlock).not.toContain("simpleProFinalReviewShellActive");
    expect(routerBlock).not.toContain("canDisplayPaidProAgreementDocument");
    expect(routerBlock).not.toContain("canonicalPaidProReview");
  });

  it("paidProDocumentBodyRouter exports unavoidable router log", () => {
    const routerSrc = readFileSync(join(__dirname, "paidProDocumentBodyRouter.tsx"), "utf8");
    expect(routerSrc).toContain("[paid-pro-document-body-router]");
    expect(routerSrc).toContain('data-paid-pro-document-body-router="paid_pro_visible_shell_forced"');
  });
});
