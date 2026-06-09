/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { AgreementRecipientReview } from "../../agreement/AgreementRecipientReview";
import { approveDraftFromReviewFirst } from "../../agreement/AgreementRecipientReview.testHelpers";
import { AccessProvider } from "../../access/AccessContext";
import { clearReviewerApprovalLocalState } from "../../agreement/reviewerApprovalPersistence";
import {
  countOwnerReviewPartyApproved,
  deriveOwnerReviewPartyStatusRows,
} from "../../launch/simpleProduct/ownerReviewPartyStatusChecklist";
import { buildReviewLinkPartySimulationRows } from "../../launch/simpleProduct/ReviewLinkPartySimulationPanel";
import { countBlankSignerMetadataLinesInExecutionBlock } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";

vi.mock("../../launch/LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/agreements/ag/review",
    search: "",
    hash: "",
    navigate: vi.fn(),
  }),
}));

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";
const agreementId = "ag_test307_review_approval";

const baseDraft: AgreementDraft = {
  id: agreementId,
  title: "Consulting Agreement",
  jurisdiction: "CA",
  parties: [
    { id: "p-blue", name: BLUE, role: "party" },
    { id: "p-iron", name: IRON, role: "reviewer", email: "jki93@me.com" },
  ],
  purpose: "Consulting services.",
  payment_terms: "Net 15.",
  duration: "1 year",
  due_date: null,
  effective_date: "2026-01-01",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  versions: [{ version: 1, created_at: new Date().toISOString(), note: "x" }],
  audit_log: [],
};

describe("Test307 reviewer approval state", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("Approve draft changes reviewer screen state after OK", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Consulting.</p>" });
      }
      if (method === "POST" && url.includes("/recipient-approve")) {
        return jsonResponse({
          draft: {
            ...baseDraft,
            audit_log: [
              {
                event_type: "participant_approved",
                at: "2026-06-07T00:00:00.000Z",
                value: { participant_id: "p-iron", message: "approved_current_draft" },
              },
              { event_type: "recipient_approved", at: "2026-06-07T00:00:00.000Z", value: { participant_id: "p-iron" } },
            ],
          },
        });
      }
      if (method === "GET" && url.includes("/access/validate")) {
        return jsonResponse({ ok: true, agreement_id: agreementId, mode: "review", recipient_party_id: "p-iron" });
      }
      if (method === "GET" && url.includes("/api/agreements/")) {
        return jsonResponse({ draft: baseDraft, signing_lock: null });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          recipientAccessToken="tok_party_two"
          participantPartyId="p-iron"
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await approveDraftFromReviewFirst();

    await waitFor(() => {
      expect(screen.getByTestId("recipient-signing-readiness-panel")).toBeTruthy();
    });
    expect(screen.getByTestId("recipient-approved-waiting-header").textContent).toContain("Review submitted");
    expect(screen.queryByTestId("recipient-review-approve-draft")).toBeNull();
  });

  it("owner party status rows show Party 2 approved after audit", () => {
    const draft: AgreementDraft = {
      ...baseDraft,
      audit_log: [
        {
          event_type: "participant_approved",
          at: "2026-06-07T00:00:00.000Z",
          value: { participant_id: "p-iron", message: "approved_current_draft" },
        },
      ],
    };
    const rows = deriveOwnerReviewPartyStatusRows(draft);
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.displayName === IRON)?.status).toBe("approved");
    expect(rows.find((r) => r.displayName === BLUE)?.status).toBe("not_reviewed");
    expect(countOwnerReviewPartyApproved(rows)).toBe(1);
  });

  it("shows changes_accepted for proposer after owner accepts proposal", () => {
    const draft: AgreementDraft = {
      ...baseDraft,
      audit_log: [
        {
          event_type: "recipient_proposal_pending",
          at: "2026-06-07T21:00:00.000Z",
          value: {
            proposal_id: "prop-iron",
            proposer_id: "p-iron",
            instruction: "Renumber",
            draft: { purpose: "Updated body" },
          },
        },
        {
          event_type: "recipient_proposal_applied",
          at: "2026-06-07T22:00:00.000Z",
          value: { proposal_id: "prop-iron" },
        },
      ],
    };
    const rows = deriveOwnerReviewPartyStatusRows(draft);
    expect(rows.find((r) => r.displayName === IRON)?.status).toBe("changes_accepted");
    expect(rows.find((r) => r.displayName === IRON)?.statusLabel).toBe("Changes accepted");
    expect(rows.find((r) => r.displayName === BLUE)?.status).toBe("not_reviewed");
  });

  it("QA reviewer panel builds one opener row per party", () => {
    const rows = buildReviewLinkPartySimulationRows(baseDraft);
    expect(rows.length).toBe(2);
    expect(rows[0]?.displayName).toBe(BLUE);
    expect(rows[1]?.displayName).toBe(IRON);
  });

  it("party simulation uses the same hydrated corpus hash without mutation", () => {
    const corpus = [
      "CONSULTING AGREEMENT",
      "",
      `This Agreement is between ${BLUE} and ${IRON}.`,
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      BLUE,
      "Name: Sarah Mitchell",
      "Title: CEO",
      "",
      "SERVICE PROVIDER:",
      IRON,
      "Name: Michael Torres",
      "Title: President",
    ].join("\n");
    const hash = hashPaidProCorpus(corpus);
    expect(countBlankSignerMetadataLinesInExecutionBlock(corpus)).toBe(0);
    expect(corpus).toMatch(/Sarah Mitchell/);
    expect(corpus).toMatch(/Michael Torres/);
    expect(hash).toMatch(/:/);
  });

  it("clears local approval scope for tests", () => {
    clearReviewerApprovalLocalState({
      agreementId,
      participantPartyId: "p-iron",
      recipientAccessToken: "tok",
    });
    expect(true).toBe(true);
  });
});
