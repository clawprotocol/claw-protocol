import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drainProductEventsForTests, logProductEvent } from "../lib/experimentation/productEvents";
import {
  bindLawdogSessionEmail,
  getLawdogSessionEmail,
  getOrCreateLawdogSessionId,
  LAWDOG_SESSION_ID_KEY,
  noteLawdogSessionAgreementCreated,
  readLawdogSessionState,
  syncLawdogReferralSourceFromAffiliateLanding,
  syncLawdogReferralSourceFromPathname,
  syncLawdogTrafficSourceFromSearch,
} from "./lawdogSession";

function installMemoryLocalStorage(): void {
  const m: Record<string, string> = {};
  const ls = {
    getItem: (k: string) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k: string, v: string) => {
      m[k] = String(v);
    },
    removeItem: (k: string) => {
      delete m[k];
    },
    clear: () => {
      for (const k of Object.keys(m)) delete m[k];
    },
    key: (i: number) => Object.keys(m)[i] ?? null,
    get length() {
      return Object.keys(m).length;
    },
  } as Storage;
  Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true, writable: true });
}

beforeAll(() => {
  installMemoryLocalStorage();
  const w = globalThis as typeof globalThis & {
    localStorage: Storage;
    dispatchEvent: (e: Event) => boolean;
  };
  w.dispatchEvent = () => true;
  (globalThis as unknown as { window: typeof w }).window = w;
});

describe("lawdogSession", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("creates and persists session id", () => {
    const a = getOrCreateLawdogSessionId();
    expect(a.length).toBeGreaterThan(8);
    expect(localStorage.getItem(LAWDOG_SESSION_ID_KEY)).toBe(a);
    expect(getOrCreateLawdogSessionId()).toBe(a);
  });

  it("binds email for identity", () => {
    bindLawdogSessionEmail("  User@Example.COM ");
    expect(getLawdogSessionEmail()).toBe("user@example.com");
    const st = readLawdogSessionState();
    expect(st.identity_email).toBe("user@example.com");
  });

  it("counts agreement creates in session", () => {
    noteLawdogSessionAgreementCreated();
    noteLawdogSessionAgreementCreated();
    expect(readLawdogSessionState().agreements_created_session).toBe(2);
  });

  it("defaults traffic_source to direct", () => {
    expect(readLawdogSessionState().traffic_source).toBe("direct");
  });

  it("persists traffic_source from ?src=", () => {
    syncLawdogTrafficSourceFromSearch("?src=csn");
    expect(readLawdogSessionState().traffic_source).toBe("csn");
    syncLawdogTrafficSourceFromSearch("");
    expect(readLawdogSessionState().traffic_source).toBe("csn");
  });

  it("defaults referral_source to null", () => {
    expect(readLawdogSessionState().referral_source).toBeNull();
  });

  it("sets referral_source on agreement deep link (sticky first touch)", () => {
    syncLawdogReferralSourceFromPathname("/app/agreements/abc-123");
    expect(readLawdogSessionState().referral_source).toBe("agreement_link");
    syncLawdogReferralSourceFromPathname("/app/create");
    expect(readLawdogSessionState().referral_source).toBe("agreement_link");
  });

  it("sets referral_source for simple-flow agreement URLs", () => {
    syncLawdogReferralSourceFromPathname("/app/send/x");
    expect(readLawdogSessionState().referral_source).toBe("agreement_link");
  });

  it("does not set referral_source for agreement list or new", () => {
    syncLawdogReferralSourceFromPathname("/app/agreements");
    expect(readLawdogSessionState().referral_source).toBeNull();
    localStorage.clear();
    syncLawdogReferralSourceFromPathname("/app/agreements/new");
    expect(readLawdogSessionState().referral_source).toBeNull();
  });

  it("sets referral_source affiliate_page on affiliate landing paths (first touch)", () => {
    syncLawdogReferralSourceFromAffiliateLanding("/@promo");
    expect(readLawdogSessionState().referral_source).toBe("affiliate_page");
    syncLawdogReferralSourceFromAffiliateLanding("/doginal/other");
    expect(readLawdogSessionState().referral_source).toBe("affiliate_page");
  });
});

describe("logProductEvent trust envelope", () => {
  beforeEach(() => {
    localStorage.clear();
    drainProductEventsForTests();
  });
  afterEach(() => {
    localStorage.clear();
    drainProductEventsForTests();
  });

  it("merges session_id, flow, step, timestamp into payload", () => {
    logProductEvent("paywall_triggered", { surface: "test", reason: "x" });
    const rows = drainProductEventsForTests();
    expect(rows).toHaveLength(1);
    const p = rows[0].payload ?? {};
    expect(typeof p.session_id).toBe("string");
    expect(p.flow === "esign" || p.flow === "agreement").toBe(true);
    expect(typeof p.step).toBe("string");
    expect(typeof p.timestamp).toBe("string");
    expect(p.traffic_source).toBe("direct");
    expect(p.referral_source).toBeUndefined();
    expect(p.surface).toBe("test");
  });

  it("includes referral_source in envelope when session has agreement_link", () => {
    syncLawdogReferralSourceFromPathname("/app/agreements/deep-id");
    logProductEvent("paywall_triggered", { surface: "test", reason: "x" });
    const rows = drainProductEventsForTests();
    expect(rows[0].payload?.referral_source).toBe("agreement_link");
    expect(rows[0].payload?.traffic_source).toBe("direct");
  });

  it("includes affiliate_page in envelope and preserves traffic_source from ?src=", () => {
    syncLawdogReferralSourceFromAffiliateLanding("/doginal/aff");
    syncLawdogTrafficSourceFromSearch("?src=doginal_aff");
    logProductEvent("paywall_triggered", { surface: "test", reason: "x" });
    const rows = drainProductEventsForTests();
    expect(rows[0].payload?.referral_source).toBe("affiliate_page");
    expect(rows[0].payload?.traffic_source).toBe("doginal_aff");
  });
});
