/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import {
  PAID_PRO_VISIBLE_SHELL_COMPONENT_NAME,
  PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN,
  PaidProVisibleDocumentShell,
  resetPaidProVisibleDocumentShellLogsForTests,
  resolvePaidProVisibleShellRenderBranch,
} from "./paidProVisibleDocumentShell";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { PAID_PRO_REVIEW_VISIBLE_TEXT_MIN } from "./paidProFirstReviewRenderGuard";

const CANONICAL_PLAIN = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  "Section 1. Scope of services and deliverables.",
  "",
  ...Array.from({ length: 32 }, (_, i) => `Section ${i + 2}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
].join("\n\n");

const HOLLOW_HTML = `<div class="premium-doc-body min-h-[12rem]" aria-hidden="true">${" ".repeat(1800)}</div>`;

describe("Test292 paid Pro visible shell owner forced canonical plain", () => {
  afterEach(() => {
    resetPaidProVisibleDocumentShellLogsForTests();
    clearPaidProSourceOfTruth();
    cleanup();
    vi.restoreAllMocks();
  });

  it("resolvePaidProVisibleShellRenderBranch forces canonical_plain_forced when SoT len > 1000", () => {
    establishPaidProSourceOfTruth({
      text: CANONICAL_PLAIN,
      source: "server_full_document_text",
    });
    const resolved = resolvePaidProVisibleShellRenderBranch({
      hasSoT: true,
      sotLen: CANONICAL_PLAIN.length,
      htmlLen: HOLLOW_HTML.length,
    });
    expect(resolved.branch).toBe("canonical_plain_forced");
    expect(resolved.reason).toBe("frozen_sot_len_above_threshold");
    expect(CANONICAL_PLAIN.length).toBeGreaterThan(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);
  });

  it("renders visible agreement text from frozen SoT despite hollow HTML", () => {
    establishPaidProSourceOfTruth({
      text: CANONICAL_PLAIN,
      source: "server_full_document_text",
    });
    const frozen = getPaidProSourceOfTruthText().trim();
    render(
      <PaidProVisibleDocumentShell
        html={HOLLOW_HTML}
        compactDocumentTopPadding
        authoritativeSource="server_full_document_text"
      />,
    );
    const shell = screen.getByTestId("paid-pro-visible-document-shell");
    expect(shell.getAttribute("data-paid-pro-visible-shell-owner")).toBe(
      PAID_PRO_VISIBLE_SHELL_COMPONENT_NAME,
    );
    expect(shell.getAttribute("data-paid-pro-render-branch")).toBe("canonical_plain_forced");
    expect(Number(shell.getAttribute("data-claw-paint-plain-len") || 0)).toBeGreaterThanOrEqual(
      PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN,
    );
    expect(Number(shell.getAttribute("data-claw-paint-plain-len") || 0)).toBe(frozen.length);
    expect(shell.textContent || "").toMatch(/IN WITNESS WHEREOF/i);
    expect(shell.textContent || "").toMatch(/Operative\s*clause/i);
    expect((shell.textContent || "").length).toBeGreaterThan(PAID_PRO_REVIEW_VISIBLE_TEXT_MIN);
    expect(within(shell).getByTestId("simple-pro-final-review-paid-sot-body")).toBeTruthy();
  });

  it("does not depend on canonicalPaidProReview prop — SoT alone drives forced plain", () => {
    establishPaidProSourceOfTruth({
      text: CANONICAL_PLAIN,
      source: "server_full_document_text",
    });
    const frozen = getPaidProSourceOfTruthText().trim();
    render(<PaidProVisibleDocumentShell html="" />);
    const shell = screen.getByTestId("paid-pro-visible-document-shell");
    expect(shell.getAttribute("data-paid-pro-render-branch")).toBe("canonical_plain_forced");
    expect(Number(shell.getAttribute("data-claw-paint-plain-len") || 0)).toBe(frozen.length);
    expect(shell.textContent || "").toMatch(/IN WITNESS WHEREOF/i);
  });

  it("AgreementBuilderIntake wires PaidProVisibleDocumentShell on legacy paid review branch", () => {
    const intakeSrc = readFileSync(
      join(__dirname, "AgreementBuilderIntake.tsx"),
      "utf8",
    );
    expect(intakeSrc).toContain("PaidProVisibleDocumentShell");
    expect(intakeSrc).toMatch(
      /PaidProVisibleDocumentShell[\s\S]{0,200}html=\{premiumReadonlyAgreementHtml\}/,
    );
    expect(intakeSrc).not.toMatch(
      /<SimpleProFinalReviewScreen[\s\S]{0,4000}PaidProVisibleDocumentShell/,
    );
  });

  it("paidProVisibleDocumentShell exports unmistakable mount + branch logs", () => {
    const shellSrc = readFileSync(join(__dirname, "paidProVisibleDocumentShell.tsx"), "utf8");
    expect(shellSrc).toContain("[paid-pro-visible-shell-owner-mounted]");
    expect(shellSrc).toContain("[paid-pro-visible-shell-render-branch]");
    expect(shellSrc).toContain('data-paid-pro-visible-shell-owner');
    expect(shellSrc).toContain('data-paid-pro-render-branch');
  });
});
