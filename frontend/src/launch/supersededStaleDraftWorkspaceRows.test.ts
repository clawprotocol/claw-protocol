/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { PAID_PRO_VS01_POST_SIGN_SESSION_KEY } from "../vs01/vs01PaidProPostSignHandoff";
import { filterCreatorDashboardAgreements } from "./creatorDashboardAgreementFilter";
import {
  filterSupersededStaleDraftWorkspaceRows,
  isSupersededStaleDraftWorkspaceRow,
} from "./supersededStaleDraftWorkspaceRows";
import { dedupeWorkspaceIndexAgreements } from "./workspaceIndexDedupe";

function row(p: Partial<WorkspaceIndexAgreement>): WorkspaceIndexAgreement {
  return {
    id: "ag_default",
    title: "Services Agreement",
    updated_at: "2026-06-17T12:00:00.000Z",
    party_count: 2,
    signer_count: 2,
    version_ledger_count: 1,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: null,
    review_sent_at: null,
    ...p,
  };
}

describe("supersededStaleDraftWorkspaceRows", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("hides stale draft duplicate when a completed agreement shares the title", () => {
    const completed = row({
      id: "ag_completed",
      completed_signed: true,
      has_server_signing_lock: true,
      review_sent_at: "2026-06-17T10:00:00.000Z",
    });
    const staleDraft = row({
      id: "ag_stale_draft",
      title: "Services Agreement",
      updated_at: "2026-06-17T12:00:00.000Z",
    });
    const rows = [completed, staleDraft];

    expect(isSupersededStaleDraftWorkspaceRow(staleDraft, rows)).toBe(true);
    expect(isSupersededStaleDraftWorkspaceRow(completed, rows)).toBe(false);
    expect(filterSupersededStaleDraftWorkspaceRows(rows).map((r) => r.id)).toEqual(["ag_completed"]);
  });

  it("keeps a newer real draft with the same title as an older completed agreement", () => {
    const completed = row({
      id: "ag_completed",
      completed_signed: true,
      updated_at: "2026-06-01T00:00:00.000Z",
    });
    const newDraft = row({
      id: "ag_new_draft",
      title: "Services Agreement",
      updated_at: "2026-06-17T12:00:00.000Z",
    });
    const rows = [completed, newDraft];

    expect(isSupersededStaleDraftWorkspaceRow(newDraft, rows)).toBe(false);
    expect(filterSupersededStaleDraftWorkspaceRows(rows)).toHaveLength(2);
  });

  it("keeps in-review drafts even when a completed agreement shares the title", () => {
    const completed = row({ id: "ag_completed", completed_signed: true });
    const reviewing = row({
      id: "ag_review",
      review_sent_at: "2026-06-17T09:00:00.000Z",
    });
    const rows = [completed, reviewing];

    expect(isSupersededStaleDraftWorkspaceRow(reviewing, rows)).toBe(false);
  });

  it("uses session handoff agreement id to suppress the non-canonical draft duplicate", () => {
    sessionStorage.setItem(
      PAID_PRO_VS01_POST_SIGN_SESSION_KEY,
      JSON.stringify({ v: 1, agreementId: "ag_completed", vs01DocumentId: "doc_1" }),
    );
    const completed = row({ id: "ag_completed", completed_signed: true });
    const staleDraft = row({ id: "ag_stale_draft" });
    const rows = [completed, staleDraft];

    expect(filterSupersededStaleDraftWorkspaceRows(rows).map((r) => r.id)).toEqual(["ag_completed"]);
  });

  it("dashboard filter shows only the completed row after a successful signing flow", () => {
    const completed = row({
      id: "ag_completed",
      completed_signed: true,
      has_server_signing_lock: true,
    });
    const staleDraft = row({ id: "ag_stale_draft" });
    const filtered = filterCreatorDashboardAgreements([completed, staleDraft]);

    expect(filtered.visibleRows.map((r) => r.id)).toEqual(["ag_completed"]);
    expect(filtered.hiddenStaleCount).toBe(0);
  });

  it("dedupes workspace index rows before agreement-id merge", () => {
    const completed = row({ id: "ag_completed", completed_signed: true });
    const staleDraft = row({ id: "ag_stale_draft" });
    const out = dedupeWorkspaceIndexAgreements([completed, staleDraft]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("ag_completed");
  });
});
