/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../agreement/agreementOrgHeaders", () => ({
  clawAgreementHeaders: (extra?: Record<string, string>) => ({
    "X-Claw-Org-Id": "user-op",
    Authorization: "Bearer test-token",
    ...(extra || {}),
  }),
}));

vi.mock("../lib/clawApi", () => ({
  resolveApiBase: () => "https://api.example.test",
}));

import {
  ADMIN_CONSOLE_CONNECT_REASON,
  adminGrantGenesisEntitlement,
  adminRevokeGenesisEntitlement,
  fetchAdminOverview,
  formatAdminApiErrorDetail,
  writeAdminConsoleSecret,
} from "./adminConsoleApi";

describe("adminConsoleApi", () => {
  beforeEach(() => {
    writeAdminConsoleSecret("staging-admin-secret");
  });

  afterEach(() => {
    writeAdminConsoleSecret("");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/v1/admin/overview",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({
          "x-claw-admin-secret": "staging-admin-secret",
          "x-claw-admin-reason": ADMIN_CONSOLE_CONNECT_REASON,
        }),
      }),
    );
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
  });

  it("surfaces object detail code/message on failed privileged calls", async () => {
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
      "operator_role_required: Authenticated principal is not an active operator.",
    );
  });
});
