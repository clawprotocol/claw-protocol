import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapQaPaymentBypassAdminSession,
  refreshGenesisBetaPaymentBypassAuth,
} from "./genesisBetaPaymentBypassAuth";
import {
  isPublicProductionHostname,
  isQaCreateFlowPaymentBypassEnabled,
  isRecognizedQaPaymentBypassOrigin,
  resolveQaPaymentBypassState,
} from "./devPaymentBypass";

describe("refreshGenesisBetaPaymentBypassAuth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("authorizes only from server response with credentials included", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authorized: true, reason: "qa_allowlist" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(refreshGenesisBetaPaymentBypassAuth("user-qa-1")).resolves.toMatchObject({
      authorized: true,
      reason: "qa_allowlist",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/workspace/qa-payment-bypass/authorization"),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        headers: { "X-Claw-User-Id": "user-qa-1" },
      }),
    );
  });

  it("fails closed when auth endpoint is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(refreshGenesisBetaPaymentBypassAuth()).resolves.toMatchObject({
      authorized: false,
      reason: "auth_endpoint_unreachable",
    });
  });

  it("fails closed on malformed response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ eligible: true }),
      }),
    );
    await expect(refreshGenesisBetaPaymentBypassAuth()).resolves.toMatchObject({
      authorized: false,
      reason: "auth_malformed_response",
    });
  });

  it("fails closed on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      }),
    );
    await expect(refreshGenesisBetaPaymentBypassAuth()).resolves.toMatchObject({
      authorized: false,
      reason: "auth_endpoint_error",
    });
  });
});

describe("bootstrapQaPaymentBypassAdminSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts admin secret once with credentials include and no storage writes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await expect(bootstrapQaPaymentBypassAdminSession("ops-secret")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/workspace/qa-payment-bypass/session"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ admin_secret: "ops-secret" }),
      }),
    );
  });
});

describe("resolveQaPaymentBypassState production gates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("denies lawdog.me visitors with only the QA env flag", () => {
    vi.stubGlobal("window", { location: { origin: "https://lawdog.me" } });
    expect(
      resolveQaPaymentBypassState(
        {
          PROD: true,
          DEV: false,
          MODE: "production",
          VITE_LAWDOG_QA_PAYMENT_BYPASS: "1",
        },
        {
          authorized: false,
          reason: "not_authorized",
          checkedAt: "2026-01-01T00:00:00Z",
        },
      ),
    ).toMatchObject({
      enabled: false,
      reason: "not_authorized",
      gates: { envFlag: true, originOrDeployment: false, betaAuth: false },
    });
  });

  it("denies lawdog.me when env flag alone is set and server auth is pending", () => {
    vi.stubGlobal("window", { location: { origin: "https://lawdog.me" } });
    expect(
      resolveQaPaymentBypassState({
        PROD: true,
        DEV: false,
        VITE_LAWDOG_QA_PAYMENT_BYPASS: "1",
      }),
    ).toMatchObject({
      enabled: false,
      reason: "qa_auth_pending",
    });
  });

  it("enables lawdog.me when env flag and server authorization pass", () => {
    vi.stubGlobal("window", { location: { origin: "https://lawdog.me" } });
    expect(
      resolveQaPaymentBypassState(
        {
          PROD: true,
          DEV: false,
          MODE: "production",
          VITE_LAWDOG_QA_PAYMENT_BYPASS: "1",
        },
        {
          authorized: true,
          reason: "admin_session",
          checkedAt: "2026-01-01T00:00:00Z",
        },
      ),
    ).toMatchObject({
      enabled: true,
      reason: "qa_server_admin_session",
    });
  });

  it("denies genesis affiliate authorization alone on lawdog.me", () => {
    vi.stubGlobal("window", { location: { origin: "https://lawdog.me" } });
    expect(
      resolveQaPaymentBypassState(
        {
          PROD: true,
          DEV: false,
          VITE_LAWDOG_QA_PAYMENT_BYPASS: "1",
        },
        {
          authorized: false,
          reason: "not_authorized",
          checkedAt: "2026-01-01T00:00:00Z",
        },
      ),
    ).toMatchObject({
      enabled: false,
      reason: "not_authorized",
    });
  });

  it("still enables Railway preview origins with env flag only", () => {
    vi.stubGlobal("window", { location: { origin: "https://claw-bot-pr-77.up.railway.app" } });
    expect(
      resolveQaPaymentBypassState({
        PROD: true,
        DEV: false,
        VITE_LAWDOG_QA_PAYMENT_BYPASS: "1",
      }),
    ).toMatchObject({
      enabled: true,
      reason: "recognized_qa_origin",
    });
  });
});

describe("public production hostname classification", () => {
  it("treats lawdog.me as public production but staging hosts as QA", () => {
    expect(isPublicProductionHostname("lawdog.me")).toBe(true);
    expect(isPublicProductionHostname("www.lawdog.me")).toBe(true);
    expect(isRecognizedQaPaymentBypassOrigin("https://lawdog.me")).toBe(false);
    expect(isRecognizedQaPaymentBypassOrigin("https://staging.lawdog.ai")).toBe(true);
  });
});

describe("isQaCreateFlowPaymentBypassEnabled", () => {
  it("delegates to resolveQaPaymentBypassState", () => {
    vi.stubGlobal("window", { location: { origin: "https://staging.lawdog.ai" } });
    expect(
      isQaCreateFlowPaymentBypassEnabled({
        PROD: true,
        DEV: false,
        VITE_LAWDOG_QA_PAYMENT_BYPASS: "1",
      }),
    ).toBe(true);
    vi.unstubAllGlobals();
  });
});
