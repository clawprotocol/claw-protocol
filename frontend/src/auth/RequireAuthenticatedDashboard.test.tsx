/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RequireAuthenticatedDashboard } from "./RequireAuthenticatedDashboard";

vi.mock("./AuthProvider", () => ({
  useAuth: () => ({ enabled: true, loading: false, user: null }),
}));

vi.mock("../launch/LaunchNavContext", () => ({
  useLaunchNav: () => ({ pathname: "/app", navigate: vi.fn() }),
}));

vi.mock("../account/currentUser", async () => {
  const actual = await vi.importActual<typeof import("../account/currentUser")>("../account/currentUser");
  return {
    ...actual,
    resolveCurrentUser: () => ({
      id: "anonymous",
      displayName: "Guest",
      email: null,
      isAuthenticated: false,
      source: "anonymous" as const,
    }),
  };
});

describe("RequireAuthenticatedDashboard", () => {
  it("blocks anonymous /app access", () => {
    render(
      <RequireAuthenticatedDashboard>
        <div data-testid="secret-dashboard">secret</div>
      </RequireAuthenticatedDashboard>,
    );
    expect(screen.getByTestId("auth-dashboard-required")).toBeTruthy();
    expect(screen.queryByTestId("secret-dashboard")).toBeNull();
  });
});
