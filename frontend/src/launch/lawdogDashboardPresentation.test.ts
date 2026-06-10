/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  countLawdogDashboardKpis,
  deriveLawdogProductStatus,
  LAWDOG_PRODUCT_STATUS_LABEL,
} from "./lawdogDashboardPresentation";
import { deriveCreatorDashboardStatus } from "./creatorDashboardPresentation";

function row(p: Partial<WorkspaceIndexAgreement>): WorkspaceIndexAgreement {
  return {
    id: "ag_test",
    title: "Test Agreement",
    updated_at: "2026-01-01T00:00:00Z",
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

describe("lawdogDashboardPresentation", () => {
  it("maps internal statuses to product-facing labels", () => {
    expect(deriveLawdogProductStatus(row({}))).toBe("draft");
    expect(deriveLawdogProductStatus(row({ review_sent_at: "2026-01-01T00:00:00Z" }))).toBe("review");
    expect(
      deriveLawdogProductStatus(
        row({
          all_reviewers_approved: true,
          review_approvals_completed: 2,
          review_approvals_required: 2,
        }),
      ),
    ).toBe("signature_prep");
    expect(deriveLawdogProductStatus(row({ has_server_signing_lock: true }))).toBe("sent");
    expect(deriveLawdogProductStatus(row({ completed_signed: true }))).toBe("signed");
    expect(deriveLawdogProductStatus(row({ workspace_archived_at: "2026-01-01T00:00:00Z" }))).toBe(
      "archived",
    );
  });

  it("computes actionable dashboard KPI totals", () => {
    const rows = [
      row({ id: "d1" }),
      row({ id: "d2", review_sent_at: "2026-01-01T00:00:00Z" }),
      row({
        id: "d3",
        all_reviewers_approved: true,
        review_approvals_completed: 2,
        review_approvals_required: 2,
      }),
      row({ id: "d4", completed_signed: true }),
    ];
    expect(countLawdogDashboardKpis(rows)).toEqual({
      activeAgreements: 4,
      awaitingReview: 1,
      readyForSignature: 1,
      completedAgreements: 1,
    });
  });

  it("preserves deriveCreatorDashboardStatus for review/signing flows", () => {
    const reviewRow = row({ review_sent_at: "2026-01-01T00:00:00Z" });
    expect(deriveCreatorDashboardStatus(reviewRow)).toBe("in_review");
    expect(LAWDOG_PRODUCT_STATUS_LABEL[deriveLawdogProductStatus(reviewRow)]).toBe("Review");
  });
});
