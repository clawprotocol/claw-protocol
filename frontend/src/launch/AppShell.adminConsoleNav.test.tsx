/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "./AppShell";

const mockNavigate = vi.fn();

vi.mock("./LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/app",
    search: "",
    hash: "",
    navigate: mockNavigate,
  }),
}));

vi.mock("../config/featureFlags/useFeatureGate", () => ({
  useFeatureGate: () => false,
}));

vi.mock("../access/AccessContext", () => ({
  useAccess: () => ({ tier: "paid" }),
}));

vi.mock("./genesisReferral/genesisAffiliateAccess", () => ({
  useActiveGenesisAffiliateAccess: () => ({ allowed: false }),
}));

const capabilityState = vi.hoisted(() => ({
  ready: true,
  capability: { authorized: false as boolean, role: null as null | "support_operator", userId: null as string | null },
}));

vi.mock("./useOperatorConsoleCapability", () => ({
  useOperatorConsoleCapability: () => capabilityState,
}));

describe("AppShell Admin Console More menu", () => {
  afterEach(() => {
    cleanup();
    mockNavigate.mockClear();
    capabilityState.ready = true;
    capabilityState.capability = { authorized: false, role: null, userId: null };
  });

  it("omits Admin Console when backend capability denies operator access", async () => {
    const user = userEvent.setup();
    render(
      <AppShell title="Dashboard" subtitle="Your agreements">
        <div>child</div>
      </AppShell>,
    );
    await user.click(screen.getByTestId("app-shell-nav-more"));
    const menu = screen.getByTestId("app-shell-nav-more-menu");
    expect(within(menu).queryByRole("menuitem", { name: /admin console/i })).toBeNull();
  });

  it("shows Admin Console and navigates to /app/admin when backend authorizes operator", async () => {
    capabilityState.capability = {
      authorized: true,
      role: "support_operator",
      userId: "op-1",
    };
    const user = userEvent.setup();
    render(
      <AppShell title="Dashboard" subtitle="Your agreements">
        <div>child</div>
      </AppShell>,
    );
    await user.click(screen.getByTestId("app-shell-nav-more"));
    const menu = screen.getByTestId("app-shell-nav-more-menu");
    await user.click(within(menu).getByRole("menuitem", { name: /admin console/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/app/admin");
  });

  it("shows Genesis Referral Ops in More when backend authorizes operator", async () => {
    capabilityState.capability = {
      authorized: true,
      role: "support_operator",
      userId: "op-1",
    };
    const user = userEvent.setup();
    render(
      <AppShell title="Dashboard" subtitle="Your agreements">
        <div>child</div>
      </AppShell>,
    );
    await user.click(screen.getByTestId("app-shell-nav-more"));
    const menu = screen.getByTestId("app-shell-nav-more-menu");
    await user.click(within(menu).getByRole("menuitem", { name: /genesis referral/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/app/ops/genesis-referral");
  });
});
