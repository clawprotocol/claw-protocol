/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { AppShell } from "./AppShell";

vi.mock("../LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/app/esign/doc1",
    search: "?agreement_bridge=1",
    hash: "",
    navigate: vi.fn(),
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

describe("AppShell esign bridge nav", () => {
  afterEach(() => {
    cleanup();
  });

  it("esign_bridge_focused has no Home buttons and shows My agreements + Dashboard", () => {
    render(
      <AppShell title="Prepare for e-signing" subtitle="Test" navMode="esign_bridge_focused">
        <div>child</div>
      </AppShell>,
    );
    const nav = screen.getByTestId("app-shell-primary-nav");
    expect(within(nav).queryAllByRole("button", { name: /^Home$/ })).toHaveLength(0);
    expect(within(nav).getByRole("button", { name: "My agreements" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Dashboard" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Create" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Billing" })).toBeTruthy();
    expect(within(nav).queryByRole("button", { name: "Integrations" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Work product" })).toBeNull();
  });

  it("default nav still exposes Home twice (legacy)", () => {
    render(
      <AppShell title="Continue your document" subtitle="Test">
        <div>child</div>
      </AppShell>,
    );
    const nav = screen.getByTestId("app-shell-primary-nav");
    expect(within(nav).getAllByRole("button", { name: /^Home$/ })).toHaveLength(2);
  });

  it("minimal nav shows only logo, back to dashboard, and new agreement", () => {
    render(
      <AppShell title="Genesis Dogs Partner Access" subtitle="Test" navMode="minimal" compactFooter>
        <div>child</div>
      </AppShell>,
    );
    const nav = screen.getByTestId("app-shell-primary-nav");
    expect(nav.getAttribute("data-app-shell-nav")).toBe("minimal");
    expect(within(nav).queryByRole("button", { name: /^Home$/ })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Create" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Quick send" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Reuse" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Work product" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Billing" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Integrations" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Earn" })).toBeNull();
    expect(within(nav).getByRole("button", { name: "Back to dashboard" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "New agreement" })).toBeTruthy();
  });
});
