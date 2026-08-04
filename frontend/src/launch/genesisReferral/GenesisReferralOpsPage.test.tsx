/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenesisReferralOpsPage } from "./GenesisReferralOpsPage";

const navigate = vi.fn();

vi.mock("../LaunchNavContext", () => ({
  useLaunchNav: () => ({ navigate, pathname: "/app/ops/genesis-referral", search: "" }),
}));

vi.mock("../adminConsoleApi", async () => {
  const actual = await vi.importActual<typeof import("../adminConsoleApi")>("../adminConsoleApi");
  return {
    ...actual,
    readAdminConsoleSecret: vi.fn(() => "test-admin-secret"),
    fetchGenesisReferralOpsSummary: vi.fn(),
    fetchGenesisDogAffiliateCandidates: vi.fn(),
    adminCreateGenesisReferralAffiliate: vi.fn(),
    downloadGenesisReferralCommissionsCsv: vi.fn(async () => undefined),
    fetchAdminUsers: vi.fn(),
  };
});

import {
  MISSING_ADMIN_SECRET_MESSAGE,
  adminCreateGenesisReferralAffiliate,
  downloadGenesisReferralCommissionsCsv,
  fetchAdminUsers,
  fetchGenesisDogAffiliateCandidates,
  fetchGenesisReferralOpsSummary,
  readAdminConsoleSecret,
} from "../adminConsoleApi";

describe("GenesisReferralOpsPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    vi.mocked(readAdminConsoleSecret).mockReturnValue("test-admin-secret");
    vi.mocked(fetchGenesisReferralOpsSummary).mockResolvedValue({
      affiliates: [
        {
          id: "aff-1",
          user_id: "user-dog-1",
          display_name: "First Dog",
          referral_code: "FIRSTDOG",
          community_slug: "genesis-dogs",
          affiliate_status: "active",
          payout_rate: 0.3,
          referral_link_path: "/app/create?ref=FIRSTDOG",
          capture_visits: 4,
          converted_referrals: 2,
          active_referred_subscriptions: 1,
          commission_pending_usd: 11.7,
          commission_payable_usd: 0,
          commission_paid_usd: 23.4,
          commission_total_usd: 35.1,
        },
      ],
      count: 1,
    });
    vi.mocked(fetchAdminUsers).mockResolvedValue({
      users: [
        {
          id: "org:user-dog-1",
          org_id: "org:user-dog-1",
          user_id: "user-dog-1",
          email: "dog1@example.com",
          display_name: "First Dog",
          plan_type: "free",
          agreement_count: 0,
        },
        {
          id: "org:user-lawdogtest2",
          org_id: "org:user-lawdogtest2",
          user_id: "eb72e4d2-c803-490d-80ee-d17634b8ebfb",
          email: "cryptocurated21+lawdogtest2@gmail.com",
          display_name: "LawDog Test 2",
          plan_type: "free",
          agreement_count: 0,
        },
      ],
    });
    vi.mocked(fetchGenesisDogAffiliateCandidates).mockResolvedValue({
      ok: true,
      candidates: [
        {
          user_id: "user-pending-1",
          email: "pending+dog@example.com",
          display_name: "Pending Dog",
          community_slug: "genesis-dogs",
          signup_intent: "genesis-referral",
          affiliate_candidate: true,
        },
      ],
      count: 1,
    });
    vi.mocked(adminCreateGenesisReferralAffiliate).mockResolvedValue({
      ok: true,
      affiliate: {
        id: "aff-2",
        user_id: "user-dog-2",
        display_name: "Second Dog",
        referral_code: "SECONDDOG",
        affiliate_status: "active",
        payout_rate: 0.3,
        converted_referrals: 0,
        commission_pending_usd: 0,
        commission_payable_usd: 0,
        commission_paid_usd: 0,
      },
    });
  });

  it("renders affiliate stats and referral link path", async () => {
    render(<GenesisReferralOpsPage />);
    await waitFor(() => expect(screen.getByTestId("genesis-ops-table")).toBeTruthy());
    expect(screen.getByText("First Dog")).toBeTruthy();
    expect(screen.getByText("user-dog-1")).toBeTruthy();
    expect(screen.getByText("FIRSTDOG")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("$11.70")).toBeTruthy();
    expect(screen.getByText("$35.10")).toBeTruthy();
    expect(screen.getByText(/\/app\/create\?ref=FIRSTDOG/)).toBeTruthy();
  });

  it("looks up user by email and submits create affiliate", async () => {
    render(<GenesisReferralOpsPage />);
    await waitFor(() => expect(fetchGenesisReferralOpsSummary).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId("genesis-ops-lookup"), {
      target: { value: "dog1@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Lookup/i }));

    await waitFor(() => {
      expect(screen.getByTestId("genesis-ops-user-id")).toHaveProperty("value", "user-dog-1");
    });

    fireEvent.change(screen.getByTestId("genesis-ops-referral-code"), {
      target: { value: "SECONDDOG" },
    });
    fireEvent.change(screen.getByTestId("genesis-ops-reason"), {
      target: { value: "gtm genesis affiliate provision" },
    });
    fireEvent.click(screen.getByTestId("genesis-ops-submit"));

    await waitFor(() => {
      expect(adminCreateGenesisReferralAffiliate).toHaveBeenCalledWith({
        user_id: "user-dog-1",
        display_name: "First Dog",
        referral_code: "SECONDDOG",
        community_slug: "genesis-dogs",
        affiliate_status: "active",
        payout_rate: 0.3,
        reason: "gtm genesis affiliate provision",
      });
    });
    await waitFor(() => expect(screen.getByTestId("genesis-ops-ok")).toBeTruthy());
  });

  it("exports commissions CSV from the ops page", async () => {
    render(<GenesisReferralOpsPage />);
    await waitFor(() => expect(fetchGenesisReferralOpsSummary).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Export commissions CSV/i }));
    await waitFor(() => expect(downloadGenesisReferralCommissionsCsv).toHaveBeenCalled());
  });

  it("looks up plus-addressed Gmail without stripping the +tag", async () => {
    render(<GenesisReferralOpsPage />);
    await waitFor(() => expect(fetchGenesisReferralOpsSummary).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId("genesis-ops-lookup"), {
      target: { value: "cryptocurated21+lawdogtest2@gmail.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Lookup/i }));

    await waitFor(() => {
      expect(screen.getByTestId("genesis-ops-user-id")).toHaveProperty(
        "value",
        "eb72e4d2-c803-490d-80ee-d17634b8ebfb",
      );
    });
    expect(fetchAdminUsers).toHaveBeenCalled();
  });

  it("shows a clear missing-secret message instead of raw missing_admin_secret", async () => {
    vi.mocked(readAdminConsoleSecret).mockReturnValue("");
    render(<GenesisReferralOpsPage />);
    await waitFor(() => expect(screen.getByTestId("genesis-ops-missing-secret")).toBeTruthy());
    expect(screen.getByTestId("genesis-ops-missing-secret").textContent).toContain(
      MISSING_ADMIN_SECRET_MESSAGE,
    );
    expect(document.body.textContent).not.toMatch(/\bmissing_admin_secret\b/);
    expect(fetchGenesisReferralOpsSummary).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Open Admin Dashboard/i }));
    expect(navigate).toHaveBeenCalledWith("/app/admin");
  });

  it("lists Genesis Dog candidates and activates without manual user_id copy", async () => {
    render(<GenesisReferralOpsPage />);
    await waitFor(() => expect(fetchGenesisDogAffiliateCandidates).toHaveBeenCalled());
    expect(screen.getByTestId("genesis-ops-candidates").textContent).toMatch(/Pending Dog/);
    expect(screen.getByTestId("genesis-ops-copy-signup-link")).toBeTruthy();
    expect(screen.getByTestId("genesis-ops-signup-link").textContent).toMatch(/\/genesis-dogs$/);

    fireEvent.click(screen.getByTestId("genesis-ops-activate-user-pending-1"));
    await waitFor(() => {
      expect(adminCreateGenesisReferralAffiliate).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-pending-1",
          display_name: "Pending Dog",
          affiliate_status: "active",
          community_slug: "genesis-dogs",
          reason: "gtm genesis dog candidate activate",
        }),
      );
    });
    await waitFor(() => expect(screen.getByTestId("genesis-ops-activated-link")).toBeTruthy());
    expect(screen.getByTestId("genesis-ops-activated-link").textContent).toMatch(/ref=SECONDDOG/);
  });

  it("shows signup-link guidance when plus-email lookup finds no user", async () => {
    render(<GenesisReferralOpsPage />);
    await waitFor(() => expect(fetchGenesisReferralOpsSummary).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId("genesis-ops-lookup"), {
      target: { value: "missing+alias@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Lookup/i }));

    await waitFor(() => expect(screen.getByTestId("genesis-ops-lookup-empty")).toBeTruthy());
    expect(screen.getByTestId("genesis-ops-lookup-empty").textContent).toMatch(
      /Send them the Genesis Dog signup link first/i,
    );
  });
});
