import { describe, expect, it } from "vitest";
import {
  recipientApprovalPostIsAmbiguous,
  recipientApprovalRecordedOnIntendedRevision,
} from "./recipientApprovalReconcile";

const SNAP = "crs_intended";
const DIGEST = "aa".repeat(32);

describe("recipientApprovalReconcile", () => {
  it("treats only network and 5xx as ambiguous", () => {
    expect(recipientApprovalPostIsAmbiguous({ ok: true, status: 200 })).toBe(false);
    expect(recipientApprovalPostIsAmbiguous({ ok: false, status: 403, error: "owner_uses_workspace_not_recipient_approve" })).toBe(
      false,
    );
    expect(recipientApprovalPostIsAmbiguous({ ok: false, status: 400, error: "participant_not_found" })).toBe(false);
    expect(recipientApprovalPostIsAmbiguous({ ok: false, status: 409, error: "stale_review_revision" })).toBe(false);
    expect(recipientApprovalPostIsAmbiguous({ ok: false, error: "network" })).toBe(true);
    expect(recipientApprovalPostIsAmbiguous({ ok: false, status: 500, error: "http_5xx" })).toBe(true);
    expect(recipientApprovalPostIsAmbiguous({ ok: false, status: 0 })).toBe(true);
  });

  it("records success only for the intended participant and revision", () => {
    const audit = [
      {
        event_type: "participant_approved",
        at: "2026-09-15T00:00:00.000Z",
        value: { participant_id: "p_lumen", snapshot_id: SNAP, corpus_sha256: DIGEST },
      },
    ];
    expect(
      recipientApprovalRecordedOnIntendedRevision(audit, {
        participantId: "p_lumen",
        snapshotId: SNAP,
        digest: DIGEST,
      }),
    ).toBe(true);
    expect(
      recipientApprovalRecordedOnIntendedRevision(audit, {
        participantId: "p_thalassa",
        snapshotId: SNAP,
        digest: DIGEST,
      }),
    ).toBe(false);
    expect(
      recipientApprovalRecordedOnIntendedRevision(audit, {
        participantId: "p_lumen",
        snapshotId: "crs_other",
        digest: DIGEST,
      }),
    ).toBe(false);
    expect(
      recipientApprovalRecordedOnIntendedRevision(audit, {
        participantId: "p_lumen",
        snapshotId: SNAP,
        digest: "bb".repeat(32),
      }),
    ).toBe(false);
  });
});
