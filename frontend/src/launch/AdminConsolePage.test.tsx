/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminConsolePage } from "./AdminConsolePage";

vi.mock("./LaunchNavContext", () => ({
  useLaunchNav: () => ({ navigate: vi.fn(), pathname: "/app/admin", search: "" }),
}));

vi.mock("./useOperatorConsoleCapability", () => ({
  useOperatorConsoleCapability: () => ({
    ready: true,
    capability: { authorized: true, role: "support_operator", userId: "op-1" },
  }),
}));

vi.mock("./genesisReferral/genesisAffiliateAccess", () => ({
  useActiveGenesisAffiliateAccess: () => ({ allowed: false }),
}));

vi.mock("../config/featureFlags/useFeatureGate", () => ({
  useFeatureGate: () => false,
}));

vi.mock("../access/AccessContext", () => ({
  useAccess: () => ({ tier: "paid" }),
}));

vi.mock("./adminConsoleApi", () => ({
  readAdminConsoleSecret: vi.fn(() => ""),
  writeAdminConsoleSecret: vi.fn(),
  fetchAdminOverview: vi.fn(async () => ({ premium_unlock_failures: 0, delivery_failures: 0 })),
  fetchAdminUsers: vi.fn(async () => ({
    users: [
      {
        id: "org:user-cryptocurated21",
        org_id: "org:user-cryptocurated21",
        user_id: "cryptocurated21",
        email: "cryptocurated21@example.com",
        display_name: "Crypto Curated",
        plan_type: "free",
        agreement_count: 1,
      },
      {
        id: "org:user-other-9",
        org_id: "org:user-other-9",
        user_id: "other-9",
        email: "other@example.com",
        display_name: "Other User",
        plan_type: "free",
      },
    ],
  })),
  fetchAdminAgreements: vi.fn(async () => ({ agreements: [] })),
  fetchAdminDeliveries: vi.fn(async () => ({ events: [] })),
  fetchAdminAffiliates: vi.fn(async () => ({ affiliates: [] })),
  fetchAdminAudit: vi.fn(async () => ({ actions: [] })),
  fetchAdminAffiliatePayoutBatches: vi.fn(async () => ({ batches: [] })),
  adminRefreshEntitlement: vi.fn(),
  adminGrantGenesisEntitlement: vi.fn(async () => ({ ok: true })),
  adminRevokeGenesisEntitlement: vi.fn(async () => ({ ok: true })),
  adminSetUserDisabled: vi.fn(),
  adminFlagAgreement: vi.fn(),
  adminResendDelivery: vi.fn(),
  adminSetAffiliateStatus: vi.fn(),
  adminPayoutBatchAction: vi.fn(),
}));

vi.mock("./genesisBetaPaymentBypassAuth", () => ({
  bootstrapQaPaymentBypassAdminSession: vi.fn(async () => true),
}));

import {
  adminGrantGenesisEntitlement,
  fetchAdminOverview,
  writeAdminConsoleSecret,
} from "./adminConsoleApi";
import { bootstrapQaPaymentBypassAdminSession } from "./genesisBetaPaymentBypassAuth";

describe("AdminConsolePage connected state", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads admin overview when initialAdminSecret is provided", async () => {
    render(<AdminConsolePage initialAdminSecret="ops-secret" />);
    await waitFor(() => {
      expect(fetchAdminOverview).toHaveBeenCalled();
    });
    expect(writeAdminConsoleSecret).toHaveBeenCalledWith("ops-secret");
    expect(bootstrapQaPaymentBypassAdminSession).toHaveBeenCalledWith("ops-secret");
  });

  it("connect reads autofilled input and bootstraps admin session", async () => {
    const { getByRole } = render(<AdminConsolePage />);
    const input = document.querySelector('input[placeholder="x-claw-admin-secret"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    // Simulate password-manager autofill: DOM value set without React onChange.
    input.value = "ops-secret";
    fireEvent.click(getByRole("button", { name: "Connect" }));
    await waitFor(() => {
      expect(bootstrapQaPaymentBypassAdminSession).toHaveBeenCalledWith("ops-secret");
      expect(writeAdminConsoleSecret).toHaveBeenCalledWith("ops-secret");
      expect(fetchAdminOverview).toHaveBeenCalled();
    });
  });

  it("requires a visible audit reason before Grant Genesis Dog and passes it to the API", async () => {
    render(<AdminConsolePage initialAdminSecret="ops-secret" />);
    await waitFor(() => {
      expect(fetchAdminOverview).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("button", { name: /^Users$/ }));
    expect(screen.getByTestId("admin-users-search")).toBeTruthy();
    const firstCard = screen.getAllByTestId("admin-user-card")[0];
    expect(firstCard.textContent).toContain("cryptocurated21@example.com");
    expect(firstCard.textContent).toContain("cryptocurated21");
    expect(firstCard.textContent).toContain("org:user-cryptocurated21");

    const grant = screen.getAllByRole("button", { name: /grant genesis dog/i })[0];
    expect((grant as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/audit reason/i), {
      target: { value: "staging acceptance grant for cryptocurated21" },
    });
    expect((grant as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(grant);
    await waitFor(() => {
      expect(adminGrantGenesisEntitlement).toHaveBeenCalledWith(
        "cryptocurated21",
        "staging acceptance grant for cryptocurated21",
      );
    });
  });

  it("filters users by exact email without exposing agreement bodies", async () => {
    render(<AdminConsolePage initialAdminSecret="ops-secret" />);
    await waitFor(() => {
      expect(fetchAdminOverview).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("button", { name: /^Users$/ }));
    expect(screen.getAllByTestId("admin-user-card")).toHaveLength(2);
    // Exact address match (includes Gmail plus-aliases); partial local-part still works without @.
    fireEvent.change(screen.getByLabelText(/find user/i), {
      target: { value: "cryptocurated21" },
    });
    expect(screen.getAllByTestId("admin-user-card")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(/find user/i), {
      target: { value: "cryptocurated21@example.com" },
    });
    expect(screen.getAllByTestId("admin-user-card")).toHaveLength(1);
    expect(screen.getByTestId("admin-user-primary-label").textContent).toContain(
      "cryptocurated21@example.com",
    );
    expect(document.body.textContent).not.toMatch(/payment_terms|"purpose"|private text not for admin/i);
  });
});
