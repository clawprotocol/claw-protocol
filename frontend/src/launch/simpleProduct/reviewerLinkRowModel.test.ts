import { describe, expect, it } from "vitest";
import {
  deriveReviewerLinkRowApprovalStatus,
  normalizeHandoffToReviewerLinkRows,
  redactReviewUrlForLog,
} from "./reviewerLinkRowModel";
import type { AgreementDraft } from "../../agreement/agreementTypes";

const BASE_TS = "2026-05-10T00:00:00.000Z";

function makeDraft(overrides: Partial<AgreementDraft>): AgreementDraft {
  return {
    id: "ag-1",
    title: "T",
    jurisdiction: "CA",
    parties: [],
    purpose: "p",
    payment_terms: "pay",
    duration: "1y",
    due_date: null,
    effective_date: null,
    created_at: BASE_TS,
    updated_at: BASE_TS,
    versions: [{ version: 1, created_at: BASE_TS }],
    audit_log: [],
    ...overrides,
  } as AgreementDraft;
}

describe("reviewerLinkRowModel", () => {
  it("redactReviewUrlForLog masks token query param", () => {
    const out = redactReviewUrlForLog("https://host.example/agreements/x/review?t=secret123");
    expect(out).not.toContain("secret123");
    expect(out.toLowerCase()).toMatch(/redacted/);
  });

  it("normalizeHandoffToReviewerLinkRows preserves party metadata", () => {
    const rows = normalizeHandoffToReviewerLinkRows([
      {
        displayName: "A",
        reviewHref: "https://x/r1?t=a",
        party_index: 1,
        recipientPartyId: "p1",
      },
    ]);
    expect(rows[0]!.party_index).toBe(1);
    expect(rows[0]!.recipientPartyId).toBe("p1");
  });

  it("deriveReviewerLinkRowApprovalStatus marks approved when participant_id matches", () => {
    const d = makeDraft({
      parties: [{ id: "p1", name: "R", role: "reviewer" }],
      audit_log: [
        { event_type: "participant_approved", at: BASE_TS, value: { participant_id: "p1" } },
      ],
    });
    const st = deriveReviewerLinkRowApprovalStatus(d, { recipientPartyId: "p1", reviewer_id: "p1", party_index: 1 }, {
      legacyGlobalApproval: false,
      rowIndex: 0,
    });
    expect(st).toBe("approved");
  });
});
