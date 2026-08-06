import { describe, expect, it } from "vitest";
import {
  normalizeAdminConsoleUserHistoryAction,
  presentAdminConsoleUserHistoryAction,
} from "./adminConsoleUserHistory";

describe("adminConsoleUserHistory", () => {
  it("presents Genesis monthly usage reset with used delta and reason", () => {
    const action = normalizeAdminConsoleUserHistoryAction({
      id: "a1",
      action_type: "genesis_usage_reconcile",
      reason: "Reset Genesis Dog 5 Monthly Allowance for Testing",
      admin_user_id: "ops_admin",
      actor_role: "admin",
      created_at: "2026-08-06T16:38:00Z",
      agreements_used_before: 5,
      agreements_used_after: 0,
      refunded_count: 5,
      dry_run: false,
    });
    const p = presentAdminConsoleUserHistoryAction(action);
    expect(p.title).toBe("Reset Genesis monthly usage");
    expect(p.detailLine).toContain("used 5 → 0");
    expect(p.detailLine).toContain("refunded 5 meter rows");
    expect(p.detailLine).toContain("Reset Genesis Dog 5 Monthly Allowance for Testing");
    expect(p.metaLine).toContain("by ops_admin");
  });

  it("labels grant and revoke distinctly", () => {
    expect(
      presentAdminConsoleUserHistoryAction(
        normalizeAdminConsoleUserHistoryAction({
          id: "g1",
          action_type: "genesis_entitlement_grant",
          reason: "staging acceptance grant",
          admin_user_id: "ops",
          created_at: "2026-08-01T12:00:00Z",
        }),
      ).title,
    ).toBe("Grant Genesis Dog");
    expect(
      presentAdminConsoleUserHistoryAction(
        normalizeAdminConsoleUserHistoryAction({
          id: "r1",
          action_type: "genesis_entitlement_revoke",
          reason: "revoke test",
          admin_user_id: "ops",
          created_at: "2026-08-01T12:00:00Z",
        }),
      ).title,
    ).toBe("Revoke Genesis Dog");
  });
});
