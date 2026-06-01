/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaidProSignerSetupOrientationBanner } from "./PaidProSignerSetupOrientationBanner";
import {
  PAID_PRO_SIGNER_SETUP_ORIENTATION_BODY,
  PAID_PRO_SIGNER_SETUP_ORIENTATION_HEADLINE,
  PAID_PRO_SIGNER_SETUP_WORKFLOW_TRAIL,
} from "./paidProWorkflowGuidance";

describe("paidProSignerSetupCopy", () => {
  it("renders tighter signer setup title, body, and workflow trail", () => {
    render(<PaidProSignerSetupOrientationBanner />);
    const banner = screen.getByTestId("paid-pro-signer-setup-orientation");
    expect(banner.textContent).toContain(PAID_PRO_SIGNER_SETUP_ORIENTATION_HEADLINE);
    expect(PAID_PRO_SIGNER_SETUP_ORIENTATION_HEADLINE).toBe("Add signer details");
    expect(banner.textContent).toContain(PAID_PRO_SIGNER_SETUP_ORIENTATION_BODY);
    expect(PAID_PRO_SIGNER_SETUP_ORIENTATION_BODY).toMatch(
      /Enter who will sign for each party/i,
    );
    expect(PAID_PRO_SIGNER_SETUP_ORIENTATION_BODY).toMatch(/No one signs here/i);
    expect(screen.getByTestId("paid-pro-signer-setup-workflow-trail").textContent).toBe(
      PAID_PRO_SIGNER_SETUP_WORKFLOW_TRAIL,
    );
    expect(PAID_PRO_SIGNER_SETUP_WORKFLOW_TRAIL).toBe(
      "Review → Signer details → Signature links → Signing",
    );
  });
});
