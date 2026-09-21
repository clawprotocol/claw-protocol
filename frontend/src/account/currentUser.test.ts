import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  bindResolvedAuthLifecycle,
  isAuthenticatedDashboardSurface,
  isDashboardAccountSurface,
  isJwtAccessToken,
  isPublicTokenAgreementSurface,
  resolveCurrentUser,
} from "./currentUser";

describe("currentUser adapter", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    });
  });
  afterEach(() => {
    bindResolvedAuthLifecycle(null);
    vi.unstubAllGlobals();
  });

  it("does not treat org context as authentication", () => {
    const user = resolveCurrentUser();
    expect(user.isAuthenticated).toBe(false);
    expect(user.source).toBe("anonymous");
    expect(user.id).toBe("anonymous");
  });

  function memoryStorage(initial: Record<string, string> = {}) {
    const data: Record<string, string> = { ...initial };
    return {
      getItem: (key: string) => (key in data ? data[key] : null),
      setItem: (key: string, value: string) => {
        data[key] = value;
      },
      removeItem: (key: string) => {
        delete data[key];
      },
      clear: () => {
        for (const key of Object.keys(data)) delete data[key];
      },
    };
  }

  function persistSession(storage: ReturnType<typeof memoryStorage>, args: {
    id: string;
    accessToken?: string | null;
    expiresAt?: number | null;
  }) {
    const body: Record<string, unknown> = {
      user: { id: args.id, email: `${args.id}@example.com`, user_metadata: { full_name: args.id } },
    };
    if (args.accessToken !== undefined) body.access_token = args.accessToken;
    if (args.expiresAt !== undefined) body.expires_at = args.expiresAt;
    storage.setItem("sb-127-auth-token", JSON.stringify(body));
  }

  it("does not authenticate stored identity or arbitrary token text", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:4190/__supabase");
    const storage = memoryStorage();
    persistSession(storage, {
      id: "stored-only-user",
      accessToken: "arbitrary-not-a-jwt",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    vi.stubGlobal("localStorage", storage);
    expect(resolveCurrentUser().isAuthenticated).toBe(false);
    bindResolvedAuthLifecycle({
      status: "authenticated",
      accessToken: "arbitrary-not-a-jwt",
      userId: "stored-only-user",
    });
    expect(isJwtAccessToken("arbitrary-not-a-jwt")).toBe(false);
    expect(resolveCurrentUser().isAuthenticated).toBe(false);
    vi.unstubAllEnvs();
  });

  it("uses the resolved authenticated session, not leftover storage, as authority", () => {
    const jwt = "aaa.bbb.ccc";
    bindResolvedAuthLifecycle({
      status: "authenticated",
      accessToken: jwt,
      userId: "session-owner",
      email: "owner@example.com",
    });
    const storage = memoryStorage();
    persistSession(storage, {
      id: "stale-stored-user",
      accessToken: jwt,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    vi.stubGlobal("localStorage", storage);
    const user = resolveCurrentUser({ supabaseUserId: null });
    expect(user.isAuthenticated).toBe(true);
    expect(user.id).toBe("session-owner");
  });

  it("covers loading, refresh failure, logout, and account switch through the lifecycle", () => {
    bindResolvedAuthLifecycle({ status: "loading" });
    expect(resolveCurrentUser().isAuthenticated).toBe(false);

    bindResolvedAuthLifecycle({
      status: "authenticated",
      accessToken: "aaa.bbb.ccc",
      userId: "owner-a",
    });
    expect(resolveCurrentUser().id).toBe("owner-a");

    bindResolvedAuthLifecycle({ status: "refresh_failed", userId: "owner-a" });
    expect(resolveCurrentUser({ supabaseUserId: null }).isAuthenticated).toBe(false);

    bindResolvedAuthLifecycle({
      status: "authenticated",
      accessToken: "ddd.eee.fff",
      userId: "owner-b",
    });
    expect(resolveCurrentUser().id).toBe("owner-b");

    bindResolvedAuthLifecycle({ status: "signed_out" });
    const storage = memoryStorage();
    persistSession(storage, {
      id: "owner-b",
      accessToken: "ddd.eee.fff",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    vi.stubGlobal("localStorage", storage);
    expect(resolveCurrentUser({ supabaseUserId: null }).isAuthenticated).toBe(false);
    expect(resolveCurrentUser({ supabaseUserId: "owner-b" }).isAuthenticated).toBe(false);
  });

  it("accepts validated supabase session as authenticated", () => {
    const user = resolveCurrentUser({
      supabaseUserId: "user-123",
      supabaseEmail: "owner@example.com",
      supabaseDisplayName: "Owner",
    });
    expect(user.isAuthenticated).toBe(true);
    expect(user.id).toBe("user-123");
    expect(user.source).toBe("supabase_session");
  });

  it("identifies authenticated dashboard surfaces", () => {
    expect(isAuthenticatedDashboardSurface("/app")).toBe(true);
    expect(isAuthenticatedDashboardSurface("/dashboard")).toBe(true);
    expect(isAuthenticatedDashboardSurface("/app/create")).toBe(true);
    expect(isAuthenticatedDashboardSurface("/app/signatures")).toBe(true);
    expect(isDashboardAccountSurface("/app/create")).toBe(true);
  });

  it.each([
    "/app/signing-status/ag_123",
    "/app/verification/ag_123",
    "/app/field-review/analysis_123",
    "/app/receipts/usage_123",
  ])("protects owner and paid workspace route %s", (path) => {
    expect(isAuthenticatedDashboardSurface(path)).toBe(true);
  });

  it("does not treat public reviewer links as dashboard surfaces", () => {
    expect(isPublicTokenAgreementSurface("/agreements/ag_123/review")).toBe(true);
    expect(isPublicTokenAgreementSurface("/agreements/ag_123/sign")).toBe(true);
    expect(isPublicTokenAgreementSurface("/verify/ag_123")).toBe(true);
    expect(isPublicTokenAgreementSurface("/app/verify/ag_123")).toBe(true);
    expect(isAuthenticatedDashboardSurface("/agreements/ag_123/review")).toBe(false);
    expect(isAuthenticatedDashboardSurface("/agreements/ag_123/sign")).toBe(false);
    expect(isAuthenticatedDashboardSurface("/verify/ag_123")).toBe(false);
    expect(isAuthenticatedDashboardSurface("/app/verify/ag_123")).toBe(false);
    expect(isAuthenticatedDashboardSurface("/app/verification/ag_123")).toBe(true);
  });

  it("classifies /app/esign/:documentId by query, not path alone", () => {
    expect(isPublicTokenAgreementSurface("/app/esign/doc_abc")).toBe(false);
    expect(isAuthenticatedDashboardSurface("/app/esign/doc_abc")).toBe(false);
    expect(isPublicTokenAgreementSurface("/app/esign/doc_abc", "?agreement_bridge=1")).toBe(false);
    expect(isAuthenticatedDashboardSurface("/app/esign/doc_abc", "?agreement_bridge=1")).toBe(true);
    expect(isPublicTokenAgreementSurface("/app/esign/doc_abc", "?vs01_recipient_sign=1")).toBe(true);
    expect(isAuthenticatedDashboardSurface("/app/esign/doc_abc", "?vs01_recipient_sign=1")).toBe(false);
  });

  it("recognizes a legacy recipient token in first query position", () => {
    expect(isPublicTokenAgreementSurface("/app/agreements/ag_123", "?token=secret")).toBe(true);
    expect(isPublicTokenAgreementSurface("/app/agreements/ag_123", "?t=secret&return=1")).toBe(true);
    expect(isPublicTokenAgreementSurface("/app/agreements/ag_123", "?token=")).toBe(false);
  });
});
