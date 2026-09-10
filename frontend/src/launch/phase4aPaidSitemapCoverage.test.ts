import { describe, expect, it } from "vitest";
import { APP_ROUTE_MANIFEST } from "./routes";
import {
  PHASE4A_ACCESS,
  PHASE4B_ACCESS,
  PHASE4A_ROUTE_SCENARIOS,
  assertPhase4aCoverageComplete,
  listPhase4aExamplePaths,
  listPhase4aManifestRoutes,
  listPhase4bManifestRoutes,
} from "./phase4aPaidSitemapCoverage";

describe("Phase 4A paid-owner sitemap coverage", () => {
  it("covers every authenticated and paid manifest route with a browser scenario", () => {
    expect(() => assertPhase4aCoverageComplete()).not.toThrow();
    const covered = new Set(PHASE4A_ROUTE_SCENARIOS.map((row) => row.routeId));
    for (const route of listPhase4aManifestRoutes()) {
      expect(covered.has(route.id), route.id).toBe(true);
      expect(route.examplePaths.length).toBeGreaterThan(0);
    }
  });

  it("visits every authenticated/paid example path from the manifest, not a hand list", () => {
    const examples = listPhase4aExamplePaths();
    expect(examples.length).toBeGreaterThan(0);
    for (const { routeId, path } of examples) {
      const declared = APP_ROUTE_MANIFEST.find((route) => route.id === routeId);
      expect(declared?.examplePaths).toContain(path);
      expect(PHASE4A_ACCESS).toContain(declared?.access);
    }
  });

  it("lists public, guest, recipient-token, and admin routes as Phase 4B scope", () => {
    const deferred = listPhase4bManifestRoutes();
    expect(deferred.length).toBeGreaterThan(0);
    expect(new Set(deferred.map((r) => r.access))).toEqual(new Set(PHASE4B_ACCESS));
    expect(deferred.some((r) => r.id === "sign-in")).toBe(true);
    expect(deferred.some((r) => r.id === "quick-send")).toBe(true);
    expect(deferred.some((r) => r.id === "recipient-esign")).toBe(true);
    expect(deferred.some((r) => r.id === "admin-console")).toBe(true);
    for (const route of deferred) {
      expect(PHASE4A_ROUTE_SCENARIOS.some((row) => row.routeId === route.id)).toBe(false);
    }
  });
});
