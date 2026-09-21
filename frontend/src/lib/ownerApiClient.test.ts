/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as tokenCache from "../auth/authAccessTokenCache";
import { setOrgId } from "../launch/orgContext";
import { ownerApiFetch } from "./ownerApiClient";

describe("ownerApiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    tokenCache.setCachedAccessToken("");
    localStorage.clear();
  });

  it("adds the validated session and workspace headers to owner reads", async () => {
    setOrgId("user-owner-123");
    tokenCache.setCachedAccessToken("access-token-123");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer access-token-123");
      expect(headers.get("X-Claw-Org-Id")).toBe("user-owner-123");
      expect(headers.get("Accept")).toBe("application/pdf");
      return new Response("ok", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await ownerApiFetch("/v1/documents/doc_123/content", {
      method: "GET",
      headers: { Accept: "application/pdf" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v1/documents/doc_123/content");
  });

  it("hydrates a missing token before issuing a cold-open owner request", async () => {
    setOrgId("user-owner-456");
    tokenCache.setCachedAccessToken("");
    const refresh = vi.spyOn(tokenCache, "refreshCachedAccessToken").mockImplementation(async () => {
      tokenCache.setCachedAccessToken("cold-open-token");
      return "cold-open-token";
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer cold-open-token");
      return new Response("ok", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await ownerApiFetch("/v1/usage/usage_123/receipt");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
