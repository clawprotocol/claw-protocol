/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  isAgreementPacketPrepared,
  markAgreementPacketPrepared,
  workspaceSigningStatusLabel,
} from "../vs01/vs01WorkspaceSigningStatus";

function row(p: Partial<WorkspaceIndexAgreement>): WorkspaceIndexAgreement {
  return {
    id: "ag_ws",
    title: "T",
    updated_at: "2026-01-01T00:00:00Z",
    party_count: 2,
    signer_count: 1,
    version_ledger_count: 1,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: null,
    review_sent_at: null,
    ...p,
  };
}

describe("workspaceSigningStatusLabel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses server lock for signing in progress", () => {
    expect(
      workspaceSigningStatusLabel(
        row({ has_server_signing_lock: true, locked_version_id: "v1" }),
      ),
    ).toBe("Signing in progress");
  });

  it("uses Waiting for review when review links sent", () => {
    expect(
      workspaceSigningStatusLabel(row({ review_sent_at: "2026-01-01T00:00:00Z" })),
    ).toBe("Waiting for review");
  });

  it("uses local packet prepared flag", () => {
    markAgreementPacketPrepared("ag_ws");
    expect(workspaceSigningStatusLabel(row({ id: "ag_ws" }))).toBe("Signing in progress");
    expect(isAgreementPacketPrepared("ag_ws")).toBe(true);
  });
});
