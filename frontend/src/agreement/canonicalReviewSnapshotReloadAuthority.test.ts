/** @vitest-environment jsdom */
/**
 * Reload authority: local storage alone must not yield review-ready/accepted state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("../lib/clawApi", () => ({
  apiUrl: (path: string) => `http://test.local${path}`,
}));

vi.mock("./agreementOrgHeaders", () => ({
  clawAgreementHeaders: () => ({ "X-Claw-Org-Id": "user-owner" }),
}));

describe("commercial review reload authority", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
  });

  it("hydrate fails closed when server GET fails — no accepted ref written", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: { code: "snapshot_not_found" } }),
    });
    const { hydrateCommercialReviewFromServerSnapshot, readAcceptedReviewSnapshotRef } = await import(
      "./canonicalReviewSnapshotApi"
    );
    const result = await hydrateCommercialReviewFromServerSnapshot({ agreementId: "ag_reload_1" });
    expect(result.ok).toBe(false);
    expect(readAcceptedReviewSnapshotRef("ag_reload_1")).toBeNull();
  });

  it("hydrate stores server snapshot authority only after successful GET", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "accepted",
        snapshot: {
          snapshot_id: "snap_server_1",
          agreement_id: "ag_reload_2",
          corpus_plain: "SERVER_CORPUS_" + "x".repeat(80),
          corpus_sha256: "b".repeat(64),
          corpus_length: 94,
          status: "accepted",
        },
      }),
    });
    const {
      hydrateCommercialReviewFromServerSnapshot,
      readAcceptedReviewSnapshotRef,
      readDisplayReviewSnapshotAuthority,
    } = await import("./canonicalReviewSnapshotApi");
    const result = await hydrateCommercialReviewFromServerSnapshot({ agreementId: "ag_reload_2" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.display.snapshotId).toBe("snap_server_1");
    expect(result.display.corpusSha256).toBe("b".repeat(64));
    const accepted = readAcceptedReviewSnapshotRef("ag_reload_2");
    expect(accepted?.snapshotId).toBe("snap_server_1");
    expect(accepted?.corpusSha256).toBe("b".repeat(64));
    const display = readDisplayReviewSnapshotAuthority("ag_reload_2");
    expect(display?.snapshotId).toBe("snap_server_1");
    // Authority ids come from server response, not client-invented local values.
    expect(display?.snapshotId).not.toBe("local-only-snap");
  });
});
