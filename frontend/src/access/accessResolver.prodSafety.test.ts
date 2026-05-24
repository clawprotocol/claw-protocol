import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAccess } from "./accessResolver";

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
});
