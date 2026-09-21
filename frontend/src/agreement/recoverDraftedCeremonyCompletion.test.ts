/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import { recoverDraftedCeremonyCompletion } from "./agreementWorkspaceApi";

describe("recoverDraftedCeremonyCompletion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not treat already_signed error text as success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/access/validate")) {
          return {
            ok: false,
            status: 409,
            json: async () => ({ detail: "already_signed" }),
          };
        }
        throw new Error(`unexpected fetch ${url}`);
      }) as unknown as typeof fetch,
    );
    const r = await recoverDraftedCeremonyCompletion(
      "ag",
      { participantId: "p1", lockedVersionId: "lv-1" },
      "tok",
    );
    expect(r.ok).toBe(false);
  });

  it("confirms the same participant, agreement, and locked version from authorized state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/access/validate")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              agreement_id: "ag",
              recipient_party_id: "p1",
              locked_version_id: "lv-1",
              signer_already_completed: true,
              completion_status: "already_signed",
            }),
          };
        }
        if (url.includes("/api/agreements/ag")) {
          return {
            ok: true,
            json: async () => ({
              id: "ag",
              signing_lock: { locked_version_id: "lv-1" },
            }),
          };
        }
        throw new Error(`unexpected fetch ${url}`);
      }) as unknown as typeof fetch,
    );
    const r = await recoverDraftedCeremonyCompletion(
      "ag",
      { participantId: "p1", lockedVersionId: "lv-1" },
      "tok",
    );
    expect(r.ok).toBe(true);
    expect(r.status).toBe("already_signed");
  });

  it("rejects authorized state when the locked version does not match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/access/validate")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              agreement_id: "ag",
              recipient_party_id: "p1",
              locked_version_id: "lv-1",
              signer_already_completed: true,
              completion_status: "completed",
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            id: "ag",
            signing_lock: { locked_version_id: "lv-other" },
          }),
        };
      }) as unknown as typeof fetch,
    );
    const r = await recoverDraftedCeremonyCompletion(
      "ag",
      { participantId: "p1", lockedVersionId: "lv-1" },
      "tok",
    );
    expect(r.ok).toBe(false);
  });
});
