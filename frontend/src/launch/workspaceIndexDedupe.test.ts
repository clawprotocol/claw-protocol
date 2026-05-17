/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { dedupeWorkspaceIndexAgreements } from "./workspaceIndexDedupe";

function row(p: Partial<WorkspaceIndexAgreement>): WorkspaceIndexAgreement {
  return {
    id: "ag1",
    title: "T",
    updated_at: "2026-01-01T00:00:00Z",
    party_count: 1,
    signer_count: 1,
    version_ledger_count: 0,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: null,
    review_sent_at: null,
    ...p,
  };
}

describe("dedupeWorkspaceIndexAgreements", () => {
  it("dedupes duplicate agreement ids preferring richer row", () => {
    const out = dedupeWorkspaceIndexAgreements([
      row({ id: "ag_dup", title: "Thin", updated_at: "2026-01-02T00:00:00Z" }),
      row({
        id: "ag_dup",
        title: "Rich agreement",
        has_server_signing_lock: true,
        locked_version_id: "v1",
        updated_at: "2026-01-01T00:00:00Z",
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe("Rich agreement");
    expect(out[0]?.has_server_signing_lock).toBe(true);
  });

  it("keeps distinct agreement ids as separate cards", () => {
    const out = dedupeWorkspaceIndexAgreements([
      row({ id: "ag_a", title: "A" }),
      row({ id: "ag_b", title: "B" }),
    ]);
    expect(out).toHaveLength(2);
  });
});
