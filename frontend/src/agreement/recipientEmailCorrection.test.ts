/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import {
  canCorrectReviewRecipientEmail,
  canCorrectSigningRecipientEmail,
  RECIPIENT_EMAIL_CORRECTION_HELPER,
  SIGNER_ALREADY_SIGNED_EMAIL_BLOCK,
} from "./recipientEmailCorrection";

function draft(parties: AgreementDraft["parties"], audit: AgreementDraft["audit_log"] = []): AgreementDraft {
  return {
    id: "ag_test",
    title: "Test",
    jurisdiction: "TX",
    parties,
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "",
    updated_at: "",
    versions: [],
    audit_log: audit,
  };
}

describe("recipientEmailCorrection", () => {
  it("allows review email correction before approval", () => {
    const d = draft([
      { id: "p_owner", name: "Owner", role: "owner", email: "o@example.com" },
      { id: "p_cp", name: "CP", role: "party", email: "wrong@example.com" },
    ]);
    expect(canCorrectReviewRecipientEmail({ draft: d, participantId: "p_cp" }).allowed).toBe(true);
  });

  it("blocks review email correction after approval", () => {
    const d = draft(
      [
        { id: "p_owner", name: "Owner", role: "owner", email: "o@example.com" },
        { id: "p_cp", name: "CP", role: "party", email: "wrong@example.com" },
      ],
      [{ event_type: "recipient_approved", at: "t", value: { participant_id: "p_cp" } }],
    );
    expect(canCorrectReviewRecipientEmail({ draft: d, participantId: "p_cp" }).allowed).toBe(false);
  });

  it("blocks signing email correction after signature", () => {
    const d = draft(
      [
        { id: "p_owner", name: "Owner", role: "owner", email: "o@example.com" },
        { id: "p_cp", name: "CP", role: "party", email: "wrong@example.com" },
      ],
      [{ event_type: "signature_completed", at: "t", value: { participant_id: "p_cp" } }],
    );
    const gate = canCorrectSigningRecipientEmail({ draft: d, participantId: "p_cp", signerStatus: "signed" });
    expect(gate.allowed).toBe(false);
    expect(SIGNER_ALREADY_SIGNED_EMAIL_BLOCK).toMatch(/already signed/i);
  });

  it("exposes typo-friendly helper copy", () => {
    expect(RECIPIENT_EMAIL_CORRECTION_HELPER).toMatch(/mistyped email/i);
    expect(RECIPIENT_EMAIL_CORRECTION_HELPER).toMatch(/without changing the agreement/i);
  });
});
