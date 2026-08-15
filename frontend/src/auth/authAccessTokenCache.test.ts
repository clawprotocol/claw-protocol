import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabaseAuthService", () => ({
  getAuthSession: vi.fn(),
}));

import { getAuthSession } from "./supabaseAuthService";
import {
  clearCachedAccessToken,
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
