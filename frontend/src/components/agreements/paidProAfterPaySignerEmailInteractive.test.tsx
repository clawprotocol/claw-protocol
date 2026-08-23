/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React, { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  canOpenPaidSessionFinalReviewAfterSigners,
  PAID_PRO_SIGNER_EMAIL_FIELD_WRAPPER_CLASS,
  PAID_PRO_SIGNER_EMAIL_INPUT_CLASS,
  readPremiumCompletionReturnFromHref,
  resolvePaidSessionTwoSignerNamesEmailsComplete,
  shouldKeepPaidSessionSignerEmailsInteractive,
  shouldShowPaidSessionGeneratingOverlay,
  shouldSuppressFreeMissingTenetAskAfterPay,
} from "./paidProPaidSessionLanding";

const INTAKE = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
const CREATE_PAGE = readFileSync(
  join(__dirname, "../../launch/simpleProduct/SimpleCreatePage.tsx"),
  "utf8",
);
const PAID_RESTORE_HREF =
  "https://lawdog.me/app/create?restore=starterReview&premiumCompletion=1";

function AfterPayTwoSignerEmails() {
  const [r1, setR1] = useState("");
  const [r2, setR2] = useState("");
  return (
    <div data-testid="after-pay-signer-emails">
      <label className={PAID_PRO_SIGNER_EMAIL_FIELD_WRAPPER_CLASS}>
        Reviewer 1 email
        <input
          type="email"
          disabled={false}
          readOnly={false}
          tabIndex={0}
          data-claw-recipient-field="r1-email"
          aria-label="Reviewer 1 email"
          className={PAID_PRO_SIGNER_EMAIL_INPUT_CLASS}
          value={r1}
          onChange={(e) => setR1(e.target.value)}
        />
      </label>
      <label className={PAID_PRO_SIGNER_EMAIL_FIELD_WRAPPER_CLASS}>
        Reviewer 2 email
        <input
          type="email"
          disabled={false}
          readOnly={false}
          tabIndex={0}
          data-claw-recipient-field="r2-email"
          aria-label="Reviewer 2 email"
          className={PAID_PRO_SIGNER_EMAIL_INPUT_CLASS}
          value={r2}
          onChange={(e) => setR2(e.target.value)}
        />
      </label>
    </div>
  );
}

describe("after-pay signer emails stay typeable (live #97 hole)", () => {
  afterEach(() => {
    cleanup();
  });

  it("premiumCompletion=1 / paid session keeps leftover ask suppressed", () => {
    expect(readPremiumCompletionReturnFromHref(PAID_RESTORE_HREF)).toBe(true);
    expect(
      shouldSuppressFreeMissingTenetAskAfterPay({
        paidSessionActive: true,
        premiumCompletionReturn: true,
      }),
    ).toBe(true);
    expect(
      shouldKeepPaidSessionSignerEmailsInteractive({
        paidSessionActive: true,
        premiumCompletionReturn: true,
      }),
    ).toBe(true);
    expect(INTAKE).toContain("freeMissingTenetAskVisible");
    expect(INTAKE).toContain("suppressFreeMissingTenetAskAfterPay ? null : freeMissingTenetAsk");
    expect(INTAKE).not.toMatch(/3 quick questions/);
  });

  it("r1-email and r2-email are real enabled inputs (no disabled/readOnly/pointer-events-none)", () => {
    const emailBlockStart = INTAKE.indexOf(
      'data-claw-recipient-field={idx <= 1 ? (idx === 0 ? "r1-email" : "r2-email")',
    );
    expect(emailBlockStart).toBeGreaterThan(0);
    const emailInputStart = INTAKE.lastIndexOf("<input", emailBlockStart);
    const emailBlock = INTAKE.slice(emailInputStart, emailBlockStart + 900);
    expect(emailBlock).toContain('type="email"');
    expect(emailBlock).toContain("disabled={false}");
    expect(emailBlock).toContain("readOnly={false}");
    expect(emailBlock).toContain("tabIndex={0}");
    expect(emailBlock).toContain("PAID_PRO_SIGNER_EMAIL_INPUT_CLASS");
    expect(INTAKE).toContain("PAID_PRO_SIGNER_EMAIL_FIELD_WRAPPER_CLASS");
    expect(emailBlock).not.toMatch(/disabled=\{true\}/);
    expect(emailBlock).not.toMatch(/readOnly=\{true\}/);
    expect(emailBlock).not.toMatch(/pointer-events-none/);
    expect(PAID_PRO_SIGNER_EMAIL_INPUT_CLASS).toContain("pointer-events-auto");
    expect(PAID_PRO_SIGNER_EMAIL_INPUT_CLASS).not.toContain("pointer-events-none");
    expect(PAID_PRO_SIGNER_EMAIL_FIELD_WRAPPER_CLASS).toContain("pointer-events-auto");
    expect(PAID_PRO_SIGNER_EMAIL_FIELD_WRAPPER_CLASS).not.toContain("pointer-events-none");
  });

  it("after-pay suppress is handled (return true) so starter generate cannot lock emails", () => {
    const beginAsk = INTAKE.indexOf("const beginFreeMissingTenetAsk");
    expect(beginAsk).toBeGreaterThan(-1);
    const beginAskBody = INTAKE.slice(
      beginAsk,
      INTAKE.indexOf("const resolvePaidCreateGateBypassContext", beginAsk),
    );
    expect(beginAskBody).toContain("shouldSuppressFreeMissingTenetAskAfterPay");
    expect(beginAskBody).toContain("setFreeMissingTenetAsk(null)");
    expect(beginAskBody).toContain("return true");
    expect(beginAskBody.indexOf("return true")).toBeLessThan(
      beginAskBody.indexOf("evaluateFreeStarterMissingTenetAsk"),
    );
    expect(INTAKE).toContain("suppressFreeMissingTenetAskAfterPay ? null : (");
    expect(INTAKE).toContain("signerEmailsMustStayInteractive: paidSessionSignerEmailsInteractive");
    expect(INTAKE).toContain("!paidSessionSignerEmailsInteractive ? (");
    expect(CREATE_PAGE).toContain("!premiumCompletionReturn");
    expect(CREATE_PAGE).toContain("!paidDemoPremiumSession");
  });

  it("two typed signer emails stay in the fields and open existing final review", async () => {
    const user = userEvent.setup();
    render(<AfterPayTwoSignerEmails />);
    const r1 = screen.getByLabelText("Reviewer 1 email") as HTMLInputElement;
    const r2 = screen.getByLabelText("Reviewer 2 email") as HTMLInputElement;
    expect(r1.disabled).toBe(false);
    expect(r2.disabled).toBe(false);
    expect(r1.readOnly).toBe(false);
    expect(r2.readOnly).toBe(false);
    expect(r1.getAttribute("data-claw-recipient-field")).toBe("r1-email");
    expect(r2.getAttribute("data-claw-recipient-field")).toBe("r2-email");
    await user.click(r1);
    expect(document.activeElement).toBe(r1);
    await user.type(r1, "diego.alvarez.qa@example.com");
    await user.click(r2);
    expect(document.activeElement).toBe(r2);
    await user.type(r2, "priya.shah.qa@example.com");
    expect(r1.value).toBe("diego.alvarez.qa@example.com");
    expect(r2.value).toBe("priya.shah.qa@example.com");
    const twoSigners = resolvePaidSessionTwoSignerNamesEmailsComplete({
      signer1Name: "Diego Alvarez of Harbor Marks LLC",
      signer1Email: r1.value,
      signer2Name: "Priya Shah of Northline Studio",
      signer2Email: r2.value,
    });
    expect(twoSigners).toBe(true);
    expect(
      canOpenPaidSessionFinalReviewAfterSigners({
        paidSessionActive: true,
        visibleDealBody: true,
        twoSignerNamesAndEmailsComplete: twoSigners,
      }),
    ).toBe(true);
    expect(
      shouldShowPaidSessionGeneratingOverlay({
        phase: "processing",
        hasVisibleDealBody: true,
        signerEmailsMustStayInteractive: true,
      }),
    ).toBe(false);
  });
});
