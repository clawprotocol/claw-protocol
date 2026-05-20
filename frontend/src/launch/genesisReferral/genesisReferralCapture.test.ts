import { describe, expect, it, beforeEach, vi } from "vitest";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => {
    storage.set(k, v);
  },
  removeItem: (k: string) => {
    storage.delete(k);
  },
  clear: () => storage.clear(),
});
vi.stubGlobal("document", {
  cookie: "",
});
import {
  buildGenesisReferralLink,
  captureGenesisReferralFromSearch,
  getGenesisReferralCheckoutPayload,
  getGenesisReferralCode,
  getOrCreateGenesisVisitorId,
  rememberGenesisReferralCode,
} from "./genesisReferralCapture";
import { buildStripeCheckoutMetadata } from "./buildStripeCheckoutMetadata";

describe("genesisReferralCapture", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("captures referral code from ?ref= URL", () => {
    const code = captureGenesisReferralFromSearch("?ref=genesisdog", "/app/create");
    expect(code).toBe("GENESISDOG");
    expect(getGenesisReferralCode()).toBe("GENESISDOG");
  });

  it("persists visitor_id across reads", () => {
    const a = getOrCreateGenesisVisitorId();
    const b = getOrCreateGenesisVisitorId();
    expect(a).toBe(b);
    expect(a.startsWith("vis_")).toBe(true);
  });

  it("without ref, checkout payload has visitor only", () => {
    const payload = getGenesisReferralCheckoutPayload();
    expect(payload.referral_code).toBeNull();
    expect(payload.visitor_id.length).toBeGreaterThan(7);
  });

  it("checkout metadata includes referral_code", () => {
    rememberGenesisReferralCode("PARTNER42");
    const payload = getGenesisReferralCheckoutPayload();
    const md = buildStripeCheckoutMetadata("org_test", payload, "user_1");
    expect(md.referral_code).toBe("PARTNER42");
    expect(md.visitor_id).toBe(payload.visitor_id);
    expect(md.org_id).toBe("org_test");
    expect(md.plan_code).toBe("pro");
  });

  it("builds referral link", () => {
    expect(buildGenesisReferralLink("abc", "https://lawdog.ai")).toBe(
      "https://lawdog.ai/app/create?ref=ABC",
    );
  });
});
