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
    expect(isAuthenticatedDashboardSurface("/app/create")).toBe(true);
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
