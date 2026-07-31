import { describe, expect, it } from "vitest";
import {
  adminConsoleGenesisTargetId,
  adminConsoleUserMatchesQuery,
  filterAdminConsoleUsers,
  normalizeAdminConsoleUser,
} from "./adminConsoleUsers";

describe("adminConsoleUsers", () => {
  const opaque = normalizeAdminConsoleUser({
    id: "org:user-abc-123",
    org_id: "org:user-abc-123",
    user_id: "abc-123",
    email: null,
    display_name: null,
    plan_type: "free",
  });

  const identified = normalizeAdminConsoleUser({
    id: "org:user-uid-21",
    org_id: "org:user-uid-21",
    user_id: "uid-21",
    email: "cryptocurated21@example.com",
    display_name: "Crypto Curated",
    plan_type: "free",
    agreement_count: 2,
  });

  it("normalizes safe identity fields from admin users payload", () => {
    expect(identified.email).toBe("cryptocurated21@example.com");
    expect(identified.userId).toBe("uid-21");
    expect(identified.displayName).toBe("Crypto Curated");
    expect(identified.orgId).toBe("org:user-uid-21");
  });

  it("matches search by email, display name, user id, or org id", () => {
    expect(adminConsoleUserMatchesQuery(identified, "cryptocurated21")).toBe(true);
    expect(adminConsoleUserMatchesQuery(identified, "Crypto Curated")).toBe(true);
    expect(adminConsoleUserMatchesQuery(identified, "uid-21")).toBe(true);
    expect(adminConsoleUserMatchesQuery(identified, "org:user-uid-21")).toBe(true);
    expect(adminConsoleUserMatchesQuery(opaque, "abc-123")).toBe(true);
    expect(adminConsoleUserMatchesQuery(identified, "nobody")).toBe(false);
  });

  it("matches exact email including Gmail plus-aliases", () => {
    const plusAlias = normalizeAdminConsoleUser({
      id: "org:user-uid-plus",
      org_id: "org:user-uid-plus",
      user_id: "uid-plus",
      email: "founder+staging@gmail.com",
      display_name: "Founder",
      plan_type: "free",
    });
    expect(adminConsoleUserMatchesQuery(plusAlias, "founder+staging@gmail.com")).toBe(true);
    expect(adminConsoleUserMatchesQuery(plusAlias, "Founder+Staging@gmail.com")).toBe(true);
    expect(adminConsoleUserMatchesQuery(plusAlias, "founder@gmail.com")).toBe(false);
    expect(adminConsoleUserMatchesQuery(plusAlias, "staging@gmail.com")).toBe(false);
    expect(adminConsoleUserMatchesQuery(identified, "cryptocurated21@example.com")).toBe(true);
  });

  it("filters the users list without dropping identity when query empty", () => {
    const rows = [opaque, identified];
    expect(filterAdminConsoleUsers(rows, "").length).toBe(2);
    expect(filterAdminConsoleUsers(rows, "cryptocurated21")).toEqual([identified]);
    expect(filterAdminConsoleUsers(rows, "cryptocurated21@example.com")).toEqual([identified]);
  });

  it("prefers stable user_id for Genesis grant target", () => {
    expect(adminConsoleGenesisTargetId(identified)).toBe("uid-21");
    expect(adminConsoleGenesisTargetId(opaque)).toBe("abc-123");
  });
});
