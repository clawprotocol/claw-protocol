/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("readMockIsAuthenticated", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to false in production builds so cold visitors are not fake-authenticated", async () => {
    vi.stubEnv("DEV", false);
    const { readMockIsAuthenticated } = await import("./lawDogMonetization");
    expect(readMockIsAuthenticated()).toBe(false);
  });

  it("defaults to true in DEV for local paywall testing", async () => {
    vi.stubEnv("DEV", true);
    const { readMockIsAuthenticated } = await import("./lawDogMonetization");
    expect(readMockIsAuthenticated()).toBe(true);
  });

  it("honors explicit localStorage override", async () => {
    vi.stubEnv("DEV", false);
    localStorage.setItem("lawdog_mock_is_authenticated", "true");
    const { readMockIsAuthenticated } = await import("./lawDogMonetization");
    expect(readMockIsAuthenticated()).toBe(true);
    localStorage.setItem("lawdog_mock_is_authenticated", "false");
    expect(readMockIsAuthenticated()).toBe(false);
  });
});
