import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyFetchAgreementDraftFailure,
  fetchAgreementDraft,
} from "./agreementWorkspaceApi";

describe("classifyFetchAgreementDraftFailure", () => {
  it("keeps HTTP, network, and normalize failures distinct", () => {
    expect(classifyFetchAgreementDraftFailure({ missingId: true })).toBe("missing_id");
    expect(classifyFetchAgreementDraftFailure({ network: true })).toBe("network");
    expect(classifyFetchAgreementDraftFailure({ normalizeFailed: true })).toBe("normalize_failed");
    expect(classifyFetchAgreementDraftFailure({ status: 401 })).toBe("http_401");
    expect(classifyFetchAgreementDraftFailure({ status: 403 })).toBe("http_403");
    expect(classifyFetchAgreementDraftFailure({ status: 404 })).toBe("http_404");
    expect(classifyFetchAgreementDraftFailure({ status: 500 })).toBe("http_5xx");
    expect(classifyFetchAgreementDraftFailure({ status: 418 })).toBe("http_other");
  });
});

describe("fetchAgreementDraft", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports sanitized HTTP rejection instead of collapsing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ detail: "not used" }),
      })) as unknown as typeof fetch,
    );
    const r = await fetchAgreementDraft("ag-x");
    expect(r).toEqual({ ok: false, draft: null, status: 401, error: "http_401" });
  });

  it("reports network failure separately from HTTP rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    );
    const r = await fetchAgreementDraft("ag-x");
    expect(r).toEqual({ ok: false, draft: null, error: "network" });
  });
});
