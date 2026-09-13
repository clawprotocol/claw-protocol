import { describe, expect, it } from "vitest";
import { resolvePaidProSignatureConfirmationAuthority } from "./paidProSignatureConfirmationAuthority";

const READY = {
  slots: [
    { name: "Maya Chen", email: "maya@harbor.test", participantId: "p-harbor" },
    { name: "Jordan Hale", email: "jordan@ironvale.test", participantId: "p-ironvale" },
  ],
  expectedParticipantIds: ["p-harbor", "p-ironvale"],
  currentAgreementId: "ag-1",
  expectedAgreementId: "ag-1",
  currentOrganizationId: "org-1",
  expectedOrganizationId: "org-1",
  currentSessionId: "sess-1",
  expectedSessionId: "sess-1",
  hasVerifiedAuthority: true,
} as const;

describe("resolvePaidProSignatureConfirmationAuthority", () => {
  it("accepts names, emails, durable bindings, and matching authority", () => {
    expect(resolvePaidProSignatureConfirmationAuthority(READY)).toEqual({ ok: true });
  });

  it("rejects emails without names", () => {
    expect(
      resolvePaidProSignatureConfirmationAuthority({
        ...READY,
        slots: [
          { name: "", email: "maya@harbor.test", participantId: "p-harbor" },
          { name: "", email: "jordan@ironvale.test", participantId: "p-ironvale" },
        ],
      }),
    ).toEqual({ ok: false, reason: "emails_only" });
  });

  it("rejects incomplete emails", () => {
    expect(
      resolvePaidProSignatureConfirmationAuthority({
        ...READY,
        slots: [
          { name: "Maya Chen", email: "maya@harbor.test", participantId: "p-harbor" },
          { name: "Jordan Hale", email: "not-an-email", participantId: "p-ironvale" },
        ],
      }),
    ).toEqual({ ok: false, reason: "emails_incomplete" });
  });

  it("rejects missing participant bindings", () => {
    expect(
      resolvePaidProSignatureConfirmationAuthority({
        ...READY,
        slots: [
          { name: "Maya Chen", email: "maya@harbor.test", participantId: "p-harbor" },
          { name: "Jordan Hale", email: "jordan@ironvale.test", participantId: "" },
        ],
      }),
    ).toEqual({ ok: false, reason: "missing_participant" });
  });

  it("rejects mismatched participant bindings", () => {
    expect(
      resolvePaidProSignatureConfirmationAuthority({
        ...READY,
        slots: [
          { name: "Maya Chen", email: "maya@harbor.test", participantId: "p-harbor" },
          { name: "Jordan Hale", email: "jordan@ironvale.test", participantId: "p-other" },
        ],
      }),
    ).toEqual({ ok: false, reason: "mismatched_participant" });
  });

  it("rejects stale agreement, org, and session after a change", () => {
    expect(
      resolvePaidProSignatureConfirmationAuthority({
        ...READY,
        currentAgreementId: "ag-2",
      }),
    ).toEqual({ ok: false, reason: "stale_agreement" });
    expect(
      resolvePaidProSignatureConfirmationAuthority({
        ...READY,
        currentOrganizationId: "org-2",
      }),
    ).toEqual({ ok: false, reason: "stale_org" });
    expect(
      resolvePaidProSignatureConfirmationAuthority({
        ...READY,
        currentSessionId: "sess-2",
      }),
    ).toEqual({ ok: false, reason: "stale_session" });
  });

  it("rejects missing agreement authority", () => {
    expect(
      resolvePaidProSignatureConfirmationAuthority({
        ...READY,
        hasVerifiedAuthority: false,
      }),
    ).toEqual({ ok: false, reason: "missing_authority" });
  });
});
