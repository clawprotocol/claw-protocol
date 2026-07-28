import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOperatorConsoleCapability } from "./operatorConsoleCapability";

vi.mock("../agreement/agreementOrgHeaders", () => ({
  clawAgreementHeaders: () => ({ Authorization: "Bearer test-token" }),
}));

vi.mock("../lib/clawApi", () => ({
  resolveApiBase: () => "https://api.example.test",
}));

describe("fetchOperatorConsoleCapability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("authorizes active support_operator from backend response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          authorized: true,
          role: "support_operator",
          user_id: "op-1",
        }),
      })),
    );
    const cap = await fetchOperatorConsoleCapability();
    expect(cap.authorized).toBe(true);
    expect(cap.role).toBe("support_operator");
    expect(cap.userId).toBe("op-1");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/v1/admin/operators/me",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("denies when backend reports unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, authorized: false, role: null }),
      })),
    );
    const cap = await fetchOperatorConsoleCapability();
    expect(cap.authorized).toBe(false);
    expect(cap.role).toBeNull();
  });
});
