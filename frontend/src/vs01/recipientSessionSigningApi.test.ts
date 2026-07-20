/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeRecipientSessionSigner,
  mutateRecipientSessionField,
  resetRecipientSessionSigningInFlightForTests,
} from "./recipientSessionSigningApi";

describe("recipientSessionSigningApi", () => {
  beforeEach(() => {
    resetRecipientSessionSigningInFlightForTests();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("submits field mutations through session API only", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        field_id: "f1",
        idempotent: false,
        field_values: { f1: "Jane Signer" },
        field_revisions: { f1: 1 },
        readiness: "ready_for_signing",
        signer_complete: false,
        finish_ready: true,
        required_field_count: 1,
        completed_field_count: 1,
        missing_field_ids: [],
      }),
    } as Response);

    const result = await mutateRecipientSessionField("f1", "Jane Signer", 0, "mut-test-1");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/recipient/session/fields",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });

  it("rejects completion responses that claim global execution", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        signer_complete: true,
        idempotent: false,
        globally_executed: true,
        readiness: "signer_complete",
        finish_ready: true,
        required_field_count: 1,
        completed_field_count: 1,
        missing_field_ids: [],
      }),
    } as Response);

    const result = await completeRecipientSessionSigner();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("global_execution_not_allowed");
    }
  });
});
