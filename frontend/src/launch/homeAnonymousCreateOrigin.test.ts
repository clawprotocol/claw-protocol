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

describe("homepage Draft free click handoff contract", () => {
  it("empty submit via openCleanCreateIntake must mark authority and navigate with heroFromHome", () => {
    const launchHomeSrc = require("fs").readFileSync(
      require("path").join(__dirname, "LaunchHomePage.tsx"),
      "utf8",
    );
    const cleanIntakeBlock = launchHomeSrc.slice(
      launchHomeSrc.indexOf("openCleanCreateIntake = useCallback"),
      launchHomeSrc.indexOf("openCleanCreateIntake = useCallback") + 700,
    );
    expect(cleanIntakeBlock).toContain("markHomeAnonymousCreateOrigin()");
    expect(cleanIntakeBlock).toContain('navigate("/app/create", { heroFromHome: true })');
    expect(cleanIntakeBlock).not.toContain("heroAutoGenerate");
  });

  it("text submit via startDrafting must mark authority and navigate with heroFromHome", () => {
    const launchHomeSrc = require("fs").readFileSync(
      require("path").join(__dirname, "LaunchHomePage.tsx"),
      "utf8",
    );
    const startDraftingBlock = launchHomeSrc.slice(
      launchHomeSrc.indexOf("async function startDrafting()"),
      launchHomeSrc.indexOf("async function startDrafting()") + 1800,
    );
    expect(startDraftingBlock).toContain("markHomeAnonymousCreateOrigin()");
    expect(startDraftingBlock).toContain("heroFromHome: true");
  });

  it("typed /app/create URL without fresh homepage click must be blocked (no clawHeroFromHome in history)", () => {
    markHomeAnonymousCreateOrigin();
    window.history.replaceState(null, "", "/app/create");
    expect(isHomeAnonymousStarterAuthorityActive()).toBe(false);
  });

  it("fresh homepage click sets up complete authority (both session + history)", () => {
    markHomeAnonymousCreateOrigin();
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
