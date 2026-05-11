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
});
