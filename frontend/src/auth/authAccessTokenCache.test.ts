import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabaseAuthService", () => ({
  getAuthSession: vi.fn(),
}));

import { getAuthSession } from "./supabaseAuthService";
import {
  clearCachedAccessToken,
  ensureCachedAccessToken,
  getCachedAccessToken,
  refreshCachedAccessToken,
  setCachedAccessToken,
} from "./authAccessTokenCache";

describe("refreshCachedAccessToken", () => {
  afterEach(() => {
    clearCachedAccessToken();
    vi.restoreAllMocks();
  });

  it("does not wipe a good cached token when getAuthSession returns null", async () => {
    setCachedAccessToken("already-hydrated-token");
    vi.mocked(getAuthSession).mockResolvedValue(null);

    await expect(refreshCachedAccessToken()).resolves.toBe("already-hydrated-token");
    expect(getCachedAccessToken()).toBe("already-hydrated-token");
  });

  it("replaces the cache when Supabase returns a fresh access token", async () => {
    setCachedAccessToken("stale-token");
    vi.mocked(getAuthSession).mockResolvedValue({
      access_token: "fresh-access-token",
    } as never);

    await expect(refreshCachedAccessToken()).resolves.toBe("fresh-access-token");
    expect(getCachedAccessToken()).toBe("fresh-access-token");
  });
});

describe("ensureCachedAccessToken", () => {
  afterEach(() => {
    clearCachedAccessToken();
    vi.restoreAllMocks();
  });

  it("retries getAuthSession once when the first cold-start read is empty", async () => {
    clearCachedAccessToken();
    vi.mocked(getAuthSession)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        access_token: "hydrated-on-second-read",
      } as never);

    await expect(ensureCachedAccessToken()).resolves.toBe("hydrated-on-second-read");
    expect(getCachedAccessToken()).toBe("hydrated-on-second-read");
    expect(getAuthSession).toHaveBeenCalledTimes(2);
  });

  it("returns the first hydrated token without a second session read", async () => {
    vi.mocked(getAuthSession).mockResolvedValue({
      access_token: "already-ready-token",
    } as never);

    await expect(ensureCachedAccessToken()).resolves.toBe("already-ready-token");
    expect(getAuthSession).toHaveBeenCalledTimes(1);
  });
});
