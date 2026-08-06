import { describe, expect, it } from "vitest";
import { presentAdminConsoleAccess, resolveAdminConsoleAccessType } from "./adminConsoleUserAccess";

describe("adminConsoleUserAccess", () => {
  it("resolves Genesis Dog from commercial_state even when plan_type is free", () => {
    expect(
      resolveAdminConsoleAccessType({
        commercialState: "genesis",
        planType: "free",
        premiumActive: false,
      }),
    ).toBe("genesis_dog");
  });

  it("resolves Paid Pro from commercial_state or premium flag", () => {
    expect(
      resolveAdminConsoleAccessType({
        commercialState: "pro",
        planType: "pro",
        premiumActive: true,
      }),
    ).toBe("paid_pro");
    expect(
      resolveAdminConsoleAccessType({
        commercialState: null,
        planType: "pro",
        premiumActive: true,
      }),
    ).toBe("paid_pro");
  });

  it("presents Genesis Dog badge with monthly remaining quota", () => {
    const p = presentAdminConsoleAccess({
      accessType: "genesis_dog",
      commercialState: "genesis",
      planType: "free",
      premiumActive: false,
      agreementAllowance: 5,
      agreementsUsed: 5,
      agreementsRemaining: 0,
      periodEndsAt: "2026-08-31T23:59:59Z",
    });
    expect(p.badgeLabel).toBe("Genesis Dog");
    expect(p.tone).toBe("genesis");
    expect(p.detailLine).toContain("0 of 5 new agreements remaining this month");
    expect(p.detailLine).toMatch(/Resets/);
  });

  it("presents Paid LawDog Pro distinctly from Genesis", () => {
    const p = presentAdminConsoleAccess({
      commercialState: "pro",
      planType: "pro",
      premiumActive: true,
      agreementAllowance: 25,
      agreementsUsed: 3,
      agreementsRemaining: 22,
    });
    expect(p.badgeLabel).toBe("Paid LawDog Pro");
    expect(p.tone).toBe("pro");
    expect(p.detailLine).toContain("22 of 25");
  });

  it("labels free accounts without paid or Genesis access", () => {
    const p = presentAdminConsoleAccess({
      commercialState: "none",
      planType: "free",
      premiumActive: false,
      agreementAllowance: 0,
      agreementsUsed: 0,
      agreementsRemaining: 0,
    });
    expect(p.badgeLabel).toBe("Free (no paid access)");
    expect(p.accessType).toBe("free");
  });
});
