/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminConsolePage } from "./AdminConsolePage";

vi.mock("./LaunchNavContext", () => ({
  useLaunchNav: () => ({ navigate: vi.fn(), pathname: "/app/admin", search: "" }),
}));

vi.mock("./adminConsoleApi", () => ({
  readAdminConsoleSecret: vi.fn(() => ""),
  writeAdminConsoleSecret: vi.fn(),
  fetchAdminOverview: vi.fn(async () => ({ premium_unlock_failures: 0, delivery_failures: 0 })),
  fetchAdminUsers: vi.fn(async () => ({ users: [] })),
  fetchAdminAgreements: vi.fn(async () => ({ agreements: [] })),
  fetchAdminDeliveries: vi.fn(async () => ({ events: [] })),
  fetchAdminAffiliates: vi.fn(async () => ({ affiliates: [] })),
  fetchAdminAudit: vi.fn(async () => ({ actions: [] })),
  fetchAdminAffiliatePayoutBatches: vi.fn(async () => ({ batches: [] })),
  adminRefreshEntitlement: vi.fn(),
  adminSetUserDisabled: vi.fn(),
  adminFlagAgreement: vi.fn(),
  adminResendDelivery: vi.fn(),
  adminSetAffiliateStatus: vi.fn(),
  adminPayoutBatchAction: vi.fn(),
}));

vi.mock("./genesisBetaPaymentBypassAuth", () => ({
  bootstrapQaPaymentBypassAdminSession: vi.fn(async () => true),
}));

import { fetchAdminOverview, writeAdminConsoleSecret } from "./adminConsoleApi";
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
});
