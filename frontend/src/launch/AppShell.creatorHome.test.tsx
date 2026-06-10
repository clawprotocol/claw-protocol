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

vi.mock("../monetization/usePowerGatedNavigation", () => ({
  usePowerGatedNavigation: () => ({
    navigateToReuse: vi.fn(),
    navigateToWorkProduct: vi.fn(),
  }),
}));

vi.mock("../config/featureFlags/useFeatureGate", () => ({
  useFeatureGate: () => false,
}));

vi.mock("../access/AccessContext", () => ({
  useAccess: () => ({ tier: "paid" }),
}));

describe("AppShell creator owner home routing", () => {
  afterEach(() => {
    cleanup();
    mockNavigate.mockClear();
  });

  it("creator Home navigates to Dashboard", async () => {
    const user = userEvent.setup();
    render(
      <AppShell title="Dashboard" subtitle="Your agreements">
        <div>child</div>
      </AppShell>,
    );

    const nav = screen.getByTestId("app-shell-primary-nav");
    await user.click(within(nav).getByRole("button", { name: /^Dashboard$/ }));
    expect(mockNavigate).toHaveBeenCalledWith("/app");
    expect(mockNavigate).not.toHaveBeenCalledWith("/");
  });
});
