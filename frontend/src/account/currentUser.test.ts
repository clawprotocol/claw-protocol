import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isAuthenticatedDashboardSurface,
  isDashboardAccountSurface,
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
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not treat org context as authentication", () => {
    const user = resolveCurrentUser();
    expect(user.isAuthenticated).toBe(false);
    expect(user.source).toBe("anonymous");
    expect(user.id).toBe("anonymous");
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
    expect(isAuthenticatedDashboardSurface("/app/create")).toBe(false);
    expect(isDashboardAccountSurface("/app/create")).toBe(true);
  });

  it("does not treat public reviewer links as dashboard surfaces", () => {
    expect(isPublicTokenAgreementSurface("/agreements/ag_123/review")).toBe(true);
    expect(isAuthenticatedDashboardSurface("/agreements/ag_123/review")).toBe(false);
  });
});
