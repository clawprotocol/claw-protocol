import { describe, expect, it } from "vitest";
import {
  normalizeMarketingPath,
  parseAffiliateLandingPath,
  sanitizeAffiliateUsernameSlug,
} from "./affiliateLandingRoutes";
import { parseAffiliateLandingColorParam, resolveAffiliateLandingColorKey } from "./affiliateLandingPalette";

describe("affiliateLandingRoutes", () => {
  it("parses /@handle and /doginal/handle", () => {
    expect(parseAffiliateLandingPath("/@alice")).toEqual({ mode: "affiliate", usernameSlug: "alice" });
    expect(parseAffiliateLandingPath("/doginal/bob_1")).toEqual({ mode: "doginal", usernameSlug: "bob_1" });
  });

  it("normalizes path (trailing slash, ignores future query in pathname)", () => {
    expect(normalizeMarketingPath("/@carol/")).toBe("/@carol");
  });

  it("rejects empty or unsafe handles", () => {
    expect(parseAffiliateLandingPath("/@")).toBeNull();
    expect(parseAffiliateLandingPath("/@!!!")).toBeNull();
    expect(sanitizeAffiliateUsernameSlug("  ok-1_  ")).toBe("ok-1_");
  });

  it("decodes URI segments and strips non-ascii to safe slug", () => {
    expect(parseAffiliateLandingPath("/doginal/caf%C3%A9")).toEqual({ mode: "doginal", usernameSlug: "caf" });
    expect(parseAffiliateLandingPath("/doginal/%20%20")).toBeNull();
    expect(parseAffiliateLandingPath("/@user%20x")).toEqual({ mode: "affiliate", usernameSlug: "userx" });
  });
});

describe("parseAffiliateLandingColorParam", () => {
  it("defaults to aqua and allowlists keys", () => {
    expect(parseAffiliateLandingColorParam("")).toBe("aqua");
    expect(parseAffiliateLandingColorParam("?color=blue")).toBe("blue");
    expect(parseAffiliateLandingColorParam("?color=BLUE")).toBe("blue");
    expect(parseAffiliateLandingColorParam("?color=nope")).toBe("aqua");
  });
});

describe("resolveAffiliateLandingColorKey", () => {
  it("uses registry when query missing or invalid", () => {
    expect(resolveAffiliateLandingColorKey("", "yellow")).toBe("yellow");
    expect(resolveAffiliateLandingColorKey("?color=oops", "pink")).toBe("pink");
    expect(resolveAffiliateLandingColorKey("?color=green", "pink")).toBe("green");
  });
});
