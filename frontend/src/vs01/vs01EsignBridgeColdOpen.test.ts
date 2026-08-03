/** @vitest-environment jsdom */
/**
 * Cold-open `/app/esign/{doc_*}?agreement_bridge=1` when document meta + content APIs
 * both succeed must not surface "Could not load this document" due to auth-token race.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldDeferVs01SeedDocumentLoad } from "./vs01SeedDocumentAuthGate";
import * as tokenCache from "../auth/authAccessTokenCache";
import { setOrgId } from "../launch/orgContext";

const DOC_ID = "doc_cc329acefb91439380757bc0e9bb9cab";

describe("esign bridge cold-open (agreement_bridge=1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("wizard gates seed fetch on auth loading and refreshes token before content GET", () => {
    const wizard = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    expect(wizard).toContain("shouldDeferVs01SeedDocumentLoad");
    expect(wizard).toContain("authLoading");
    expect(wizard).toContain("useAuth");
    const api = readFileSync(join(__dirname, "vs01Api.ts"), "utf8");
    expect(api).toContain("refreshCachedAccessToken");
    const fnStart = api.indexOf("export async function fetchDocumentContent");
    const fnBody = api.slice(fnStart, fnStart + 900);
    expect(fnBody.indexOf("refreshCachedAccessToken")).toBeLessThan(fnBody.indexOf("clawAgreementHeaders"));
  });

  it("when auth is still loading, content GET is deferred even if APIs would return 200", () => {
    expect(shouldDeferVs01SeedDocumentLoad({ authEnabled: true, authLoading: true })).toBe(true);
  });

  it("after auth settles, fetchDocumentContent refreshes cache then loads PDF when GET content is 200", async () => {
    setOrgId("user-eb72e4d2-c803-490d-80ee-d17634b8ebfb");
    tokenCache.setCachedAccessToken("");
    const refreshSpy = vi
      .spyOn(tokenCache, "refreshCachedAccessToken")
      .mockImplementation(async () => {
        tokenCache.setCachedAccessToken("access-token-from-session");
        return "access-token-from-session";
      });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain(`/v1/documents/${encodeURIComponent(DOC_ID)}/content`);
      expect(refreshSpy).toHaveBeenCalled();
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer access-token-from-session");
      expect(headers.get("X-Claw-Org-Id")).toBe("user-eb72e4d2-c803-490d-80ee-d17634b8ebfb");
      return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchDocumentContent } = await import("./vs01Api");
    const blob = await fetchDocumentContent(DOC_ID);
    expect(blob.size).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Cold-open success model: meta + content 200 ⇒ no load-failure banner.
    const metaOk = {
      status: 200,
      owner_org_id: "user-eb72e4d2-c803-490d-80ee-d17634b8ebfb",
    };
    const deferred = shouldDeferVs01SeedDocumentLoad({ authEnabled: true, authLoading: false });
    const wouldShowCouldNotLoad = deferred || metaOk.status !== 200 || blob.size === 0;
    expect(wouldShowCouldNotLoad).toBe(false);
  });
});
