import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAgreementDraftFromApi } from "../../agreement/agreementDraftNormalize";
import * as agreementWorkspaceApi from "../../agreement/agreementWorkspaceApi";
import {
  clearOwnerDeliveryTracksForTests,
  isPersistedSignatureDeliveryTrack,
  normalizeOwnerDeliveryTrack,
  persistOwnerDeliveryTrack,
  rememberOwnerDeliveryTrack,
} from "./paidProOwnerDeliveryTrack";

function draftWithTrack(id: string, track: string | null) {
  return normalizeAgreementDraftFromApi({
    id,
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    parties: [],
    purpose: "",
    payment_terms: "",
    owner_delivery_track: track,
  });
}

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
    expect(isPersistedSignatureDeliveryTrack("agr-4", "send")).toBe(false);
    expect(normalizeOwnerDeliveryTrack("SEND")).toBeNull();
    expect(normalizeOwnerDeliveryTrack("review")).toBe("review");
  });

  it("reuses an already persisted signature track when later PATCH is negotiation-locked", async () => {
    const locked = draftWithTrack("agr-locked", "signature");
    expect(locked?.owner_delivery_track).toBe("signature");
    vi.spyOn(agreementWorkspaceApi, "patchAgreementField").mockResolvedValue(false);
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: locked,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: locked,
      lockedVersionId: "v1",
    });
    await expect(persistOwnerDeliveryTrack("agr-locked", "signature")).resolves.toBe(true);
    vi.restoreAllMocks();
  });
});
