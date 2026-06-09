import { describe, expect, it } from "vitest";
import {
  mapSupabaseAgreementRowToDashboardCard,
  mergeSupabaseRowsWithWorkspaceIndex,
} from "./supabaseDashboardAdapter";
import { isSupabaseBrowserConfigured, resetSupabaseBrowserClientForTests } from "./supabaseClient";

describe("supabaseDashboardAdapter", () => {
  it("maps agreement rows to dashboard cards with party counts", () => {
    const card = mapSupabaseAgreementRowToDashboardCard(
      {
        id: "ag_1",
        organization_id: "local-org",
        title: "Services Agreement",
        created_at: "2026-05-01T12:00:00.000Z",
        updated_at: "2026-05-02T12:00:00.000Z",
        review_sent_at: null,
        workspace_archived_at: null,
      },
      [
        { agreement_id: "ag_1", display_name: "Blue Canyon LLC", role: "signer" },
        { agreement_id: "ag_1", display_name: "Iron Vale Inc", role: "signer" },
      ],
    );
    expect(card.id).toBe("ag_1");
    expect(card.title).toBe("Services Agreement");
    expect(card.party_count).toBe(2);
    expect(card.signer_count).toBe(2);
    expect(card.updated_at).toBe("2026-05-02T12:00:00.000Z");
  });

  it("merge keeps Agreement #1 after refresh when only remote row exists", () => {
    const merged = mergeSupabaseRowsWithWorkspaceIndex(
      [
        {
          id: "ag_1",
          organization_id: "local-org",
          title: "Agreement #1",
          created_at: "2026-05-01T12:00:00.000Z",
          updated_at: "2026-05-01T12:00:00.000Z",
        },
      ],
      [],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("ag_1");
    expect(merged[0]?.title).toBe("Agreement #1");
  });
});

describe("supabaseClient local fallback", () => {
  it("is not configured without VITE_SUPABASE_* env vars in test", () => {
    resetSupabaseBrowserClientForTests();
    expect(isSupabaseBrowserConfigured()).toBe(false);
  });
});
