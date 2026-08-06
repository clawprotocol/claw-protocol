/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../agreement/agreementOrgHeaders", () => ({
  clawAgreementHeaders: (extra?: Record<string, string>) => ({
    "X-Claw-Org-Id": "anon-org",
    ...(extra || {}),
  }),
}));

vi.mock("../lib/clawApi", () => ({
  resolveApiBase: () => "https://api.example.test",
}));

vi.mock("../auth/authAccessTokenCache", () => ({
  refreshCachedAccessToken: vi.fn(async () => "hydrated-access-token"),
}));

import { refreshCachedAccessToken } from "../auth/authAccessTokenCache";
import {
  ADMIN_CONSOLE_CONNECT_REASON,
  ADMIN_SECRET_REJECTED_MESSAGE,
  MISSING_ADMIN_SECRET_MESSAGE,
  adminGrantGenesisEntitlement,
  adminResetGenesisMonthlyUsage,
  adminRevokeGenesisEntitlement,
  clearAdminConsoleSecret,
  fetchAdminOverview,
  formatAdminApiErrorDetail,
  mapAdminApiHttpError,
  readAdminConsoleSecret,
  writeAdminConsoleSecret,
} from "./adminConsoleApi";

describe("adminConsoleApi", () => {
  beforeEach(() => {
    writeAdminConsoleSecret("staging-admin-secret");
    localStorage.removeItem("claw_admin_console_secret_v1");
  });

  afterEach(() => {
    clearAdminConsoleSecret();
    vi.mocked(refreshCachedAccessToken).mockResolvedValue("hydrated-access-token");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("persists admin secret to sessionStorage only (not localStorage)", () => {
    writeAdminConsoleSecret("shared-ops-secret");
    expect(sessionStorage.getItem("claw_admin_console_secret_v1")).toBe("shared-ops-secret");
    expect(localStorage.getItem("claw_admin_console_secret_v1")).toBeNull();
    expect(readAdminConsoleSecret()).toBe("shared-ops-secret");
  });

  it("clearAdminConsoleSecret removes session key and stale localStorage key", () => {
    writeAdminConsoleSecret("shared-ops-secret");
    localStorage.setItem("claw_admin_console_secret_v1", "stale-from-old-build");
    clearAdminConsoleSecret();
    expect(sessionStorage.getItem("claw_admin_console_secret_v1")).toBeNull();
    expect(localStorage.getItem("claw_admin_console_secret_v1")).toBeNull();
    expect(readAdminConsoleSecret()).toBe("");
  });

  it("throws a clear message when admin secret is missing", async () => {
    writeAdminConsoleSecret("");
    await expect(fetchAdminOverview()).rejects.toThrow(MISSING_ADMIN_SECRET_MESSAGE);
  });

  it("formats object FastAPI detail instead of [object Object]", () => {
    expect(
      formatAdminApiErrorDetail(
        { code: "reason_required", message: "A non-empty reason (min 3 characters) is required for this action." },
        400,
      ),
    ).toBe("reason_required: A non-empty reason (min 3 characters) is required for this action.");
    expect(formatAdminApiErrorDetail({ code: "forbidden", message: "Invalid operator secret." }, 403)).toBe(
      "forbidden: Invalid operator secret.",
    );
    expect(formatAdminApiErrorDetail("plain", 500)).toBe("plain");
  });

  it("sends admin_console_connect reason on Connect overview reads", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ active_users: 1 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchAdminOverview();

    expect(refreshCachedAccessToken).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/v1/admin/overview",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({
          "x-claw-admin-secret": "staging-admin-secret",
          "x-claw-admin-reason": ADMIN_CONSOLE_CONNECT_REASON,
          Authorization: "Bearer hydrated-access-token",
        }),
      }),
    );
  });

  it("rehydrates JWT after refresh-equivalent reconnect and still sends session secret", async () => {
    writeAdminConsoleSecret("session-secret-after-refresh");
    vi.mocked(refreshCachedAccessToken).mockResolvedValueOnce("token-after-refresh");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ active_users: 2 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchAdminOverview();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/v1/admin/overview",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-claw-admin-secret": "session-secret-after-refresh",
          Authorization: "Bearer token-after-refresh",
        }),
      }),
    );
  });

  it("maps forbidden invalid secret 403 to a clear reconnect message", () => {
    expect(
      mapAdminApiHttpError({ code: "forbidden", message: "Invalid operator secret." }, 403),
    ).toBe(ADMIN_SECRET_REJECTED_MESSAGE);
  });

  it("sends operator audit reason in header and body for Genesis grant/revoke", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ ok: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const reason = "staging acceptance grant for cryptocurated21";

    await adminGrantGenesisEntitlement("user-cryptocurated21", reason);
    await adminRevokeGenesisEntitlement("user-cryptocurated21", reason);
    await adminResetGenesisMonthlyUsage("user-cryptocurated21", reason);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.example.test/v1/admin/users/user-cryptocurated21/genesis-entitlement/grant",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-claw-admin-reason": reason }),
        body: JSON.stringify({
          reason,
          expires_at: null,
          allowance_override: null,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.example.test/v1/admin/users/user-cryptocurated21/genesis-entitlement/revoke",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-claw-admin-reason": reason }),
        body: JSON.stringify({ reason }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.example.test/v1/admin/users/user-cryptocurated21/genesis-usage/reconcile",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-claw-admin-reason": reason }),
        body: JSON.stringify({
          reason,
          mode: "reset_month_to_zero",
          dry_run: false,
        }),
      }),
    );
  });

  it("surfaces a clear operator-role message on failed privileged calls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        text: async () =>
          JSON.stringify({
            detail: { code: "operator_role_required", message: "Authenticated principal is not an active operator." },
          }),
      })),
    );

    await expect(fetchAdminOverview()).rejects.toThrow(
      "Your account is not an active operator. Operator role is required for Admin Dashboard.",
    );
  });

  it("surfaces admin secret rejected on forbidden invalid secret responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        text: async () =>
          JSON.stringify({
            detail: { code: "forbidden", message: "Invalid operator secret." },
          }),
      })),
    );

    await expect(fetchAdminOverview()).rejects.toThrow(ADMIN_SECRET_REJECTED_MESSAGE);
  });
});
