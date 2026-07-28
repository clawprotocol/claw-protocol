/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpgradeToProModal } from "./UpgradeToProModal";

const navigate = vi.fn();

vi.mock("../launch/LaunchNavContext", () => ({
  useLaunchNav: () => ({ navigate }),
}));

vi.mock("../lib/experimentation/productEvents", () => ({
  logProductEvent: vi.fn(),
}));

describe("UpgradeToProModal", () => {
  afterEach(() => {
    cleanup();
    navigate.mockReset();
  });

  it("uses customer-facing free-allowance copy (no verified-record jargon)", () => {
    render(
      <UpgradeToProModal open surface="simple_create" onClose={() => undefined} draftPreserved />,
    );
    expect(screen.getByRole("heading", { name: /used your free agreement/i })).toBeTruthy();
    expect(screen.getByText(/free agreement is complete/i)).toBeTruthy();
    expect(screen.queryByText(/verified record/i)).toBeNull();
    expect(screen.queryByText(/maybe later/i)).toBeNull();
    expect(screen.getByRole("button", { name: /upgrade to pro/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /view your agreement/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /keep this draft/i })).toBeTruthy();
    expect(screen.getByTestId("upgrade-draft-preserved")).toBeTruthy();
  });

  it("preserves draft on keep-this-draft without clearing escape paths", () => {
    const onClose = vi.fn();
    render(
      <UpgradeToProModal
        open
        surface="simple_create"
        onClose={onClose}
        draftPreserved
        viewExistingPath="/app/agreements"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /keep this draft/i }));
    expect(onClose).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("routes view-your-agreement to the existing agreement path", () => {
    const onClose = vi.fn();
    render(
      <UpgradeToProModal
        open
        surface="simple_create"
        onClose={onClose}
        viewExistingPath="/app/agreements/ag_done"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /view your agreement/i }));
    expect(onClose).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/app/agreements/ag_done");
  });

  it("keeps Genesis exhausted copy distinct from free exhaustion", () => {
    render(
      <UpgradeToProModal
        open
        surface="simple_create"
        onClose={() => undefined}
        variant="genesis_allowance_exhausted"
      />,
    );
    expect(screen.getByRole("heading", { name: /genesis monthly allowance used/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /view your agreement/i })).toBeNull();
    expect(screen.getByRole("button", { name: /back to dashboard/i })).toBeTruthy();
  });
});
