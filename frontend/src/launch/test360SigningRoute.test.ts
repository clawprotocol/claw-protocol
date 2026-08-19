/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { buildFlowLineDescriptors } from "../vs01/vs01CanonicalTextLayout";
import { buildVs01RecipientSigningUrl, VS01_RECIPIENT_SIGN_QUERY } from "../vs01/StepReceipt";
import type { Vs01RecipientPlacedField } from "../vs01/types";
import { resolveCreatorDashboardSignatureTrackAction } from "./creatorDashboardSignatureTrack";
import { resolveCreatorDashboardReviewGate } from "./creatorDashboardReviewGate";
import { creatorDashboardPrepareSignatureLinksPath, creatorDashboardSigningStatusPath } from "./creatorDashboardReviewLinkRouting";
import { buildVs01OwnerPrepareEsignPath, resolveVs01OwnerPrepareEsignRoute } from "./vs01OwnerPrepareRoute";
import { readAgreementVs01BridgeSession, writeAgreementVs01BridgeSession } from "./simpleProduct/agreementToVs01SigningBridge";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { markAgreementPacketPrepared } from "../vs01/vs01WorkspaceSigningStatus";

import type { AgreementDraft } from "../agreement/agreementTypes";

const AG = "ag_test360";

function approvedDraft(): AgreementDraft {
  return {
    id: AG,
    title: "Services Agreement",
    jurisdiction: "CA",
    parties: [
      {
        name: "Red Mesa Logistics LLC",
        role: "owner",
        email: "owner@example.test",
        signerName: "Riley Owner",
        signerTitle: "CEO",
      },
      {
        name: "Harbor Peak Automation LLC",
        role: "party",
        email: "cp@example.test",
        signerName: "Harper Counterparty",
        signerTitle: "COO",
      },
    ],
    purpose: "Services",
    payment_terms: "Net 30",
    duration: "1y",
    due_date: null,
    effective_date: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-15T00:00:00.000Z",
    versions: [{ version: 1, created_at: "2026-06-01T00:00:00.000Z" }],
    audit_log: [{ event_type: "recipient_approved", at: "2026-06-14T00:00:00.000Z" }],
  } as AgreementDraft;
}

function indexRow(overrides: Partial<WorkspaceIndexAgreement> = {}): WorkspaceIndexAgreement {
  return {
    id: AG,
    title: "Services Agreement",
    updated_at: "2026-06-15T00:00:00.000Z",
    party_count: 2,
    signer_count: 2,
    version_ledger_count: 1,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: null,
    review_sent_at: "2026-06-13T00:00:00.000Z",
    reviewer_approved: true,
    all_reviewers_approved: true,
    review_approvals_required: 2,
    review_approvals_completed: 2,
    ...overrides,
  };
}

function makeRecipientField(id: string, cpId: string): Vs01RecipientPlacedField {
  return {
    id,
    counterpartyId: cpId,
    type: "signature",
    page: 0,
    x: 0.2,
    y: 0.3,
    width: 0.21,
    height: 0.046,
  };
}

describe("Test360 signing route regression", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("review-approved dashboard CTA targets prepare deep link, not /app/send", () => {
    const row = indexRow();
    const draft = approvedDraft();
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft });
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate, { draft });
    expect(action.kind).toBe("prepare_signature_links");
    expect(action.path).toBe(creatorDashboardPrepareSignatureLinksPath(AG));
    expect(action.path).not.toContain("/app/send/");
  });

  it("post-packet dashboard CTA targets signing status surface", () => {
    markAgreementPacketPrepared(AG);
    const row = indexRow({ has_server_signing_lock: true, locked_version_id: "v1" });
    const gate = resolveCreatorDashboardReviewGate(row, []);
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate);
    expect(action.kind).toBe("view_signing_status");
    expect(action.path).toBe(creatorDashboardSigningStatusPath(AG));
    expect(action.path).not.toContain("/app/send/");
  });

  it("recipient signing invite URL uses stable esign path and recipient bootstrap flag", () => {
    const url = buildVs01RecipientSigningUrl({
      recipientIndex: 1,
      recipientName: "Harbor Peak",
      recipientEmail: "cp@example.test",
      counterpartyId: "cp_harbor",
      documentId: "doc_test360",
      receiptId: "rcpt_test360",
      recipientFieldsForSigner: [makeRecipientField("f1", "cp_harbor")],
      agreementId: AG,
      signerRoleId: "vs01r:test360:cp",
    });
    const parsed = new URL(url, "https://example.test");
    expect(parsed.pathname).toBe("/app/esign/doc_test360");
    expect(parsed.searchParams.get(VS01_RECIPIENT_SIGN_QUERY)).toBe("1");
    expect(parsed.searchParams.get("document_id")).toBe("doc_test360");
    expect(parsed.pathname).not.toBe("/app");
  });

  it("resolveVs01OwnerPrepareEsignRoute resumes from bridge session", () => {
    writeAgreementVs01BridgeSession({
      vs01DocumentId: "doc_bridge",
      agreementId: AG,
      agreementTitle: "Services Agreement",
      creatorName: "Owner Co",
      creatorEmail: "owner@example.test",
      counterparties: [],
      targetStep: 2,
      senderFirstLawdogHandoff: true,
      reviewerApprovedCleanHandoff: true,
    });
    expect(resolveVs01OwnerPrepareEsignRoute(AG)).toBe(buildVs01OwnerPrepareEsignPath("doc_bridge"));
    expect(readAgreementVs01BridgeSession()?.vs01DocumentId).toBe("doc_bridge");
  });

  it("subsection headings stay body weight while top-level sections remain headings", () => {
    const descriptors = buildFlowLineDescriptors([
      "10. Warranties, Liability and Indemnity",
      "10.1 Mutual Authority",
      "12.2 Notices",
    ]);
    expect(descriptors[0]?.kind).toBe("heading");
    expect(descriptors[1]?.kind).toBe("body");
    expect(descriptors[2]?.kind).toBe("body");
  });
});
