import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canAccessAdminConsoleWithoutServerAuth,
  isAdminConsoleDeploymentEnabled,
  isPublicProductionAdminConsoleHost,
  requiresAdminConsoleServerAuth,
} from "./adminConsoleAccess";

describe("isAdminConsoleDeploymentEnabled", () => {
  it("is off on default production builds", () => {
    expect(
      isAdminConsoleDeploymentEnabled({
        PROD: true,
        DEV: false,
        VITE_LAWDOG_QA_PAYMENT_BYPASS: "",
      }),
    ).toBe(false);
  });

  it("is on when the internal QA operator deployment flag is set", () => {
    expect(
      isAdminConsoleDeploymentEnabled({
        PROD: true,
        DEV: false,
        VITE_LAWDOG_QA_PAYMENT_BYPASS: "1",
      }),
    ).toBe(true);
  });
});

describe("public production admin console gating", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires server auth on lawdog.me operator deployments", () => {
    vi.stubGlobal("window", { location: { origin: "https://lawdog.me" } });
    expect(isPublicProductionAdminConsoleHost()).toBe(true);
    expect(
      requiresAdminConsoleServerAuth({
        PROD: true,
        DEV: false,
        VITE_LAWDOG_QA_PAYMENT_BYPASS: "1",
      }),
    ).toBe(true);
    expect(
      canAccessAdminConsoleWithoutServerAuth({
        PROD: true,
        DEV: false,
        VITE_LAWDOG_QA_PAYMENT_BYPASS: "1",
      }),
    ).toBe(false);
  });

  it("allows staging operator deployments without server auth", () => {
    vi.stubGlobal("window", { location: { origin: "https://staging.lawdog.ai" } });
    expect(
      canAccessAdminConsoleWithoutServerAuth({
        PROD: true,
        DEV: false,
        VITE_LAWDOG_QA_PAYMENT_BYPASS: "1",
      }),
    ).toBe(true);
    expect(
      requiresAdminConsoleServerAuth({
        PROD: true,
        DEV: false,
        VITE_LAWDOG_QA_PAYMENT_BYPASS: "1",
      }),
    ).toBe(false);
  });

  it("enables the admin route shell on public production hosts with server auth", () => {
    vi.stubGlobal("window", { location: { origin: "https://lawdog.me" } });
    expect(
      isAdminConsoleDeploymentEnabled({
        PROD: true,
        DEV: false,
      }),
    ).toBe(true);
    expect(
      requiresAdminConsoleServerAuth({
        PROD: true,
        DEV: false,
      }),
    ).toBe(true);
  });

  it("keeps admin console off on non-operator production hosts without flags", () => {
    vi.stubGlobal("window", { location: { origin: "https://customer.example.com" } });
    expect(
      isAdminConsoleDeploymentEnabled({
        PROD: true,
        DEV: false,
      }),
    ).toBe(false);
  });
});
