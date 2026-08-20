/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  clearHomeAnonymousCreateOrigin,
  consumeHomeAnonymousCreateAuthority,
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
  });

  it("grants authority when BOTH session marker AND history.state.clawHeroFromHome are present", () => {
    markHomeAnonymousCreateOrigin();
    window.history.replaceState({ clawHeroFromHome: true }, "", "/app/create");
    expect(isHomeAnonymousStarterAuthorityActive()).toBe(true);
  });

  it("denies authority when only session marker exists (stale marker from earlier click)", () => {
    markHomeAnonymousCreateOrigin();
    expect(isHomeAnonymousStarterAuthorityActive()).toBe(false);
  });

  it("denies authority when only history.state.clawHeroFromHome exists (no session marker)", () => {
    window.history.replaceState({ clawHeroFromHome: true }, "", "/app/create");
    expect(isHomeAnonymousStarterAuthorityActive()).toBe(false);
  });

  it("consumeHomeAnonymousCreateAuthority clears the session marker", () => {
    markHomeAnonymousCreateOrigin();
    window.history.replaceState({ clawHeroFromHome: true }, "", "/app/create");
    expect(isHomeAnonymousStarterAuthorityActive()).toBe(true);
    consumeHomeAnonymousCreateAuthority();
    expect(hasHomeAnonymousCreateOrigin()).toBe(false);
    expect(isHomeAnonymousStarterAuthorityActive()).toBe(false);
  });

  it("typed URL / hard refresh without fresh homepage navigation denies authority", () => {
    markHomeAnonymousCreateOrigin();
    window.history.replaceState(null, "", "/app/create");
    expect(isHomeAnonymousStarterAuthorityActive()).toBe(false);
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
