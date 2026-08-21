import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isLocalBrowserOrigin,
  normalizeLocalApiBase,
  isFailedToFetchError,
  getProductionBackendFallbackUrl,
  apiUrlWithFallback,
  shouldRetryWithFallback,
} from "./clawApi";

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

describe("shouldRetryWithFallback", () => {
  it("returns true for 500 response", () => {
    const response = { status: 500 } as Response;
    expect(shouldRetryWithFallback(response)).toBe(true);
  });

  it("returns true for 502 Bad Gateway", () => {
    const response = { status: 502 } as Response;
    expect(shouldRetryWithFallback(response)).toBe(true);
  });

  it("returns true for 503 Service Unavailable", () => {
    const response = { status: 503 } as Response;
    expect(shouldRetryWithFallback(response)).toBe(true);
  });

  it("returns true for 504 Gateway Timeout", () => {
    const response = { status: 504 } as Response;
    expect(shouldRetryWithFallback(response)).toBe(true);
  });

  it("returns false for 200 OK", () => {
    const response = { status: 200 } as Response;
    expect(shouldRetryWithFallback(response)).toBe(false);
  });

  it("returns false for 201 Created", () => {
    const response = { status: 201 } as Response;
    expect(shouldRetryWithFallback(response)).toBe(false);
  });

  it("returns false for 400 Bad Request", () => {
    const response = { status: 400 } as Response;
    expect(shouldRetryWithFallback(response)).toBe(false);
  });

  it("returns false for 401 Unauthorized", () => {
    const response = { status: 401 } as Response;
    expect(shouldRetryWithFallback(response)).toBe(false);
  });

  it("returns false for 403 Forbidden", () => {
    const response = { status: 403 } as Response;
    expect(shouldRetryWithFallback(response)).toBe(false);
  });

  it("returns false for 404 Not Found", () => {
    const response = { status: 404 } as Response;
    expect(shouldRetryWithFallback(response)).toBe(false);
  });
});

describe("isFailedToFetchError", () => {
  it("returns true for 'Failed to fetch' error", () => {
    const err = new Error("Failed to fetch");
    expect(isFailedToFetchError(err)).toBe(true);
  });

  it("returns true for 'Network request failed' error", () => {
    const err = new Error("Network request failed");
    expect(isFailedToFetchError(err)).toBe(true);
  });

  it("returns true for case-insensitive match", () => {
    const err = new Error("FAILED TO FETCH");
    expect(isFailedToFetchError(err)).toBe(true);
  });

  it("returns false for HTTP errors", () => {
    const err = new Error("create_failed_http_403");
    expect(isFailedToFetchError(err)).toBe(false);
  });

  it("returns false for non-Error objects", () => {
    expect(isFailedToFetchError("Failed to fetch")).toBe(false);
    expect(isFailedToFetchError(null)).toBe(false);
    expect(isFailedToFetchError(undefined)).toBe(false);
  });
});

describe("getProductionBackendFallbackUrl", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns fallback URL for lawdog.me in production", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://lawdog.me", hostname: "lawdog.me" },
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "");
    vi.stubEnv("VITE_API_BASE", "");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");

    // Mock runtimeEnvironment to return production
    vi.doMock("../config/runtimeEnvironment", () => ({
      readRuntimeEnvProd: () => true,
      readRuntimeEnvDev: () => false,
      readRuntimeEnvMode: () => "production",
      readRuntimeEnvString: (key: string) => {
        if (key === "VITE_CLAW_API_BASE" || key === "VITE_API_BASE") return "";
        return "";
      },
      readRuntimeEnvironment: () => ({ apiBaseUrl: "", appBaseUrl: "", isDevelopment: false, isTest: false, paymentBypassEnabled: false }),
    }));

    const { getProductionBackendFallbackUrl } = await import("./clawApi");
    expect(getProductionBackendFallbackUrl()).toBe("https://claw-protocol-production.up.railway.app");
  });

  it("returns fallback URL for railway.app origin in production", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://believable-gentleness-production.up.railway.app", hostname: "believable-gentleness-production.up.railway.app" },
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "");
    vi.stubEnv("VITE_API_BASE", "");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");

    vi.doMock("../config/runtimeEnvironment", () => ({
      readRuntimeEnvProd: () => true,
      readRuntimeEnvDev: () => false,
      readRuntimeEnvMode: () => "production",
      readRuntimeEnvString: (key: string) => {
        if (key === "VITE_CLAW_API_BASE" || key === "VITE_API_BASE") return "";
        return "";
      },
      readRuntimeEnvironment: () => ({ apiBaseUrl: "", appBaseUrl: "", isDevelopment: false, isTest: false, paymentBypassEnabled: false }),
    }));

    const { getProductionBackendFallbackUrl } = await import("./clawApi");
    expect(getProductionBackendFallbackUrl()).toBe("https://claw-protocol-production.up.railway.app");
  });

  it("returns null when explicit API base is set", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://lawdog.me", hostname: "lawdog.me" },
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "https://custom-api.example.com");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");

    vi.doMock("../config/runtimeEnvironment", () => ({
      readRuntimeEnvProd: () => true,
      readRuntimeEnvDev: () => false,
      readRuntimeEnvMode: () => "production",
      readRuntimeEnvString: (key: string) => "",
      readRuntimeEnvironment: () => ({ apiBaseUrl: "https://custom-api.example.com", appBaseUrl: "", isDevelopment: false, isTest: false, paymentBypassEnabled: false }),
    }));

    const { getProductionBackendFallbackUrl } = await import("./clawApi");
    expect(getProductionBackendFallbackUrl()).toBeNull();
  });

  it("returns null in development mode", async () => {
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:5173", hostname: "localhost" },
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "");
    vi.stubEnv("MODE", "development");
    vi.stubEnv("NODE_ENV", "development");

    vi.doMock("../config/runtimeEnvironment", () => ({
      readRuntimeEnvProd: () => false,
      readRuntimeEnvDev: () => true,
      readRuntimeEnvMode: () => "development",
      readRuntimeEnvString: (key: string) => "",
      readRuntimeEnvironment: () => ({ apiBaseUrl: "", appBaseUrl: "", isDevelopment: true, isTest: false, paymentBypassEnabled: false }),
    }));

    const { getProductionBackendFallbackUrl } = await import("./clawApi");
    expect(getProductionBackendFallbackUrl()).toBeNull();
  });

  it("returns null for unknown production origins", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://other-app.example.com", hostname: "other-app.example.com" },
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");

    vi.doMock("../config/runtimeEnvironment", () => ({
      readRuntimeEnvProd: () => true,
      readRuntimeEnvDev: () => false,
      readRuntimeEnvMode: () => "production",
      readRuntimeEnvString: (key: string) => "",
      readRuntimeEnvironment: () => ({ apiBaseUrl: "", appBaseUrl: "", isDevelopment: false, isTest: false, paymentBypassEnabled: false }),
    }));

    const { getProductionBackendFallbackUrl } = await import("./clawApi");
    expect(getProductionBackendFallbackUrl()).toBeNull();
  });
});

describe("apiUrlWithFallback", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("builds fallback URL for lawdog.me production", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://lawdog.me", hostname: "lawdog.me" },
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "");
    vi.stubEnv("VITE_API_BASE", "");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");

    vi.doMock("../config/runtimeEnvironment", () => ({
      readRuntimeEnvProd: () => true,
      readRuntimeEnvDev: () => false,
      readRuntimeEnvMode: () => "production",
      readRuntimeEnvString: (key: string) => "",
      readRuntimeEnvironment: () => ({ apiBaseUrl: "", appBaseUrl: "", isDevelopment: false, isTest: false, paymentBypassEnabled: false }),
    }));

    const { apiUrlWithFallback } = await import("./clawApi");
    expect(apiUrlWithFallback("/api/agreements/draft")).toBe(
      "https://claw-protocol-production.up.railway.app/api/agreements/draft"
    );
  });

  it("returns null when no fallback is available", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://other-app.example.com", hostname: "other-app.example.com" },
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");

    vi.doMock("../config/runtimeEnvironment", () => ({
      readRuntimeEnvProd: () => true,
      readRuntimeEnvDev: () => false,
      readRuntimeEnvMode: () => "production",
      readRuntimeEnvString: (key: string) => "",
      readRuntimeEnvironment: () => ({ apiBaseUrl: "", appBaseUrl: "", isDevelopment: false, isTest: false, paymentBypassEnabled: false }),
    }));

    const { apiUrlWithFallback } = await import("./clawApi");
    expect(apiUrlWithFallback("/api/agreements/draft")).toBeNull();
  });
});

describe("fetchWithProxyFallback 5xx retry", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries with fallback URL when same-origin returns 500", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://lawdog.me", hostname: "lawdog.me" },
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");

    vi.doMock("../config/runtimeEnvironment", () => ({
      readRuntimeEnvProd: () => true,
      readRuntimeEnvDev: () => false,
      readRuntimeEnvMode: () => "production",
      readRuntimeEnvString: (key: string) => "",
      readRuntimeEnvironment: () => ({ apiBaseUrl: "", appBaseUrl: "", isDevelopment: false, isTest: false, paymentBypassEnabled: false }),
    }));

    const mockFetch = vi.fn();
    // First call: same-origin proxy returns 500
    mockFetch.mockResolvedValueOnce({ status: 500, ok: false, text: async () => "" } as Response);
    // Second call: direct backend returns success
    mockFetch.mockResolvedValueOnce({ status: 201, ok: true, json: async () => ({ id: "draft-123" }) } as Response);
    vi.stubGlobal("fetch", mockFetch);

    const { fetchWithProxyFallback } = await import("./clawApi");
    const result = await fetchWithProxyFallback(
      "https://lawdog.me/api/agreements/draft",
      { method: "POST", body: JSON.stringify({ text: "test" }) },
      { logContext: "test" }
    );

    expect(result.status).toBe(201);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe("https://lawdog.me/api/agreements/draft");
    expect(mockFetch.mock.calls[1][0]).toBe("https://claw-protocol-production.up.railway.app/api/agreements/draft");
    const fallbackInit = mockFetch.mock.calls[1][1] as RequestInit;
    expect(fallbackInit.mode).toBe("cors");
    expect(fallbackInit.credentials).toBe("omit");
  });

  it("retries with fallback URL when same-origin returns 502", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://lawdog.me", hostname: "lawdog.me" },
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");

    vi.doMock("../config/runtimeEnvironment", () => ({
      readRuntimeEnvProd: () => true,
      readRuntimeEnvDev: () => false,
      readRuntimeEnvMode: () => "production",
      readRuntimeEnvString: (key: string) => "",
      readRuntimeEnvironment: () => ({ apiBaseUrl: "", appBaseUrl: "", isDevelopment: false, isTest: false, paymentBypassEnabled: false }),
    }));

    const mockFetch = vi.fn();
    mockFetch.mockResolvedValueOnce({ status: 502, ok: false } as Response);
    mockFetch.mockResolvedValueOnce({ status: 200, ok: true } as Response);
    vi.stubGlobal("fetch", mockFetch);

    const { fetchWithProxyFallback } = await import("./clawApi");
    const result = await fetchWithProxyFallback("https://lawdog.me/api/test", {});

    expect(result.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 4xx client errors", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://lawdog.me", hostname: "lawdog.me" },
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");

    vi.doMock("../config/runtimeEnvironment", () => ({
      readRuntimeEnvProd: () => true,
      readRuntimeEnvDev: () => false,
      readRuntimeEnvMode: () => "production",
      readRuntimeEnvString: (key: string) => "",
      readRuntimeEnvironment: () => ({ apiBaseUrl: "", appBaseUrl: "", isDevelopment: false, isTest: false, paymentBypassEnabled: false }),
    }));

    const mockFetch = vi.fn();
    mockFetch.mockResolvedValueOnce({ status: 401, ok: false } as Response);
    vi.stubGlobal("fetch", mockFetch);

    const { fetchWithProxyFallback } = await import("./clawApi");
    const result = await fetchWithProxyFallback("https://lawdog.me/api/test", {});

    expect(result.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 2xx success", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://lawdog.me", hostname: "lawdog.me" },
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");

    vi.doMock("../config/runtimeEnvironment", () => ({
      readRuntimeEnvProd: () => true,
      readRuntimeEnvDev: () => false,
      readRuntimeEnvMode: () => "production",
      readRuntimeEnvString: (key: string) => "",
      readRuntimeEnvironment: () => ({ apiBaseUrl: "", appBaseUrl: "", isDevelopment: false, isTest: false, paymentBypassEnabled: false }),
    }));

    const mockFetch = vi.fn();
    mockFetch.mockResolvedValueOnce({ status: 201, ok: true } as Response);
    vi.stubGlobal("fetch", mockFetch);

    const { fetchWithProxyFallback } = await import("./clawApi");
    const result = await fetchWithProxyFallback("https://lawdog.me/api/test", {});

    expect(result.status).toBe(201);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns original 5xx response when fallback URL not available", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://other-app.example.com", hostname: "other-app.example.com" },
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");

    vi.doMock("../config/runtimeEnvironment", () => ({
      readRuntimeEnvProd: () => true,
      readRuntimeEnvDev: () => false,
      readRuntimeEnvMode: () => "production",
      readRuntimeEnvString: (key: string) => "",
      readRuntimeEnvironment: () => ({ apiBaseUrl: "", appBaseUrl: "", isDevelopment: false, isTest: false, paymentBypassEnabled: false }),
    }));

    const mockFetch = vi.fn();
    mockFetch.mockResolvedValueOnce({ status: 500, ok: false } as Response);
    vi.stubGlobal("fetch", mockFetch);

    const { fetchWithProxyFallback } = await import("./clawApi");
    const result = await fetchWithProxyFallback("https://other-app.example.com/api/test", {});

    expect(result.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns original 5xx response when fallback also fails", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://lawdog.me", hostname: "lawdog.me" },
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");

    vi.doMock("../config/runtimeEnvironment", () => ({
      readRuntimeEnvProd: () => true,
      readRuntimeEnvDev: () => false,
      readRuntimeEnvMode: () => "production",
      readRuntimeEnvString: (key: string) => "",
      readRuntimeEnvironment: () => ({ apiBaseUrl: "", appBaseUrl: "", isDevelopment: false, isTest: false, paymentBypassEnabled: false }),
    }));

    const mockFetch = vi.fn();
    const original500 = { status: 500, ok: false } as Response;
    mockFetch.mockResolvedValueOnce(original500);
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", mockFetch);

    const { fetchWithProxyFallback } = await import("./clawApi");
    const result = await fetchWithProxyFallback("https://lawdog.me/api/test", {});

    expect(result.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("still retries on network error (Failed to fetch)", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://lawdog.me", hostname: "lawdog.me" },
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "");
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");

    vi.doMock("../config/runtimeEnvironment", () => ({
      readRuntimeEnvProd: () => true,
      readRuntimeEnvDev: () => false,
      readRuntimeEnvMode: () => "production",
      readRuntimeEnvString: (key: string) => "",
      readRuntimeEnvironment: () => ({ apiBaseUrl: "", appBaseUrl: "", isDevelopment: false, isTest: false, paymentBypassEnabled: false }),
    }));

    const mockFetch = vi.fn();
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    mockFetch.mockResolvedValueOnce({ status: 201, ok: true } as Response);
    vi.stubGlobal("fetch", mockFetch);

    const { fetchWithProxyFallback } = await import("./clawApi");
    const result = await fetchWithProxyFallback("https://lawdog.me/api/test", {});

    expect(result.status).toBe(201);
    expect(mockFetch).toHaveBeenCalledTimes(2);
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
    vi.doMock("../auth/supabaseAuthService", () => ({
      getAuthSession: vi.fn().mockResolvedValue({ access_token: "tok", user: { id: "u1" } }),
    }));
    const { fetchGenesisCheckoutMetadata } = await import("../launch/genesisReferral/genesisReferralApi");
    await fetchGenesisCheckoutMetadata("org1", { visitor_id: "v1", referral_code: null });
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalled();
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("http://127.0.0.1:8000/v1/genesis-referral/checkout-metadata");
    expect(url).not.toContain("192.168");
    const headers = (fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
  });
});
