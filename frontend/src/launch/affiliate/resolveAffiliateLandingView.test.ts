import { describe, expect, it } from "vitest";
import type { DoginalAffiliateProfilePublic } from "./affiliateProfileTypes";
import { resolveAffiliateLandingViewWithProfile } from "./resolveAffiliateLandingView";

function p(row: Partial<DoginalAffiliateProfilePublic> & { username_slug: string }): DoginalAffiliateProfilePublic {
  return {
    username_slug: row.username_slug,
    affiliate_mode: row.affiliate_mode,
    doginal_claim_status: row.doginal_claim_status,
    doginal_number: row.doginal_number ?? null,
    doginal_inscription_id: row.doginal_inscription_id ?? null,
    doginal_marketplace_url: row.doginal_marketplace_url ?? null,
    doginal_color: row.doginal_color ?? null,
    doginal_verification_method: row.doginal_verification_method,
    doginal_image_url: row.doginal_image_url ?? null,
  };
}

describe("resolveAffiliateLandingViewWithProfile", () => {
  it("affiliate path ignores doginal claim rows", () => {
    const v = resolveAffiliateLandingViewWithProfile({
      pathMode: "affiliate",
      usernameSlug: "alice",
      search: "",
      profile: p({ username_slug: "alice", doginal_claim_status: "verified" }),
    });
    expect(v.effectiveTheme).toBe("affiliate");
    expect(v.analyticsDoginalStatus).toBe("n/a");
  });

  it("doginal path + verified → verified tier", () => {
    const v = resolveAffiliateLandingViewWithProfile({
      pathMode: "doginal",
      usernameSlug: "bob",
      search: "",
      profile: p({ username_slug: "bob", doginal_claim_status: "verified", affiliate_mode: "doginal" }),
    });
    expect(v.effectiveTheme).toBe("doginal");
    expect(v.doginalUxTier).toBe("verified");
    expect(v.analyticsDoginalStatus).toBe("verified");
  });

  it("doginal path + claimed → claimed tier", () => {
    const v = resolveAffiliateLandingViewWithProfile({
      pathMode: "doginal",
      usernameSlug: "c",
      search: "",
      profile: p({ username_slug: "c", doginal_claim_status: "claimed" }),
    });
    expect(v.doginalUxTier).toBe("claimed");
    expect(v.analyticsDoginalStatus).toBe("claimed");
  });

  it("doginal path + removed → affiliate fallback + affiliate traffic src", () => {
    const v = resolveAffiliateLandingViewWithProfile({
      pathMode: "doginal",
      usernameSlug: "d",
      search: "",
      profile: p({ username_slug: "d", doginal_claim_status: "removed" }),
    });
    expect(v.effectiveTheme).toBe("affiliate");
    expect(v.wasDoginalPathDowngraded).toBe(true);
    expect(v.trafficSourceForCta.startsWith("affiliate_")).toBe(true);
    expect(v.analyticsDoginalStatus).toBe("removed_fallback");
  });

  it("doginal path + affiliate_mode regular → downgrade", () => {
    const v = resolveAffiliateLandingViewWithProfile({
      pathMode: "doginal",
      usernameSlug: "e",
      search: "",
      profile: p({ username_slug: "e", affiliate_mode: "regular", doginal_claim_status: "verified" }),
    });
    expect(v.effectiveTheme).toBe("affiliate");
    expect(v.wasDoginalPathDowngraded).toBe(true);
  });

  it("registry pastel applies when query absent", () => {
    const v = resolveAffiliateLandingViewWithProfile({
      pathMode: "doginal",
      usernameSlug: "f",
      search: "",
      profile: p({ username_slug: "f", doginal_color: "pink" }),
    });
    expect(v.colorKey).toBe("pink");
  });
});
