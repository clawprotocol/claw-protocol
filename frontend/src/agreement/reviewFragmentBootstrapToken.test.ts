import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getReviewFragmentBootstrapMetadata,
  resetReviewFragmentBootstrapTokenMemoForTests,
  takeReviewFragmentBootstrapTokenOnce,
} from "./reviewFragmentBootstrapToken";
import {
  exchangeReviewFragmentBootstrapTokenOnce,
  resetReviewFragmentBootstrapExchangeForTests,
} from "./reviewFragmentBootstrapExchange";

describe("reviewFragmentBootstrapToken", () => {
  afterEach(() => {
    resetReviewFragmentBootstrapTokenMemoForTests();
    resetReviewFragmentBootstrapExchangeForTests();
    vi.unstubAllGlobals();
  });

  it("removes fragment immediately and returns token once", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: {
        pathname: "/agreements/ag_test/review",
        search: "",
        hash: "#t=bootstrap-token-value",
      },
      history: { replaceState },
    } as unknown as Window & typeof globalThis);

    expect(takeReviewFragmentBootstrapTokenOnce()).toBe("bootstrap-token-value");
    expect(replaceState).toHaveBeenCalledWith({}, "", "/agreements/ag_test/review");
    expect(takeReviewFragmentBootstrapTokenOnce()).toBeNull();
    expect(getReviewFragmentBootstrapMetadata()?.fragmentRemoved).toBe(true);
  });

  it("supports trailing-slash review path and strips fragment immediately", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: {
        pathname: "/agreements/ag_test/review/",
        search: "",
        hash: "#t=bootstrap-token-value",
      },
      history: { replaceState },
    } as unknown as Window & typeof globalThis);

    expect(takeReviewFragmentBootstrapTokenOnce()).toBe("bootstrap-token-value");
    expect(replaceState).toHaveBeenCalledWith({}, "", "/agreements/ag_test/review/");
    expect(getReviewFragmentBootstrapMetadata()?.agreementIdFromPath).toBe("ag_test");
  });
});

describe("reviewFragmentBootstrapExchange", () => {
  afterEach(() => {
    resetReviewFragmentBootstrapExchangeForTests();
    vi.unstubAllGlobals();
  });

  it("dedupes exchange under React StrictMode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true, agreement_id: "ag_test" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const p1 = exchangeReviewFragmentBootstrapTokenOnce("tok", "ag_test");
    const p2 = exchangeReviewFragmentBootstrapTokenOnce("tok", "ag_test");
    expect(p1).toBe(p2);
    await p1;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("starts separate exchanges for different agreement/token pairs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true, agreement_id: "ag_a" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const p1 = exchangeReviewFragmentBootstrapTokenOnce("tok-a", "ag_a");
    const p2 = exchangeReviewFragmentBootstrapTokenOnce("tok-b", "ag_b");
    expect(p1).not.toBe(p2);
    await Promise.all([p1, p2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
