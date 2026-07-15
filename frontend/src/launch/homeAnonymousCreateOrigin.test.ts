/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  clearHomeAnonymousCreateOrigin,
  hasHomeAnonymousCreateOrigin,
  HOME_ANONYMOUS_CREATE_ORIGIN,
  HOME_ANONYMOUS_INTENDED_SURFACE,
  isHomeAnonymousStarterAuthorityActive,
  markHomeAnonymousCreateOrigin,
  readHomeAnonymousCreateOrigin,
} from "./homeAnonymousCreateOrigin";
import {
  classifyFallbackOrgId,
  evaluateFallbackOrgPaidEntitlementBlock,
  mustBlockPaidEntitlementForLegacyFallbackOrg,
  mustBlockPathInferredPaidEntitlement,
} from "./fallbackOrgPaidEntitlementGuard";

afterEach(() => {
  sessionStorage.clear();
  clearHomeAnonymousCreateOrigin();
  window.history.replaceState(null, "", "/");
});

describe("homeAnonymousCreateOrigin", () => {
  it("marks durable origin and intended starter surface", () => {
    markHomeAnonymousCreateOrigin();
    expect(hasHomeAnonymousCreateOrigin()).toBe(true);
    expect(readHomeAnonymousCreateOrigin()).toEqual(
      expect.objectContaining({
        origin: HOME_ANONYMOUS_CREATE_ORIGIN,
        intendedSurface: HOME_ANONYMOUS_INTENDED_SURFACE,
      }),
    );
    expect(isHomeAnonymousStarterAuthorityActive()).toBe(true);
  });

  it("falls back to history clawHeroFromHome when session marker absent", () => {
    window.history.replaceState({ clawHeroFromHome: true }, "", "/app/create");
    expect(isHomeAnonymousStarterAuthorityActive()).toBe(true);
  });
});

describe("fallbackOrgPaidEntitlementGuard", () => {
  it("always blocks local-org", () => {
    expect(classifyFallbackOrgId("local-org")).toBe("local");
    expect(mustBlockPaidEntitlementForLegacyFallbackOrg("local-org")).toBe(true);
    expect(mustBlockPathInferredPaidEntitlement("local-org")).toBe(true);
    expect(
      evaluateFallbackOrgPaidEntitlementBlock("local-org", {
        PROD: true,
        MODE: "production",
        hostname: "lawdog.me",
      }).blocked,
    ).toBe(true);
  });

  it("blocks path inference for anon orgs but not user orgs", () => {
    expect(mustBlockPathInferredPaidEntitlement("anon-abc")).toBe(true);
    expect(mustBlockPathInferredPaidEntitlement("user-abc")).toBe(false);
    expect(mustBlockPaidEntitlementForLegacyFallbackOrg("user-abc")).toBe(false);
  });
});
