import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePaidProAgreementAuthoritative } from "./paidProAgreementAuthority";
import {
  markPaidPremiumCompletionSession,
  markPremiumCompletionDoneInLocalStorage,
} from "./premiumCompletionStorage";

describe("paid Pro agreement authority production safety", () => {
  const sessionStore = new Map<string, string>();
  const localStore = new Map<string, string>();

  function stubBrowser(href = "https://app.lawdog.ai/app/create") {
    vi.stubGlobal("window", {
      location: { href },
    } as unknown as Window & typeof globalThis);
  }

  beforeEach(() => {
    sessionStore.clear();
    localStore.clear();
    vi.stubEnv("PROD", true);
    vi.stubEnv("DEV", false);
    stubBrowser();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => sessionStore.get(key) ?? null,
      setItem: (key: string, value: string) => void sessionStore.set(key, value),
      removeItem: (key: string) => void sessionStore.delete(key),
    } as Storage);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => localStore.get(key) ?? null,
      setItem: (key: string, value: string) => void localStore.set(key, value),
      removeItem: (key: string) => void localStore.delete(key),
    } as Storage);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does not grant paid authority from premiumCompletion query alone", () => {
    stubBrowser("https://app.lawdog.ai/app/create?premiumCompletion=1");

    expect(resolvePaidProAgreementAuthoritative({ draft: null }).authoritative).toBe(false);
  });

  it("does not grant paid authority from the legacy localStorage completion marker in production", () => {
    markPremiumCompletionDoneInLocalStorage();

    expect(resolvePaidProAgreementAuthoritative({ draft: null }).authoritative).toBe(false);
  });

  it("still honors the stored paid checkout session marker used after settlement", () => {
    markPaidPremiumCompletionSession();

    expect(resolvePaidProAgreementAuthoritative({ draft: null })).toMatchObject({
      authoritative: true,
      reason: "paid_premium_completion_session",
    });
  });
});
