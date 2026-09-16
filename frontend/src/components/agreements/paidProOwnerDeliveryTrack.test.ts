import { afterEach, describe, expect, it } from "vitest";
import {
  clearOwnerDeliveryTracksForTests,
  isPersistedSignatureDeliveryTrack,
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
});
