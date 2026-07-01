import { describe, expect, it, vi } from "vitest";
import {
  isDevCreateFlowPaymentBypassEnabled,
  isQaCreateFlowPaymentBypassEnabled,
  isRecognizedQaPaymentBypassOrigin,
  logDevPaymentBypassState,
  logQaPaymentBypassState,
  resolveDevPaymentBypassState,
  resolveQaPaymentBypassState,
} from "./devPaymentBypass";

describe("resolveDevPaymentBypassState", () => {
  it("is enabled on localhost with prod preview build when env is unset", () => {
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:4173" } });
    expect(
      resolveDevPaymentBypassState({
        PROD: true,
        DEV: false,
      }),
    ).toMatchObject({
      enabled: true,
      reason: "local_browser_origin",
      prod: true,
      envValue: "",
    });
    vi.unstubAllGlobals();
  });

  it("is disabled on localhost when VITE_ENABLE_DEV_PAYMENT_BYPASS=0", () => {
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:4173" } });
    expect(
      resolveDevPaymentBypassState({
        PROD: true,
        DEV: false,
        VITE_ENABLE_DEV_PAYMENT_BYPASS: "0",
      }),
    ).toMatchObject({
      enabled: false,
      reason: "env_explicitly_disabled",
    });
    vi.unstubAllGlobals();
  });

  it("is false in production-shaped env on a remote origin", () => {
    vi.stubGlobal("window", { location: { origin: "https://app.lawdog.ai" } });
    expect(
      resolveDevPaymentBypassState({
        PROD: true,
        DEV: false,
        VITE_ENABLE_DEV_PAYMENT_BYPASS: "1",
      }),
    ).toMatchObject({
      enabled: false,
      reason: "production_build_non_local_origin",
    });
    vi.unstubAllGlobals();
  });

  it("is true in dev-shaped env when env is unset (default on)", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });
    expect(
      resolveDevPaymentBypassState({
        PROD: false,
        DEV: true,
      }),
    ).toMatchObject({
      enabled: true,
      reason: "local_browser_origin",
    });
    vi.unstubAllGlobals();
  });

  it("is true on vite dev server when origin is not loopback", () => {
    vi.stubGlobal("window", { location: { origin: "http://192.168.1.23:5173" } });
    expect(
      resolveDevPaymentBypassState({
        PROD: false,
        DEV: true,
      }),
    ).toMatchObject({
      enabled: true,
      reason: "vite_dev_server",
    });
    vi.unstubAllGlobals();
  });
});

describe("isDevCreateFlowPaymentBypassEnabled", () => {
  it("delegates to resolveDevPaymentBypassState", () => {
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:4173" } });
    expect(
      isDevCreateFlowPaymentBypassEnabled({
        PROD: true,
        DEV: false,
      }),
    ).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("resolveQaPaymentBypassState", () => {
  it("is disabled on production origin when the QA flag is absent", () => {
    vi.stubGlobal("window", { location: { origin: "https://app.lawdog.ai" } });
    expect(
      resolveQaPaymentBypassState({
        PROD: true,
        DEV: false,
        MODE: "production",
      }),
    ).toMatchObject({
      enabled: false,
      reason: "qa_env_flag_not_enabled",
    });
    vi.unstubAllGlobals();
  });

  it("keeps production origin disabled even when the QA flag is set", () => {
    vi.stubGlobal("window", { location: { origin: "https://app.lawdog.ai" } });
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
    });
    vi.unstubAllGlobals();
  });

  it("keeps lawdog.me disabled for anonymous visitors with only the QA flag", () => {
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
    vi.unstubAllGlobals();
  });

  it("is enabled on Railway preview origins when the QA flag is set", () => {
    vi.stubGlobal("window", { location: { origin: "https://claw-bot-pr-77.up.railway.app" } });
    expect(
      resolveQaPaymentBypassState({
        PROD: true,
        DEV: false,
        MODE: "production",
        VITE_LAWDOG_QA_PAYMENT_BYPASS: "1",
      }),
    ).toMatchObject({
      enabled: true,
      reason: "recognized_qa_origin",
    });
    vi.unstubAllGlobals();
  });

  it("is enabled by explicit non-production deployment environment plus the QA flag", () => {
    vi.stubGlobal("window", { location: { origin: "https://example-public-host.invalid" } });
    expect(
      resolveQaPaymentBypassState({
        PROD: true,
        DEV: false,
        MODE: "production",
        VITE_LAWDOG_QA_PAYMENT_BYPASS: "1",
        VITE_LAWDOG_ENV: "staging",
      }),
    ).toMatchObject({
      enabled: true,
      reason: "explicit_non_production_env",
      deploymentEnv: "staging",
    });
    vi.unstubAllGlobals();
  });

  it("denies lawdog.me when server reports expired admin session", () => {
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
          reason: "admin_session_expired",
          checkedAt: "2026-01-01T00:00:00Z",
        },
      ),
    ).toMatchObject({
      enabled: false,
      reason: "admin_session_expired",
    });
    vi.unstubAllGlobals();
  });

  it("denies lawdog.me when auth endpoint fails closed", () => {
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
          reason: "auth_endpoint_unreachable",
          checkedAt: "2026-01-01T00:00:00Z",
        },
      ),
    ).toMatchObject({
      enabled: false,
      reason: "auth_endpoint_unreachable",
    });
    vi.unstubAllGlobals();
  });

  it("does not treat query or storage values as QA bypass authority", () => {
    const localStore = new Map<string, string>([["VITE_LAWDOG_QA_PAYMENT_BYPASS", "1"]]);
    vi.stubGlobal("window", {
      location: { origin: "https://app.lawdog.ai", href: "https://app.lawdog.ai/app/checkout?qa_bypass=1" },
    });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => localStore.get(key) ?? null,
      setItem: (key: string, value: string) => void localStore.set(key, value),
      removeItem: (key: string) => void localStore.delete(key),
    } as Storage);
    expect(
      resolveQaPaymentBypassState({
        PROD: true,
        DEV: false,
        MODE: "production",
      }),
    ).toMatchObject({
      enabled: false,
      reason: "qa_env_flag_not_enabled",
    });
    vi.unstubAllGlobals();
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

describe("isRecognizedQaPaymentBypassOrigin", () => {
  it("recognizes QA/staging/Railway hosts but not production hosts", () => {
    expect(isRecognizedQaPaymentBypassOrigin("https://claw-bot-pr-77.up.railway.app")).toBe(true);
    expect(isRecognizedQaPaymentBypassOrigin("https://staging.lawdog.ai")).toBe(true);
    expect(isRecognizedQaPaymentBypassOrigin("https://app.lawdog.ai")).toBe(false);
  });
});

describe("logDevPaymentBypassState", () => {
  it("does not log in test mode", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logDevPaymentBypassState({ PROD: true, DEV: false });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("logQaPaymentBypassState", () => {
  it("does not log in test mode", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logQaPaymentBypassState({ PROD: true, DEV: false });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
