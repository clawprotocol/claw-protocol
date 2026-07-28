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

  it("uses entitlement-required copy without free-account jargon", () => {
    render(
      <UpgradeToProModal open surface="simple_create" onClose={() => undefined} draftPreserved />,
    );
    expect(screen.getByRole("heading", { name: /save and continue with lawdog/i })).toBeTruthy();
    expect(screen.getByText(/request genesis access or choose pro/i)).toBeTruthy();
    expect(screen.queryByText(/verified record/i)).toBeNull();
    expect(screen.getByRole("button", { name: /choose pro/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /view your agreement/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /keep this draft/i })).toBeTruthy();
    expect(screen.getByTestId("upgrade-draft-preserved")).toBeTruthy();
  });

  it("renders Genesis exhausted copy from server period_ends_at", () => {
    render(
      <UpgradeToProModal
        open
        surface="simple_create"
        onClose={() => undefined}
        variant="genesis_allowance_exhausted"
        periodEndsAt="2026-07-31T23:59:59Z"
      />,
    );
    expect(screen.getByRole("heading", { name: /genesis monthly allowance used/i })).toBeTruthy();
    expect(screen.getByText(/renews on/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /view your agreement/i })).toBeNull();
    expect(screen.getByRole("button", { name: /back to dashboard/i })).toBeTruthy();
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

  it("shows guest-ready CTAs including request genesis", () => {
    const onRequestGenesis = vi.fn();
    render(
      <UpgradeToProModal
        open
        surface="simple_create"
        onClose={() => undefined}
        variant="guest_ready"
        onRequestGenesis={onRequestGenesis}
        onStartNewGuestDraft={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: /your draft is ready/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /request genesis access/i }));
    expect(onRequestGenesis).toHaveBeenCalled();
  });
});
