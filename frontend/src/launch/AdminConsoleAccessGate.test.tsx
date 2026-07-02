/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminConsoleAccessGate } from "./AdminConsoleAccessGate";

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("./LaunchNavContext", () => ({
  useLaunchNav: () => ({ navigate: vi.fn(), pathname: "/app/admin", search: "" }),
}));

vi.mock("./AdminConsolePage", () => ({
  AdminConsolePage: () => <div data-testid="admin-console-page">Admin Console</div>,
}));

vi.mock("./genesisBetaPaymentBypassAuth", () => ({
  refreshGenesisBetaPaymentBypassAuth: vi.fn(),
  bootstrapQaPaymentBypassAdminSession: vi.fn(),
}));

vi.mock("./adminConsoleApi", () => ({
  writeAdminConsoleSecret: vi.fn(),
}));

import {
  bootstrapQaPaymentBypassAdminSession,
  refreshGenesisBetaPaymentBypassAuth,
} from "./genesisBetaPaymentBypassAuth";
import { writeAdminConsoleSecret } from "./adminConsoleApi";

describe("AdminConsoleAccessGate", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(refreshGenesisBetaPaymentBypassAuth).mockReset();
    vi.mocked(bootstrapQaPaymentBypassAdminSession).mockReset();
  });

  it("renders admin console when server authorization passes", async () => {
    vi.mocked(refreshGenesisBetaPaymentBypassAuth).mockResolvedValue({
      authorized: true,
      reason: "admin_session",
      checkedAt: "2026-01-01T00:00:00Z",
    });
    render(<AdminConsoleAccessGate />);
    await waitFor(() => {
      expect(screen.getByTestId("admin-console-page")).toBeTruthy();
    });
    expect(refreshGenesisBetaPaymentBypassAuth).toHaveBeenCalledWith(undefined);
  });

  it("shows bootstrap form without admin tools when authorization is missing", async () => {
    vi.mocked(refreshGenesisBetaPaymentBypassAuth).mockResolvedValue({
      authorized: false,
      reason: "not_authorized",
      checkedAt: "2026-01-01T00:00:00Z",
    });
    render(<AdminConsoleAccessGate />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("x-claw-admin-secret")).toBeTruthy();
    });
    expect(screen.queryByTestId("admin-console-page")).toBeNull();
    expect(screen.getByText(/Admin tools stay hidden until bootstrap succeeds/i)).toBeTruthy();
  });

  it("loads admin console after successful bootstrap", async () => {
    vi.mocked(refreshGenesisBetaPaymentBypassAuth)
      .mockResolvedValueOnce({
        authorized: false,
        reason: "not_authorized",
        checkedAt: "2026-01-01T00:00:00Z",
      })
      .mockResolvedValueOnce({
        authorized: true,
        reason: "admin_session",
        checkedAt: "2026-01-01T00:00:00Z",
      });
    vi.mocked(bootstrapQaPaymentBypassAdminSession).mockResolvedValue(true);

    render(<AdminConsoleAccessGate />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("x-claw-admin-secret")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("x-claw-admin-secret"), {
      target: { value: "ops-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("admin-console-page")).toBeTruthy();
    });
    expect(bootstrapQaPaymentBypassAdminSession).toHaveBeenCalledWith("ops-secret");
    expect(writeAdminConsoleSecret).toHaveBeenCalledWith("ops-secret");
    expect(refreshGenesisBetaPaymentBypassAuth).toHaveBeenLastCalledWith(undefined);
  });

  it("stays on bootstrap form when secret is invalid", async () => {
    vi.mocked(refreshGenesisBetaPaymentBypassAuth).mockResolvedValue({
      authorized: false,
      reason: "not_authorized",
      checkedAt: "2026-01-01T00:00:00Z",
    });
    vi.mocked(bootstrapQaPaymentBypassAdminSession).mockResolvedValue(false);

    render(<AdminConsoleAccessGate />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("x-claw-admin-secret")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("x-claw-admin-secret"), {
      target: { value: "wrong-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid admin secret/i)).toBeTruthy();
    });
    expect(screen.queryByTestId("admin-console-page")).toBeNull();
  });
});
