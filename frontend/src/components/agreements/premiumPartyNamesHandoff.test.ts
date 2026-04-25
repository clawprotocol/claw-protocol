import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPremiumPartyNamesHandoff,
  hydrateEmailFromHandoff,
  hydrateNameFromHandoff,
  persistPremiumRecipientHandoff,
  readPremiumRecipientHandoff,
  writePremiumPartyNamesHandoff,
  writePremiumRecipientHandoffExact,
} from "./premiumPartyNamesHandoff";

const LEGACY = "claw_premium_party_names_handoff_v1";
const V2 = "claw_premium_recipient_handoff_v2";

function stubSessionStorage() {
  const mem: Record<string, string> = {};
  vi.stubGlobal(
    "sessionStorage",
    {
      getItem: (k: string) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
      setItem: (k: string, v: string) => {
        mem[k] = v;
      },
      removeItem: (k: string) => {
        delete mem[k];
      },
      clear: () => {
        Object.keys(mem).forEach((k) => delete mem[k]);
      },
      key: () => null,
      get length() {
        return Object.keys(mem).length;
      },
    } as Storage,
  );
}

beforeEach(() => {
  stubSessionStorage();
});

afterEach(() => {
  clearPremiumPartyNamesHandoff();
  vi.unstubAllGlobals();
});

describe("premiumRecipientHandoff", () => {
  it("migrates legacy v1 names-only into v2", () => {
    sessionStorage.setItem(LEGACY, JSON.stringify({ party1: "Ann", party2: "Ben", savedAt: 1 }));
    const h = readPremiumRecipientHandoff();
    expect(h?.party1.name).toBe("Ann");
    expect(h?.party2.name).toBe("Ben");
    expect(h?.party1.email).toBe("");
    expect(sessionStorage.getItem(LEGACY)).toBeNull();
    expect(sessionStorage.getItem(V2)).toBeTruthy();
  });

  it("names + emails survive merge persist (continue-style)", () => {
    persistPremiumRecipientHandoff({
      party1: { name: "Ann", email: "ann@example.com", role: "Buyer" },
      party2: { name: "Ben", email: "ben@example.com", role: "Seller" },
    });
    persistPremiumRecipientHandoff({
      party1: { name: "Ann Lee" },
      party2: { name: "Ben Wu" },
    });
    const h = readPremiumRecipientHandoff();
    expect(h?.party1.name).toBe("Ann Lee");
    expect(h?.party1.email).toBe("ann@example.com");
    expect(h?.party1.role).toBe("Buyer");
    expect(h?.party2.email).toBe("ben@example.com");
  });

  it("blank patch does not erase populated email", () => {
    persistPremiumRecipientHandoff({
      party1: { name: "Ann", email: "ann@example.com", role: "party" },
      party2: { name: "Ben", email: "", role: "party" },
    });
    persistPremiumRecipientHandoff({
      party1: { email: "" },
      party2: { name: "Ben B" },
    });
    const h = readPremiumRecipientHandoff();
    expect(h?.party1.email).toBe("ann@example.com");
    expect(h?.party2.name).toBe("Ben B");
  });

  it("names-only via writePremiumPartyNamesHandoff keeps prior emails", () => {
    persistPremiumRecipientHandoff({
      party1: { name: "X", email: "x@example.com", role: "party" },
      party2: { name: "Y", email: "y@example.com", role: "party" },
    });
    writePremiumPartyNamesHandoff("Ann", "Ben");
    const h = readPremiumRecipientHandoff();
    expect(h?.party1.name).toBe("Ann");
    expect(h?.party1.email).toBe("x@example.com");
    expect(h?.party2.name).toBe("Ben");
    expect(h?.party2.email).toBe("y@example.com");
  });

  it("writePremiumRecipientHandoffExact overwrites including empty emails", () => {
    persistPremiumRecipientHandoff({
      party1: { name: "Ann", email: "ann@example.com", role: "party" },
      party2: { name: "Ben", email: "ben@example.com", role: "party" },
    });
    writePremiumRecipientHandoffExact(
      { name: "Ann", email: "", role: "party" },
      { name: "Ben", email: "", role: "party" },
    );
    const h = readPremiumRecipientHandoff();
    expect(h?.party1.email).toBe("");
    expect(h?.party2.email).toBe("");
  });

  it("hydrate prefers local over handoff", () => {
    expect(hydrateEmailFromHandoff("a@x.com", "b@y.com")).toBe("a@x.com");
    expect(hydrateEmailFromHandoff("", "b@y.com")).toBe("b@y.com");
    expect(hydrateNameFromHandoff("Local", "Hand")).toBe("Local");
    expect(hydrateNameFromHandoff("", "Hand")).toBe("Hand");
  });

  it("session handoff re-read matches after persist (refresh-style)", () => {
    persistPremiumRecipientHandoff({
      party1: { name: "A", email: "a@example.com", role: "Lessor" },
      party2: { name: "B", email: "", role: "Lessee" },
    });
    const first = readPremiumRecipientHandoff();
    const second = readPremiumRecipientHandoff();
    expect(second).toEqual(first);
    expect(second?.party1.email).toBe("a@example.com");
  });
});
