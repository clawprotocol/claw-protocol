import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drainProductEventsForTests, logProductEvent } from "../lib/experimentation/productEvents";
import {
  __resetReEngagementForTests,
  applyProductEventToReEngagement,
  peekCreateOrHomeBanner,
  shouldShowFirstWorkflowReinforcement,
} from "./reEngagementStore";

function stubBrowserStorage(): void {
  const backing: Record<string, string> = {};
  const ls = {
    getItem: (k: string) => (Object.prototype.hasOwnProperty.call(backing, k) ? backing[k] : null),
    setItem: (k: string, v: string) => {
      backing[k] = v;
    },
    removeItem: (k: string) => {
      delete backing[k];
    },
    clear: () => {
      for (const k of Object.keys(backing)) delete backing[k];
    },
    get length() {
      return Object.keys(backing).length;
    },
    key: (i: number) => Object.keys(backing)[i] ?? null,
  };
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("window", { ...globalThis, localStorage: ls, dispatchEvent: vi.fn() });
}

describe("reEngagementStore", () => {
  beforeEach(() => {
    stubBrowserStorage();
    __resetReEngagementForTests();
    drainProductEventsForTests();
  });

  afterEach(() => {
    __resetReEngagementForTests();
    drainProductEventsForTests();
    vi.unstubAllGlobals();
  });

  it("records pricing vs checkout for rehab signal", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T12:00:00.000Z"));
    applyProductEventToReEngagement({ name: "checkout_completed", payload: { agreementId: "x" } });
    vi.setSystemTime(new Date("2024-06-01T12:00:05.000Z"));
    applyProductEventToReEngagement({ name: "pricing_viewed", payload: { surface: "billing_page" } });
    const banner = peekCreateOrHomeBanner("create");
    expect(banner?.kind).toBe("rehab");
    vi.useRealTimers();
  });

  it("draft_created updates last draft id", () => {
    applyProductEventToReEngagement({ name: "draft_created", payload: { agreementId: "abc" } });
    const banner = peekCreateOrHomeBanner("create");
    expect(banner?.kind).toBe("abandoned");
    if (banner?.kind === "abandoned") expect(banner.agreementId).toBe("abc");
  });

  it("agreement_sent clears abandoned state for that id", () => {
    applyProductEventToReEngagement({ name: "draft_created", payload: { agreementId: "z1" } });
    expect(peekCreateOrHomeBanner("create")?.kind).toBe("abandoned");
    applyProductEventToReEngagement({ name: "agreement_sent", payload: { agreementId: "z1" } });
    expect(peekCreateOrHomeBanner("create")?.kind).not.toBe("abandoned");
  });

  it("logProductEvent wires agreement_sent into store", () => {
    logProductEvent("draft_created", { agreementId: "p1" });
    logProductEvent("agreement_sent", { agreementId: "p1" });
    expect(peekCreateOrHomeBanner("create")?.kind).not.toBe("abandoned");
  });

  it("first workflow reinforcement defaults to showable", () => {
    expect(shouldShowFirstWorkflowReinforcement()).toBe(true);
  });
});
