import { describe, expect, it, vi } from "vitest";
import {
  fingerprintAgreementBody,
  invalidateSigningPacketPrep,
  markSigningPacketPreparedAtGuidedVersion,
} from "./guidedDealCompletion/guidedSigningPacketVersion";
import { verifySigningSendReady } from "./signingSendVerification";

describe("verifySigningSendReady", () => {
  it("blocks send when packet version is stale", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    invalidateSigningPacketPrep("test");
    markSigningPacketPreparedAtGuidedVersion("old-v", "hash-a");
    const result = verifySigningSendReady({
      agreementBodyPlain: "body text for hash",
      authoritativeVersionId: "new-v",
      packetPrepared: true,
      signerCount: 2,
      fieldsPlacedCount: 4,
    });
    expect(result.ok).toBe(false);
    expect(result.fixLabel).toBe("Refresh signing packet");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("allows send when version and body match prepared packet", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const body = "Agreement body for fingerprint test.";
    invalidateSigningPacketPrep("test2");
    const hash = fingerprintAgreementBody(body);
    markSigningPacketPreparedAtGuidedVersion("v-current", hash);
    const result = verifySigningSendReady({
      agreementBodyPlain: body,
      authoritativeVersionId: "v-current",
      packetPrepared: true,
      signerCount: 1,
      fieldsPlacedCount: 3,
    });
    expect(result.ok).toBe(true);
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });

  it("blocks when packet prepared but no fields placed", () => {
    invalidateSigningPacketPrep("test3");
    const result = verifySigningSendReady({
      agreementBodyPlain: "x",
      authoritativeVersionId: "v1",
      packetPrepared: true,
      signerCount: 1,
      fieldsPlacedCount: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.fixLabel).toBe("Review field placement");
  });
});
