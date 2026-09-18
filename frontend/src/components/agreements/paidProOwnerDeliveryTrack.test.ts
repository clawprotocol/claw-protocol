import { afterEach, describe, expect, it, vi } from "vitest";
import * as agreementWorkspaceApi from "../../agreement/agreementWorkspaceApi";
import {
  clearOwnerDeliveryTracksForTests,
  isPersistedSignatureDeliveryTrack,
  persistOwnerDeliveryTrack,
  rememberOwnerDeliveryTrack,
} from "./paidProOwnerDeliveryTrack";

describe("isPersistedSignatureDeliveryTrack", () => {
  afterEach(() => {
    clearOwnerDeliveryTracksForTests();
  });

  it("honors in-memory draft track and remount memory", () => {
    expect(isPersistedSignatureDeliveryTrack("agr-1", "signature")).toBe(true);
    expect(isPersistedSignatureDeliveryTrack("agr-1", "review")).toBe(false);
    rememberOwnerDeliveryTrack("agr-2", "signature");
    expect(isPersistedSignatureDeliveryTrack("agr-2", null)).toBe(true);
    expect(isPersistedSignatureDeliveryTrack("agr-3", "")).toBe(false);
  });

  it("reuses an already persisted signature track when later PATCH is negotiation-locked", async () => {
    vi.spyOn(agreementWorkspaceApi, "patchAgreementField").mockResolvedValue(false);
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: { id: "agr-locked", owner_delivery_track: "signature", parties: [] } as never,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: { id: "agr-locked", owner_delivery_track: "signature", parties: [] } as never,
      lockedVersionId: "v1",
    });
    await expect(persistOwnerDeliveryTrack("agr-locked", "signature")).resolves.toBe(true);
    vi.restoreAllMocks();
  });
});
