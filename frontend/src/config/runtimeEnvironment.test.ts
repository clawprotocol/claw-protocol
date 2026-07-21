import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  readRuntimeEnvironment,
  resetRuntimeEnvironmentCacheForTests,
} from "./runtimeEnvironment";

describe("runtimeEnvironment", () => {
  beforeEach(() => {
    resetRuntimeEnvironmentCacheForTests();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    resetRuntimeEnvironmentCacheForTests();
    vi.unstubAllEnvs();
  });

  it("reads api base from process.env in Node without import.meta.env", () => {
    vi.stubEnv("VITE_CLAW_API_BASE", "http://127.0.0.1:8000");
    vi.stubEnv("VITE_API_BASE", "");
    vi.stubEnv("MODE", "test");
    resetRuntimeEnvironmentCacheForTests();
    const env = readRuntimeEnvironment();
    expect(env.apiBaseUrl).toBe("http://127.0.0.1:8000");
    expect(env.isTest).toBe(true);
    expect(env.paymentBypassEnabled).toBe(false);
  });

  it("defaults payment bypass off for RC validation", () => {
    vi.stubEnv("MODE", "test");
    expect(readRuntimeEnvironment().paymentBypassEnabled).toBe(false);
  });

  it("respects explicit QA payment bypass env in Node", () => {
    vi.stubEnv("VITE_LAWDOG_QA_PAYMENT_BYPASS", "1");
    resetRuntimeEnvironmentCacheForTests();
    expect(readRuntimeEnvironment().paymentBypassEnabled).toBe(true);
  });
});
