import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyReviewLinkPresentation,
  isReviewLinkPreviewOnly,
  redactReviewUrlForLog,
} from "./reviewerLinkRowModel";
import {
  EPHEMERAL_OWNER_REVIEW_COPY_LINK_TTL_MS,
  ephemeralOwnerReviewCopyLinkAgreementIds,
  readEphemeralOwnerReviewCopyLinks,
  resetEphemeralOwnerReviewCopyLinksForTests,
  writeEphemeralOwnerReviewCopyLinks,
} from "./ephemeralOwnerReviewCopyLinks";
import {
  exchangeReviewFragmentBootstrapTokenOnce,
  resetReviewFragmentBootstrapExchangeForTests,
} from "../../agreement/reviewFragmentBootstrapExchange";

describe("reviewerLinkRowModel presentation classification", () => {
  it("classifies fragment invitation as authenticated (not preview only)", () => {
    const href = "https://app.example.com/agreements/ag1/review#t=bootstrap-token-value-here";
    expect(classifyReviewLinkPresentation(href)).toBe("fragment_invitation");
    expect(isReviewLinkPreviewOnly(href)).toBe(false);
  });

  it("classifies tokenless review path as preview only", () => {
    const href = "https://app.example.com/agreements/ag1/review";
    expect(classifyReviewLinkPresentation(href)).toBe("tokenless_preview");
    expect(isReviewLinkPreviewOnly(href)).toBe(true);
  });

  it("classifies legacy query token separately from fragment invitation", () => {
    const href = "https://app.example.com/agreements/ag1/review?t=legacyquerytoken";
    expect(classifyReviewLinkPresentation(href)).toBe("legacy_query");
    expect(isReviewLinkPreviewOnly(href)).toBe(false);
  });

  it("classifies malformed fragment", () => {
    expect(classifyReviewLinkPresentation("https://app.example.com/agreements/ag1/review#bad")).toBe(
      "malformed_fragment",
    );
  });

  it("classifies unrelated fragment", () => {
    expect(classifyReviewLinkPresentation("https://app.example.com/other#t=abc12345")).toBe(
      "unrelated_fragment",
    );
  });

  it("redacts fragment tokens in logs", () => {
    const out = redactReviewUrlForLog("https://host/agreements/x/review#t=secret12345678");
    expect(out).not.toContain("secret12345678");
    expect(out.toLowerCase()).toMatch(/redacted/);
  });
});

describe("ephemeralOwnerReviewCopyLinks", () => {
  afterEach(() => {
    resetEphemeralOwnerReviewCopyLinksForTests();
  });

  it("never uses sessionStorage for credential URLs", () => {
    const setItem = vi.fn();
    vi.stubGlobal("sessionStorage", { setItem, getItem: vi.fn(), removeItem: vi.fn() } as unknown as Storage);
    writeEphemeralOwnerReviewCopyLinks({
      agreementId: "ag_test",
      recipients: [{ displayName: "R", reviewHref: "https://x/agreements/ag_test/review#t=secret" }],
    });
    expect(setItem).not.toHaveBeenCalled();
    expect(readEphemeralOwnerReviewCopyLinks("ag_test")?.recipients[0]?.reviewHref).toContain("#t=");
    expect(ephemeralOwnerReviewCopyLinkAgreementIds()).toContain("ag_test");
    vi.unstubAllGlobals();
  });

  it("expires entries after the enforced TTL", () => {
    vi.useFakeTimers();
    writeEphemeralOwnerReviewCopyLinks({
      agreementId: "ag_test",
      recipients: [{ displayName: "R", reviewHref: "https://x/review#t=secret" }],
    });
    expect(readEphemeralOwnerReviewCopyLinks("ag_test")).not.toBeNull();
    vi.advanceTimersByTime(EPHEMERAL_OWNER_REVIEW_COPY_LINK_TTL_MS + 1);
    expect(readEphemeralOwnerReviewCopyLinks("ag_test")).toBeNull();
    vi.useRealTimers();
  });
});

describe("reviewFragmentBootstrapExchange multi-link", () => {
  afterEach(() => {
    resetReviewFragmentBootstrapExchangeForTests();
    vi.unstubAllGlobals();
  });

  it("does not join a second token for the same agreement", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true, agreement_id: "ag_same" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const p1 = exchangeReviewFragmentBootstrapTokenOnce("token-alpha-long-enough", "ag_same");
    const p2 = exchangeReviewFragmentBootstrapTokenOnce("token-beta-long-enough", "ag_same");
    expect(p1).not.toBe(p2);
    await Promise.all([p1, p2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
