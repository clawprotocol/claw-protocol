import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAgreementFunnelContextProps,
  getFunnelDeviceType,
  getFunnelViewportBucket,
  readAgreementFunnelLandingT0Ms,
  markAgreementFunnelLandingT0IfUnset,
} from "./agreementFunnelAnalytics";
import { drainProductEventsForTests, logProductEvent } from "../lib/experimentation/productEvents";

describe("agreementFunnelAnalytics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    try {
      sessionStorage.clear();
    } catch {
      /* */
    }
    drainProductEventsForTests();
  });

  it("getFunnelViewportBucket returns coarse buckets from innerWidth", () => {
    vi.stubGlobal("window", { innerWidth: 500 } as unknown as Window & typeof globalThis);
    expect(getFunnelViewportBucket()).toBe("sm");
    (window as unknown as { innerWidth: number }).innerWidth = 900;
    expect(getFunnelViewportBucket()).toBe("md");
  });

  it("getFunnelDeviceType uses matchMedia when available", () => {
    const mm = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("window", {
      matchMedia: mm,
    } as unknown as Window);
    expect(getFunnelDeviceType()).toBe("mobile");
  });

  it("mark and read landing t0 (sessionStorage)", () => {
    const store: Record<string, string> = {};
    const sessionStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    } as unknown as Storage;
    vi.stubGlobal("window", { sessionStorage } as unknown as Window);
    expect(readAgreementFunnelLandingT0Ms()).toBe(null);
    markAgreementFunnelLandingT0IfUnset();
    const t0 = readAgreementFunnelLandingT0Ms();
    expect(t0).toBeTypeOf("number");
    markAgreementFunnelLandingT0IfUnset();
    expect(readAgreementFunnelLandingT0Ms()).toBe(t0);
  });

  it("getAgreementFunnelContextProps adds timing when t0 and atMs are set", () => {
    const store: Record<string, string> = {
      lawdog_agreement_funnel_landing_ms_v1: "1000",
    };
    const sessionStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: vi.fn(),
    } as unknown as Storage;
    vi.stubGlobal("window", { sessionStorage } as unknown as Window);
    const p = getAgreementFunnelContextProps({ planTier: "free", atMsProDraft: 2000, atMsLink: 5000 });
    expect(p.time_to_pro_draft_ms).toBe(1000);
    expect(p.time_to_link_created_ms).toBe(4000);
  });

  it("logProductEvent accepts first_input_started and funnel events", () => {
    logProductEvent("first_input_started", { chars: 3 });
    const ev = drainProductEventsForTests();
    expect(ev.some((e) => e.name === "first_input_started")).toBe(true);
  });
});
