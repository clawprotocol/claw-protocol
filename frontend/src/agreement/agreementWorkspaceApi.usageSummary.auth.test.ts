import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/authAccessTokenCache", async () => {
  const actual = await vi.importActual<typeof import("../auth/authAccessTokenCache")>(
    "../auth/authAccessTokenCache",
  );
  return {
    ...actual,
    refreshCachedAccessToken: vi.fn(async () => {
      actual.setCachedAccessToken("hydrated-access-token");
      return "hydrated-access-token";
    }),
  };
});

vi.mock("../launch/orgContext", () => ({
  getOrgId: vi.fn(() => "user-buyer-1"),
}));

import { refreshCachedAccessToken } from "../auth/authAccessTokenCache";
import { getOrgId } from "../launch/orgContext";
import { fetchAgreementUsageSummary } from "./agreementWorkspaceApi";

describe("fetchAgreementUsageSummary auth", () => {
  beforeEach(() => {
    vi.mocked(getOrgId).mockReturnValue("user-buyer-1");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refreshes the access token before probing a user workspace", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ commercial: { state: "pro" } }),
    } as Response);

    const result = await fetchAgreementUsageSummary();

    expect(refreshCachedAccessToken).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer hydrated-access-token");
  });

  it("sends the refreshed token even when the sync header cache is empty", async () => {
    vi.mocked(refreshCachedAccessToken).mockResolvedValueOnce("refreshed-but-uncached");
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ commercial: { state: "pro" } }),
    } as Response);

    await fetchAgreementUsageSummary();

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer refreshed-but-uncached");
  });
});
