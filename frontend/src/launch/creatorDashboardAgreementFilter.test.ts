/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { AGREEMENT_CREATE_REVIEW_RESUME_KEY } from "../components/agreements/agreementIntakeStorage";
import { LAWDOG_ENTRY_CONTEXT_KEY } from "./lawdogEntryContext";
import {
  filterCreatorDashboardAgreements,
  isLegitimateAdditionalCreatorDashboardAgreement,
  resolveCreatorDashboardFeaturedAgreementId,
} from "./creatorDashboardAgreementFilter";

function row(p: Partial<WorkspaceIndexAgreement>): WorkspaceIndexAgreement {
  return {
    id: "ag_default",
    title: "Agreement",
    updated_at: "2026-05-01T12:00:00.000Z",
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

describe("creatorDashboardAgreementFilter", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("features the session resume agreement when present", () => {
    sessionStorage.setItem(AGREEMENT_CREATE_REVIEW_RESUME_KEY, "ag_active");
    const rows = [
      row({ id: "ag_stale", updated_at: "2026-06-01T00:00:00.000Z" }),
      row({
        id: "ag_active",
        updated_at: "2026-05-01T00:00:00.000Z",
        review_sent_at: "2026-05-01T00:00:00.000Z",
        all_reviewers_approved: true,
      }),
    ];
    expect(resolveCreatorDashboardFeaturedAgreementId(rows)).toBe("ag_active");
  });

  it("hides sibling drafts when featured agreement is already in review", () => {
    sessionStorage.setItem(LAWDOG_ENTRY_CONTEXT_KEY, "new");
    sessionStorage.setItem(AGREEMENT_CREATE_REVIEW_RESUME_KEY, "ag_active");
    const rows = [
      row({ id: "ag_stale_draft", updated_at: "2026-06-01T00:00:00.000Z", title: "Old QA draft" }),
      row({
        id: "ag_active",
        updated_at: "2026-05-01T00:00:00.000Z",
        review_sent_at: "2026-05-01T00:00:00.000Z",
        all_reviewers_approved: true,
        reviewer_approved: true,
        review_approvals_required: 2,
        review_approvals_completed: 2,
      }),
      row({ id: "ag_old_done", updated_at: "2026-04-01T00:00:00.000Z", completed_signed: true }),
    ];

    const filtered = filterCreatorDashboardAgreements(rows);
    expect(filtered.featuredAgreementId).toBe("ag_active");
    expect(filtered.visibleRows.map((r) => r.id)).toEqual(["ag_active"]);
    expect(filtered.hiddenStaleCount).toBe(2);
  });

  it("keeps multiple legitimate in-pipeline agreements visible", () => {
    sessionStorage.setItem(LAWDOG_ENTRY_CONTEXT_KEY, "returning");
    const rows = [
      row({
        id: "ag_signing",
        review_sent_at: "2026-05-01T00:00:00.000Z",
        has_server_signing_lock: true,
      }),
      row({
        id: "ag_review",
        updated_at: "2026-05-02T00:00:00.000Z",
        review_sent_at: "2026-05-02T00:00:00.000Z",
        reviewer_approved: false,
      }),
    ];

    const filtered = filterCreatorDashboardAgreements(rows);
    expect(filtered.visibleRows).toHaveLength(2);
    expect(filtered.hiddenStaleCount).toBe(0);
    expect(isLegitimateAdditionalCreatorDashboardAgreement(rows[1]!)).toBe(true);
  });

  it("keeps peer drafts visible even when a create-resume id is set", () => {
    sessionStorage.setItem(AGREEMENT_CREATE_REVIEW_RESUME_KEY, "ag_active_draft");
    const rows = [
      row({
        id: "ag_peer_draft",
        updated_at: "2026-06-01T00:00:00.000Z",
        title: "Services Agreement",
      }),
      row({
        id: "ag_active_draft",
        updated_at: "2026-05-01T00:00:00.000Z",
        title: "Services Agreement",
      }),
    ];

    const filtered = filterCreatorDashboardAgreements(rows);
    expect(filtered.featuredAgreementId).toBe("ag_active_draft");
    expect(filtered.visibleRows.map((r) => r.id).sort()).toEqual([
      "ag_active_draft",
      "ag_peer_draft",
    ]);
    expect(filtered.hiddenStaleCount).toBe(0);
  });

  it("features resume id and keeps other in-review agreements visible", () => {
    sessionStorage.setItem(AGREEMENT_CREATE_REVIEW_RESUME_KEY, "ag_active");
    const rows = [
      row({ id: "ag_stale_draft", updated_at: "2026-06-01T00:00:00.000Z", title: "Old QA draft" }),
      row({
        id: "ag_active",
        updated_at: "2026-05-01T00:00:00.000Z",
        review_sent_at: "2026-05-01T00:00:00.000Z",
        reviewer_approved: false,
        review_approvals_required: 1,
        review_approvals_completed: 0,
      }),
      row({
        id: "ag_other_review",
        updated_at: "2026-05-02T00:00:00.000Z",
        review_sent_at: "2026-05-02T00:00:00.000Z",
        reviewer_approved: false,
      }),
    ];

    const filtered = filterCreatorDashboardAgreements(rows);
    expect(filtered.featuredAgreementId).toBe("ag_active");
    expect(filtered.visibleRows.map((r) => r.id).sort()).toEqual(["ag_active", "ag_other_review"]);
    expect(filtered.hiddenStaleCount).toBe(1);
  });
});
