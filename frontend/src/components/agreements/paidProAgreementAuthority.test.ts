import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPaidPremiumCompletionSession,
  markPaidPremiumCompletionSession,
} from "./premiumCompletionStorage";
import { isPaidProAgreementAuthoritative, resolvePaidProAgreementAuthoritative } from "./paidProAgreementAuthority";

describe("isPaidProAgreementAuthoritative", () => {
  const sessionStore = new Map<string, string>();
  beforeEach(() => {
    sessionStore.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => (sessionStore.has(k) ? sessionStore.get(k)! : null),
      setItem: (k: string, v: string) => void sessionStore.set(k, v),
      removeItem: (k: string) => void sessionStore.delete(k),
    } as Storage);
    vi.stubGlobal("window", { location: { href: "https://example.test/app/create" } } as unknown as Window & typeof globalThis);
  });
  afterEach(() => {
    clearPaidPremiumCompletionSession();
    vi.unstubAllGlobals();
  });

  it("true for strict server render source without long corpus", () => {
    expect(
      isPaidProAgreementAuthoritative({
        draft: { premium_render_source: "server_full_document_text", purpose: "short" },
        includeLocalCompletionMarker: false,
      }),
    ).toBe(true);
  });

  it("true for long server_full_document_text without render source", () => {
    const body = "z".repeat(520);
    expect(
      isPaidProAgreementAuthoritative({
        draft: { premium_render_source: "", server_full_document_text: body },
        includeLocalCompletionMarker: false,
      }),
    ).toBe(true);
  });

  it("true when paid premium completion session marker is set", () => {
    markPaidPremiumCompletionSession();
    expect(isPaidProAgreementAuthoritative({ draft: null, includeLocalCompletionMarker: false })).toBe(true);
  });

  it("resolvePaidProAgreementAuthoritative returns stable reason for corpus", () => {
    const body = "a".repeat(600);
    const r = resolvePaidProAgreementAuthoritative({
      draft: { premium_full_document_text: body },
      includeLocalCompletionMarker: false,
    });
    expect(r.authoritative).toBe(true);
    expect(r.reason).toBe("long_authoritative_corpus");
    expect(r.corpusLen).toBe(600);
  });
});
