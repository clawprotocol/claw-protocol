import { describe, expect, it } from "vitest";
import {
  isDashboardAccountSurface,
  isPublicTokenAgreementSurface,
  resolveCurrentUser,
} from "./currentUser";

describe("currentUser adapter", () => {
  it("resolves local dev user from org context", () => {
    const user = resolveCurrentUser();
    expect(user.isAuthenticated).toBe(true);
    expect(user.id.length).toBeGreaterThan(0);
  });

  it("identifies dashboard surfaces", () => {
    expect(isDashboardAccountSurface("/app")).toBe(true);
    expect(isDashboardAccountSurface("/dashboard")).toBe(true);
    expect(isDashboardAccountSurface("/app/create")).toBe(true);
  });

  it("does not treat public reviewer links as dashboard surfaces", () => {
    expect(isPublicTokenAgreementSurface("/agreements/ag_123/review")).toBe(true);
    expect(isDashboardAccountSurface("/agreements/ag_123/review")).toBe(false);
  });
});
