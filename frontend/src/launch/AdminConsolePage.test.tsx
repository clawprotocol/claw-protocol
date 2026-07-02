/** @vitest-environment jsdom */
import { cleanup, render, waitFor } from "@testing-library/react";
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
  });
});
