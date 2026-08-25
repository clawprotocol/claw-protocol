import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAccess } from "./accessResolver";
import { canUseFeature, checkoutCreatedLawdogEsignAllowed } from "./accessHelpers";

const EMPTY_USAGE = {
  agreements_created: 0,
  revision_previews: 0,
  recipient_invitations: 0,
  signature_requests: 0,
  verification_packets: 0,
};

function stubRemoteWindow(search = "") {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    location: {
      search,
      origin: "https://app.lawdog.ai",
      hostname: "app.lawdog.ai",
    },
  } as unknown as Window & typeof globalThis);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
  } as Storage);
  return storage;
}

describe("accessResolver production safety", () => {
  beforeEach(() => {
    stubRemoteWindow();
    vi.stubEnv("DEV", false);
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_CLAW_ACCESS_DEV_TOOLS", "0");
    vi.stubEnv("VITE_CLAW_ACCESS_TIER", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("ignores build-time access tier overrides when dev tools are locked", () => {
    vi.stubEnv("VITE_CLAW_ACCESS_TIER", "premium");

    expect(resolveAccess()).toMatchObject({
      tier: "free",
      sourcesTried: expect.arrayContaining([expect.objectContaining({ id: "default", tier: "free" })]),
    });
  });

  it("ignores query and localStorage tier overrides when dev tools are locked", () => {
    const storage = stubRemoteWindow("?claw_plan=admin");
    storage.set("claw_dev_access_tier", "premium");

    expect(resolveAccess().tier).toBe("free");
  });

  it("allows access tier overrides only when dev tools are explicitly unlocked", () => {
    vi.stubEnv("VITE_CLAW_ACCESS_DEV_TOOLS", "1");
    vi.stubEnv("VITE_CLAW_ACCESS_TIER", "premium");

    expect(resolveAccess()).toMatchObject({
      tier: "premium",
      sourcesTried: expect.arrayContaining([expect.objectContaining({ id: "env", tier: "premium" })]),
    });
  });

  it("treats checkout-created LawDog user as existing Pro for e-sign (no new SKU)", () => {
    const storage = stubRemoteWindow();
    storage.set(
      "claw_demo_session_user_v1",
      JSON.stringify({
        v: 1,
        id: "demo_priya",
        displayName: "Priya Shah",
        email: "priya.shah.qa@example.com",
        createdAt: Date.now(),
        source: "demo_checkout",
        settlementReceiptId: "rcpt_lakjsd12_a8fu3",
      }),
    );
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
      clear: () => storage.clear(),
    } as Storage);

    const resolved = resolveAccess();
    expect(resolved.tier).toBe("free");
    expect(checkoutCreatedLawdogEsignAllowed()).toBe(true);
    expect(canUseFeature(resolved.tier, EMPTY_USAGE, "esign_flow").allowed).toBe(true);
    expect(canUseFeature(resolved.tier, EMPTY_USAGE, "signature_request").allowed).toBe(true);
    expect(resolved.tier === "premium" || resolved.tier === "admin").toBe(false);
  });

  it("leftover paid-completion marker does not raise the guest create tier", () => {
    const storage = stubRemoteWindow();
    storage.set(
      "claw_paid_premium_completion_session_v1",
      JSON.stringify({ v: 1, source: "settled_checkout", markedAt: Date.now() }),
    );
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
      clear: () => storage.clear(),
    } as Storage);
    expect(resolveAccess().tier).toBe("free");
    expect(checkoutCreatedLawdogEsignAllowed()).toBe(true);
    expect(canUseFeature("free", EMPTY_USAGE, "esign_flow").allowed).toBe(true);
  });

  it("does not grant e-sign on free when there is no checkout-created LawDog session", () => {
    const storage = stubRemoteWindow();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
      clear: () => storage.clear(),
    } as Storage);
    expect(checkoutCreatedLawdogEsignAllowed()).toBe(false);
    expect(canUseFeature("free", EMPTY_USAGE, "esign_flow").allowed).toBe(false);
    expect(canUseFeature("free", EMPTY_USAGE, "signature_request").allowed).toBe(false);
  });
});
