/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PremiumProGenerationWaitPanel } from "./PremiumProGenerationWaitPanel";
import {
  PREMIUM_PRO_WAIT_REASSURANCE,
  resolvePremiumProWaitModalView,
} from "../../lib/premiumPostCheckoutReturnUx";

describe("PremiumProGenerationWaitPanel", () => {
  it("renders one headline, one reassurance, and compact progress pills", () => {
    const view = resolvePremiumProWaitModalView("processing");
    render(
      <PremiumProGenerationWaitPanel view={view} titleId="test-wait-title" />,
    );
    expect(screen.getByRole("heading", { name: /Generating your agreement draft/i })).toBeTruthy();
    expect(screen.getAllByText(PREMIUM_PRO_WAIT_REASSURANCE)).toHaveLength(1);
    expect(screen.getByText("Terms loaded")).toBeTruthy();
    expect(screen.queryByText("Payment")).toBeNull();
    expect(screen.getByText("Pro draft generating")).toBeTruthy();
    expect(screen.getByText(/1–3 minutes/i)).toBeTruthy();
  });

  it("shows recovery actions only on terminal failure", () => {
    const extended = resolvePremiumProWaitModalView("extended_wait");
    const { rerender } = render(
      <PremiumProGenerationWaitPanel view={extended} titleId="test-wait-title" />,
    );
    expect(screen.queryByRole("button", { name: /Retry Pro generation/i })).toBeNull();

    const failed = resolvePremiumProWaitModalView("terminal_failure");
    rerender(<PremiumProGenerationWaitPanel view={failed} titleId="test-wait-title" />);
    expect(screen.getByRole("button", { name: /Retry Pro generation/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Use current draft/i })).toBeTruthy();
  });

  it("shows success status and check without spinner", () => {
    const view = resolvePremiumProWaitModalView("success");
    const { container } = render(
      <PremiumProGenerationWaitPanel view={view} titleId="test-wait-title" />,
    );
    expect(screen.getByText(/Agreement draft ready/i)).toBeTruthy();
    expect(screen.getByText(/Opening your review screen/i)).toBeTruthy();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});
