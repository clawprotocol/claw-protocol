/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAgreementDraftWithSigningLock } from "./agreementWorkspaceApi";

describe("fetchAgreementDraftWithSigningLock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns lockedVersionId when signing_lock present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          draft: {
            id: "ag-x",
            title: "Lease",
            jurisdiction: "CA",
            parties: [{ name: "A", role: "owner" }],
            purpose: "x".repeat(600),
            payment_terms: "Net 30",
            duration: "1y",
            due_date: null,
            effective_date: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            versions: [{ version: 1, created_at: "2026-01-01T00:00:00Z" }],
            audit_log: [],
            premium_render_source: "server_full_document_text",
            server_full_document_text: "y".repeat(600),
          },
          signing_lock: { locked_version_id: "ver-lock-1" },
        }),
      })) as unknown as typeof fetch,
    );
    const r = await fetchAgreementDraftWithSigningLock("ag-x");
    expect(r.ok).toBe(true);
    expect(r.lockedVersionId).toBe("ver-lock-1");
    expect(r.draft?.id).toBe("ag-x");
  });
});
