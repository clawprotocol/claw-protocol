/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RequireAuthenticatedDashboard } from "./RequireAuthenticatedDashboard";
import {
  CHECKOUT_SIGN_IN_BODY,
  CHECKOUT_SIGN_IN_CTA,
  CHECKOUT_SIGN_IN_HEADING,
} from "./safeRedirectResolver";

const navState = {
  pathname: "/app",
  search: "",
  navigate: vi.fn(),
};

const mockState = { homeAnonymousStarterAuthority: false };
const mockConsumeAuthority = vi.fn();

vi.mock("./AuthProvider", () => ({
  useAuth: () => ({ enabled: true, loading: false, user: null }),
}));

vi.mock("../launch/LaunchNavContext", () => ({
  useLaunchNav: () => navState,
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

vi.mock("../launch/homeAnonymousCreateOrigin", () => ({
  isHomeAnonymousStarterAuthorityActive: () => mockState.homeAnonymousStarterAuthority,
  consumeHomeAnonymousCreateAuthority: () => mockConsumeAuthority(),
}));

describe("RequireAuthenticatedDashboard", () => {
  beforeEach(() => {
    mockState.homeAnonymousStarterAuthority = false;
    mockConsumeAuthority.mockClear();
    cleanup();
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("blocks anonymous /app access", () => {
    navState.pathname = "/app";
    navState.search = "";
    navState.navigate = vi.fn();
    render(
      <RequireAuthenticatedDashboard>
        <div data-testid="secret-dashboard">secret</div>
      </RequireAuthenticatedDashboard>,
    );
    expect(screen.getByTestId("auth-dashboard-required")).toBeTruthy();
    expect(screen.queryByTestId("secret-dashboard")).toBeNull();
  });

  it("blocks anonymous /app/create access (direct URL without homepage handoff)", () => {
    navState.pathname = "/app/create";
    navState.search = "";
    navState.navigate = vi.fn();
    mockState.homeAnonymousStarterAuthority = false;
    render(
      <RequireAuthenticatedDashboard>
        <div data-testid="create-intake">intake</div>
      </RequireAuthenticatedDashboard>,
    );
    expect(screen.getByTestId("auth-dashboard-required")).toBeTruthy();
    expect(screen.queryByTestId("create-intake")).toBeNull();
  });

  it("allows anonymous /app/create access when homepage handoff marker is active and consumes authority", () => {
    navState.pathname = "/app/create";
    navState.search = "";
    navState.navigate = vi.fn();
    mockState.homeAnonymousStarterAuthority = true;
    render(
      <RequireAuthenticatedDashboard>
        <div data-testid="create-intake">intake</div>
      </RequireAuthenticatedDashboard>,
    );
    expect(screen.queryByTestId("auth-dashboard-required")).toBeNull();
    expect(screen.getByTestId("create-intake")).toBeTruthy();
    expect(mockConsumeAuthority).toHaveBeenCalledTimes(1);
  });

  it("does not consume authority when blocked (no handoff)", () => {
    navState.pathname = "/app/create";
    navState.search = "";
    navState.navigate = vi.fn();
    mockState.homeAnonymousStarterAuthority = false;
    render(
      <RequireAuthenticatedDashboard>
        <div data-testid="create-intake">intake</div>
      </RequireAuthenticatedDashboard>,
    );
    expect(screen.getByTestId("auth-dashboard-required")).toBeTruthy();
    expect(mockConsumeAuthority).not.toHaveBeenCalled();
  });

  it("preserves the complete signed-out checkout destination through sign-in", () => {
    navState.pathname = "/app/checkout/__claw_create_checkout__";
    navState.search = "?tier=pro&cadence=monthly&returnTo=%2Fapp%2Fcreate%3Frestore%3DstarterReview";
    navState.navigate = vi.fn();
    render(
      <RequireAuthenticatedDashboard>
        <div data-testid="secret-checkout">secret</div>
      </RequireAuthenticatedDashboard>,
    );
    expect(screen.getByRole("heading", { name: CHECKOUT_SIGN_IN_HEADING })).toBeTruthy();
    expect(screen.getByText(CHECKOUT_SIGN_IN_BODY)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: CHECKOUT_SIGN_IN_CTA }));
    expect(navState.navigate).toHaveBeenCalledWith(
      "/app/sign-in?next=%2Fapp%2Fcheckout%2F__claw_create_checkout__%3Ftier%3Dpro%26cadence%3Dmonthly%26returnTo%3D%252Fapp%252Fcreate%253Frestore%253DstarterReview",
    );
    expect(screen.queryByTestId("secret-checkout")).toBeNull();
  });
});
