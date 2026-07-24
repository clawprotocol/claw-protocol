/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AppShell } from "../AppShell";
import { LawdogProductNav } from "../LawdogProductNav";
import { RequireActiveGenesisAffiliate } from "./RequireActiveGenesisAffiliate";
import { clearGenesisAffiliateAccessCache } from "./genesisAffiliateAccess";

const mockNavigate = vi.fn();

vi.mock("../LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/app",
    search: "",
    hash: "",
    navigate: mockNavigate,
  }),
}));

vi.mock("../../access/AccessContext", () => ({
  useAccess: () => ({ tier: "paid" }),
}));

vi.mock("../../config/featureFlags/useFeatureGate", () => ({
  useFeatureGate: () => true,
}));

vi.mock("../../auth/supabaseAuthService", () => ({
  getAuthSession: vi.fn(),
}));

import { getAuthSession } from "../../auth/supabaseAuthService";

function mockSession(token: string | null) {
  vi.mocked(getAuthSession).mockResolvedValue(
    token
      ? ({
          access_token: token,
          user: { id: "user-1" },
        } as never)
      : null,
  );
}

describe("Genesis affiliate access boundary (frontend)", () => {
  beforeEach(() => {
    clearGenesisAffiliateAccessCache();
    mockNavigate.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ detail: { code: "genesis_affiliate_access_denied" } }),
        text: async () => "",
      }),
    );
  });

  afterEach(() => {
    cleanup();
    clearGenesisAffiliateAccessCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("hides Affiliate nav for ordinary authenticated user (API denied)", async () => {
    mockSession("bearer-ordinary");
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, allowed: false, reason: "genesis_affiliate_access_denied" }),
    } as Response);

    render(
      <AppShell title="Dashboard" subtitle="Test">
        <div>child</div>
      </AppShell>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("app-shell-nav-affiliate")).toBeNull();
    });
    expect(screen.queryByRole("button", { name: /^Affiliate$/ })).toBeNull();
  });

  it("shows Affiliate nav for active Genesis Dog", async () => {
    mockSession("bearer-active");
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, allowed: true }),
    } as Response);

    render(
      <AppShell title="Dashboard" subtitle="Test">
        <div>child</div>
      </AppShell>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("app-shell-nav-affiliate")).toBeTruthy();
    });
  });

  it("hides lawdog sidebar Affiliate for paused/revoked (denied access)", async () => {
    mockSession("bearer-paused");
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, allowed: false, reason: "genesis_affiliate_access_denied" }),
    } as Response);

    render(<LawdogProductNav />);
    await waitFor(() => {
      expect(screen.queryByTestId("lawdog-nav-affiliate")).toBeNull();
    });
  });

  it("gates direct route with denied state and redirects non-active users", async () => {
    mockSession("bearer-ordinary");
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, allowed: false, reason: "genesis_affiliate_access_denied" }),
    } as Response);

    render(
      <RequireActiveGenesisAffiliate>
        <div data-testid="sensitive-affiliate-ui">secret commissions</div>
      </RequireActiveGenesisAffiliate>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("sensitive-affiliate-ui")).toBeNull();
      expect(screen.getByTestId("genesis-affiliate-access-denied")).toBeTruthy();
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/app");
    });
  });

  it("allows route content for active Genesis Dog", async () => {
    mockSession("bearer-active");
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, allowed: true }),
    } as Response);

    render(
      <RequireActiveGenesisAffiliate>
        <div data-testid="sensitive-affiliate-ui">secret commissions</div>
      </RequireActiveGenesisAffiliate>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("sensitive-affiliate-ui")).toBeTruthy();
    });
    expect(mockNavigate).not.toHaveBeenCalledWith("/app");
  });
});
