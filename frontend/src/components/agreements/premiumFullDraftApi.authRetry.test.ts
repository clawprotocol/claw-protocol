/** @vitest-environment jsdom */
/**
 * #232 — cold-start Northline: request start ×1 / response ×0 / OPTIONS-only.
 * Missing Bearer must hydrate then POST. AbortError / Failed to fetch before a
 * Response retries once inside the same #231 flight owner (never steal).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../auth/supabaseAuthService", () => ({
  getAuthSession: vi.fn(),
}));

import { getAuthSession } from "../../auth/supabaseAuthService";
import {
  clearCachedAccessToken,
  getCachedAccessToken,
} from "../../auth/authAccessTokenCache";
import { setOrgId } from "../../launch/orgContext";
import {
  CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
  shouldFailClosedPremiumProcessingWithoutPfd,
} from "./multiPartyCreateReviewSettle";
import {
  buildPremiumFullDraftRequestHeaders,
  isPremiumFullDraftPreResponseRetryable,
  postPremiumFullDraftOnce,
} from "./premiumFullDraftApi";
import {
  clearPremiumGenerationCallAudit,
  isEntitledPremiumRewriteHttpStarted,
  isEntitledPremiumRewriteProcessInFlight,
  releaseEntitledPremiumRewriteProcessInFlight,
  releasePremiumFullDraftCallIfHttpNeverFired,
  tryBeginEntitledPremiumRewriteProcessInFlight,
} from "./paidProPremiumGenerationCallAudit";

const minimalContext = {
  title: "T",
  jurisdiction: "TX",
  parties: [{ name: "A", role: "a" }],
  purpose: "p",
  payment_terms: "",
  duration: null as string | null,
  due_date: null as string | null,
  effective_date: null as string | null,
  agreement_family: "",
  material_asks: [] as string[],
};

function okDraftResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () =>
      JSON.stringify({
        document_text: "x".repeat(600),
        server_full_document_text: "x".repeat(600),
        generation_outcome: "ok",
      }),
  };
}

function authorizationFromInit(init?: RequestInit): string | null {
  const headers = init?.headers;
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get("Authorization");
  if (Array.isArray(headers)) {
    const row = headers.find(([key]) => key.toLowerCase() === "authorization");
    return row?.[1] ?? null;
  }
  const rec = headers as Record<string, string>;
  return rec.Authorization ?? rec.authorization ?? null;
}

describe("postPremiumFullDraftOnce auth-before-fetch + same-flight retry (#232)", () => {
  beforeEach(() => {
    localStorage.clear();
    clearCachedAccessToken();
    clearPremiumGenerationCallAudit();
    setOrgId("user-northline-232");
    vi.mocked(getAuthSession).mockReset();
    vi.mocked(getAuthSession).mockResolvedValue({
      access_token: "hydrated-northline-token",
    } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    releaseEntitledPremiumRewriteProcessInFlight();
    clearPremiumGenerationCallAudit();
    clearCachedAccessToken();
  });

  it("missing Bearer hydrates from session then POSTs with Authorization", async () => {
    expect(getCachedAccessToken()).toBe("");
    const fetchMock = vi.fn().mockResolvedValue(okDraftResponse());
    vi.stubGlobal("fetch", fetchMock);

    await postPremiumFullDraftOnce({
      intakeText: "x".repeat(80),
      context: minimalContext,
      agreementGenerationId: "gen-northline-missing-bearer",
    });

    expect(getAuthSession).toHaveBeenCalled();
    expect(getCachedAccessToken()).toBe("hydrated-northline-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authorizationFromInit(fetchMock.mock.calls[0]?.[1] as RequestInit)).toBe(
      "Bearer hydrated-northline-token",
    );
  });

  it("forces Bearer on POST even when org is local-org after storage clear", async () => {
    setOrgId("local-org");
    const fetchMock = vi.fn().mockResolvedValue(okDraftResponse());
    vi.stubGlobal("fetch", fetchMock);

    await postPremiumFullDraftOnce({
      intakeText: "x".repeat(80),
      context: minimalContext,
    });

    expect(authorizationFromInit(fetchMock.mock.calls[0]?.[1] as RequestInit)).toBe(
      "Bearer hydrated-northline-token",
    );
  });

  it("buildPremiumFullDraftRequestHeaders uses the hydrated token when sync cache is empty", () => {
    clearCachedAccessToken();
    setOrgId("local-org");
    const headers = buildPremiumFullDraftRequestHeaders("refreshed-but-uncached") as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer refreshed-but-uncached");
  });

  it("empty first session read retries refresh then POSTs", async () => {
    vi.mocked(getAuthSession)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        access_token: "hydrated-on-second-read",
      } as never);
    const fetchMock = vi.fn().mockResolvedValue(okDraftResponse());
    vi.stubGlobal("fetch", fetchMock);

    await postPremiumFullDraftOnce({
      intakeText: "x".repeat(80),
      context: minimalContext,
    });

    expect(getAuthSession).toHaveBeenCalledTimes(2);
    expect(authorizationFromInit(fetchMock.mock.calls[0]?.[1] as RequestInit)).toBe(
      "Bearer hydrated-on-second-read",
    );
  });

  it("AbortError before response re-hydrates and POSTs once inside the same flight", async () => {
    expect(
      tryBeginEntitledPremiumRewriteProcessInFlight({
        agreementGenerationId: "gen-northline-abort-retry",
      }),
    ).toBe(true);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("The operation was aborted.", "AbortError"))
      .mockResolvedValueOnce(okDraftResponse());
    vi.stubGlobal("fetch", fetchMock);

    await postPremiumFullDraftOnce({
      intakeText: "x".repeat(80),
      context: minimalContext,
      agreementGenerationId: "gen-northline-abort-retry",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authorizationFromInit(fetchMock.mock.calls[0]?.[1] as RequestInit)).toBe(
      "Bearer hydrated-northline-token",
    );
    expect(authorizationFromInit(fetchMock.mock.calls[1]?.[1] as RequestInit)).toBe(
      "Bearer hydrated-northline-token",
    );
    expect(isEntitledPremiumRewriteProcessInFlight()).toBe(true);
    expect(isEntitledPremiumRewriteHttpStarted()).toBe(true);
    expect(
      tryBeginEntitledPremiumRewriteProcessInFlight({ agreementGenerationId: "gen-steal" }),
    ).toBe(false);
    expect(
      releasePremiumFullDraftCallIfHttpNeverFired({
        agreementGenerationId: "gen-northline-abort-retry",
      }),
    ).toBe(false);
  });

  it("Failed to fetch before response retries once in-flight then POSTs", async () => {
    expect(
      tryBeginEntitledPremiumRewriteProcessInFlight({
        agreementGenerationId: "gen-northline-failed-fetch",
      }),
    ).toBe(true);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(okDraftResponse());
    vi.stubGlobal("fetch", fetchMock);

    await postPremiumFullDraftOnce({
      intakeText: "x".repeat(80),
      context: minimalContext,
      agreementGenerationId: "gen-northline-failed-fetch",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(isEntitledPremiumRewriteHttpStarted()).toBe(true);
    expect(
      tryBeginEntitledPremiumRewriteProcessInFlight({ agreementGenerationId: "gen-steal-2" }),
    ).toBe(false);
  });

  it("does not retry when the caller abort signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postPremiumFullDraftOnce({
        intakeText: "x".repeat(80),
        context: minimalContext,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("classifies AbortError/Failed-to-fetch as pre-response retryable and caller abort as not", () => {
    expect(isPremiumFullDraftPreResponseRetryable(new TypeError("Failed to fetch"))).toBe(true);
    expect(
      isPremiumFullDraftPreResponseRetryable(new DOMException("aborted", "AbortError")),
    ).toBe(true);
    const controller = new AbortController();
    controller.abort();
    expect(
      isPremiumFullDraftPreResponseRetryable(
        new DOMException("aborted", "AbortError"),
        controller.signal,
      ),
    ).toBe(false);
  });

  it("#226 named-2p no-pfd bound and pfdHttpCompleted short-circuit stay unchanged", () => {
    expect(CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS).toBe(60_000);
    expect(
      shouldFailClosedPremiumProcessingWithoutPfd({
        ordinaryNamedTwoPartyReady: true,
        premiumPostCheckoutProcessing: true,
        pfdHttpCompleted: false,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
      }),
    ).toBe(true);
    expect(
      shouldFailClosedPremiumProcessingWithoutPfd({
        ordinaryNamedTwoPartyReady: true,
        premiumPostCheckoutProcessing: true,
        pfdHttpCompleted: true,
        preparingStartedAtMs: 1_000,
        nowMs: 1_000 + CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
      }),
    ).toBe(false);
  });
});
