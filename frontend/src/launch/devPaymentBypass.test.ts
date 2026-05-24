import { describe, expect, it, vi } from "vitest";
import {
  isDevCreateFlowPaymentBypassEnabled,
  logDevPaymentBypassState,
  resolveDevPaymentBypassState,
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

describe("logDevPaymentBypassState", () => {
  it("does not log in test mode", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logDevPaymentBypassState({ PROD: true, DEV: false });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
