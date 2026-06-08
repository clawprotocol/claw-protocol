import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import {
  CREATOR_EVERYONE_APPROVED_HERO,
  CREATOR_EVERYONE_APPROVED_SUBTITLE,
  CREATOR_REVIEW_COMPLETE_BODY,
  CREATOR_REVIEW_COMPLETE_HERO,
  POST_APPROVAL_DONE_LABEL,
  POST_APPROVAL_GO_TO_DASHBOARD_LABEL,
  PUBLIC_ALL_REVIEWS_COMPLETE_BODY,
  PUBLIC_ALL_REVIEWS_COMPLETE_HERO,
  PUBLIC_REVIEW_SUBMITTED_BODY,
  PUBLIC_REVIEW_SUBMITTED_HERO,
  formatCreatorWaitingOnReviewersBody,
  resolveAllReviewPartiesApproved,
  resolvePostApprovalPresentationAudience,
  resolveRecipientPostApprovalPresentation,
  resolveReviewerPartyIndex,
} from "./recipientApprovedWaitingPresentation";

function draftWithAudit(partial: Partial<AgreementDraft>): AgreementDraft {
  return {
    id: "ag_test",
    title: "Agreement",
    jurisdiction: "CA",
    parties: [
      { id: "p1", name: "Blue Canyon Analytics LLC", role: "owner" },
      { id: "p2", name: "Iron Vale Systems Inc.", role: "party" },
    ],
    purpose: "Services",
    payment_terms: "Net 30",
    duration: "1y",
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    versions: [{ version: 1, created_at: "2026-01-01T00:00:00Z" }],
    audit_log: [],
    ...partial,
  } as AgreementDraft;
}

describe("recipientApprovedWaitingPresentation", () => {
  it("treats Party 1 QA simulation with ownerReturn as creator audience only", () => {
    expect(
      resolvePostApprovalPresentationAudience({
        viewerContext: "qa_recipient_simulation",
        qaOwnerReturnPath: "/app/done/ag_1",
        reviewerPartyIndex: 0,
      }),
    ).toBe("creator");
    expect(
      resolvePostApprovalPresentationAudience({
        viewerContext: "qa_recipient_simulation",
        qaOwnerReturnPath: "/app/done/ag_1",
        reviewerPartyIndex: 1,
      }),
    ).toBe("public_recipient");
    expect(
      resolvePostApprovalPresentationAudience({
        viewerContext: "public_recipient",
        qaOwnerReturnPath: "/app/done/ag_1",
        reviewerPartyIndex: 0,
      }),
    ).toBe("public_recipient");
  });

  it("resolves reviewer party index from participant id", () => {
    const parties = draftWithAudit({}).parties;
    expect(resolveReviewerPartyIndex(parties, "p2")).toBe(1);
    expect(resolveReviewerPartyIndex(parties, "missing")).toBeNull();
  });

  it("uses creator review-complete copy with go to dashboard before all reviews complete", () => {
    const copy = resolveRecipientPostApprovalPresentation({
      audience: "creator",
      signingLinksExist: false,
      allReviewsComplete: false,
      pendingReviewerDisplayNames: ["Iron Vale Systems Inc."],
    });
    expect(copy.shellHeroTitle).toBe(CREATOR_REVIEW_COMPLETE_HERO);
    expect(copy.waitingPanel.body).toBe(
      "Waiting on Iron Vale Systems Inc. before signature links can be prepared.",
    );
    expect(copy.waitingPanel.actions).toEqual([
      expect.objectContaining({
        kind: "return_dashboard",
        label: POST_APPROVAL_GO_TO_DASHBOARD_LABEL,
      }),
    ]);
    expect(JSON.stringify(copy)).not.toMatch(/Check for updates|Agreement review dashboard/i);
  });

  it("formats waiting copy for multiple pending reviewers", () => {
    expect(
      formatCreatorWaitingOnReviewersBody(["Iron Vale Systems Inc.", "Pat Example LLC"]),
    ).toBe(
      "Waiting on Iron Vale Systems Inc. and Pat Example LLC before signature links can be prepared.",
    );
    expect(formatCreatorWaitingOnReviewersBody([])).toBe(CREATOR_REVIEW_COMPLETE_BODY);
  });

  it("uses creator everyone-approved copy with prepare and dashboard actions", () => {
    const copy = resolveRecipientPostApprovalPresentation({
      audience: "creator",
      signingLinksExist: false,
      allReviewsComplete: true,
    });
    expect(copy.shellHeroTitle).toBe(CREATOR_EVERYONE_APPROVED_HERO);
    expect(copy.shellHeroSubtitle).toBe(CREATOR_EVERYONE_APPROVED_SUBTITLE);
    expect(copy.waitingPanel.actions.map((a) => a.kind)).toEqual([
      "prepare_signature_links",
      "return_dashboard",
    ]);
  });

  it("uses public review submitted copy with done action", () => {
    const copy = resolveRecipientPostApprovalPresentation({
      audience: "public_recipient",
      signingLinksExist: false,
      allReviewsComplete: false,
    });
    expect(copy.shellHeroTitle).toBe(PUBLIC_REVIEW_SUBMITTED_HERO);
    expect(copy.waitingPanel.header).toBe(PUBLIC_REVIEW_SUBMITTED_HERO);
    expect(copy.waitingPanel.body).toBe(PUBLIC_REVIEW_SUBMITTED_BODY);
    expect(copy.waitingPanel.actions).toEqual([
      expect.objectContaining({ kind: "done", label: POST_APPROVAL_DONE_LABEL }),
    ]);
    expect(JSON.stringify(copy)).not.toMatch(/Dashboard|Account|Current plan|billing|Check for updates/i);
  });

  it("uses public all-reviews-complete copy when final reviewer approves", () => {
    const copy = resolveRecipientPostApprovalPresentation({
      audience: "public_recipient",
      signingLinksExist: false,
      allReviewsComplete: true,
    });
    expect(copy.shellHeroTitle).toBe(PUBLIC_ALL_REVIEWS_COMPLETE_HERO);
    expect(copy.waitingPanel.body).toBe(PUBLIC_ALL_REVIEWS_COMPLETE_BODY);
    expect(copy.waitingPanel.body).toMatch(/signature links/i);
  });

  it("detects all review parties approved from audit log", () => {
    const partial = draftWithAudit({
      audit_log: [{ event_type: "recipient_approved", at: "2026-01-02T00:00:00Z", value: { participant_id: "p1" } }],
    });
    expect(resolveAllReviewPartiesApproved(partial)).toBe(false);
    const complete = draftWithAudit({
      audit_log: [
        { event_type: "recipient_approved", at: "2026-01-02T00:00:00Z", value: { participant_id: "p1" } },
        { event_type: "recipient_approved", at: "2026-01-02T01:00:00Z", value: { participant_id: "p2" } },
      ],
    });
    expect(resolveAllReviewPartiesApproved(complete)).toBe(true);
  });
});
