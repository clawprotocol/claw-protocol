import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isLocalBrowserOrigin, normalizeLocalApiBase } from "./clawApi";

function stubLocalPreviewOrigin() {
  vi.stubGlobal("window", {
    location: { origin: "http://127.0.0.1:4173", hostname: "127.0.0.1" },
  });
}

describe("normalizeLocalApiBase", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rewrites 192.168 LAN host to 127.0.0.1 for localhost browser origin", () => {
    stubLocalPreviewOrigin();
    expect(normalizeLocalApiBase("http://192.168.1.23:8000", "test")).toBe("http://127.0.0.1:8000");
    expect(isLocalBrowserOrigin()).toBe(true);
  });

  it("rewrites 0.0.0.0 bind host to 127.0.0.1", () => {
    stubLocalPreviewOrigin();
    expect(normalizeLocalApiBase("http://0.0.0.0:8000", "test")).toBe("http://127.0.0.1:8000");
  });

  it("does not rewrite LAN host when browser origin is not loopback", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://app.example.com", hostname: "app.example.com" },
    });
    expect(normalizeLocalApiBase("http://192.168.1.23:8000", "test")).toBe("http://192.168.1.23:8000");
  });
});

describe("getLawDogApiBase", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses normalized loopback when VITE_API_BASE is LAN and origin is 127.0.0.1", async () => {
    stubLocalPreviewOrigin();
    vi.stubEnv("VITE_API_BASE", "http://192.168.1.23:8000");
    vi.stubEnv("VITE_CLAW_API_BASE", "");
    vi.stubEnv("MODE", "development");
    const { apiUrl, getApiBase, getLawDogApiBase, resolveApiBase } = await import("./clawApi");
    expect(getLawDogApiBase()).toBe("http://127.0.0.1:8000");
    expect(resolveApiBase()).toBe("http://127.0.0.1:8000");
    expect(apiUrl("/health")).toBe("http://127.0.0.1:8000/health");
    expect(apiUrl("/api/agreements/parse")).toBe("http://127.0.0.1:8000/api/agreements/parse");
    expect(apiUrl("/api/agreements/draft")).toBe("http://127.0.0.1:8000/api/agreements/draft");
    expect(apiUrl("/api/agreements/premium-full-draft")).toBe(
      "http://127.0.0.1:8000/api/agreements/premium-full-draft",
    );
    expect(getApiBase()).toBe("http://192.168.1.23:8000");
  });

  it("falls back to loopback for local preview when env API base is unset", async () => {
    stubLocalPreviewOrigin();
    vi.stubEnv("VITE_API_BASE", "");
    vi.stubEnv("VITE_CLAW_API_BASE", "");
    const { getLawDogApiBase } = await import("./clawApi");
    expect(getLawDogApiBase()).toBe("http://127.0.0.1:8000");
  });
});

describe("genesisReferralApi", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    stubLocalPreviewOrigin();
    vi.stubEnv("VITE_API_BASE", "http://192.168.1.23:8000");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ metadata: { org_id: "org1", plan_code: "pro", visitor_id: "v1" } }),
      }),
    );
  });

  it("posts checkout-metadata to normalized loopback base", async () => {
    vi.resetModules();
    const { fetchGenesisCheckoutMetadata } = await import("../launch/genesisReferral/genesisReferralApi");
    await fetchGenesisCheckoutMetadata("org1", { visitor_id: "v1", referral_code: null });
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalled();
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("http://127.0.0.1:8000/v1/genesis-referral/checkout-metadata");
    expect(url).not.toContain("192.168");
  });
});
