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
    users: [{ id: "user-cryptocurated21", email: "cryptocurated21@example.com", plan_type: "free" }],
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
    const grant = screen.getByRole("button", { name: /grant genesis dog/i });
    expect((grant as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/audit reason/i), {
      target: { value: "staging acceptance grant for cryptocurated21" },
    });
    expect((grant as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(grant);
    await waitFor(() => {
      expect(adminGrantGenesisEntitlement).toHaveBeenCalledWith(
        "user-cryptocurated21",
        "staging acceptance grant for cryptocurated21",
      );
    });
  });
});
