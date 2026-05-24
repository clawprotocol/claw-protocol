import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveVs01PreparePacketReadiness } from "./vs01PreparePacketReadiness";

const goodSummary = {
  complete: true,
  unsafeInitialsCount: 0,
  unsafeSignatureCount: 0,
};

describe("VS01 prepare packet readiness gate", () => {
  it("disables continue when corpus gate returns blocked_short_preview", () => {
    const readiness = resolveVs01PreparePacketReadiness({
      corpusGate: { allowed: false, blockReason: "blocked_short_preview" },
      placementCanFinish: true,
      initialsSummary: goodSummary,
    });
    expect(readiness.packetReady).toBe(false);
    expect(readiness.reason).toBe("blocked_short_preview");
  });

  it("disables continue when initials overlap", () => {
    const readiness = resolveVs01PreparePacketReadiness({
      corpusGate: { allowed: true },
      placementCanFinish: true,
      initialsSummary: { complete: false, unsafeInitialsCount: 1, unsafeSignatureCount: 0 },
    });
    expect(readiness.packetReady).toBe(false);
  });

  it("disables continue when signature fields overlap footer or body", () => {
    const readiness = resolveVs01PreparePacketReadiness({
      corpusGate: { allowed: true },
      placementCanFinish: true,
      initialsSummary: { complete: false, unsafeInitialsCount: 0, unsafeSignatureCount: 1 },
    });
    expect(readiness.packetReady).toBe(false);
  });

  it("only enables continue when corpus and placement validation are complete", () => {
    const readiness = resolveVs01PreparePacketReadiness({
      corpusGate: { allowed: true },
      placementCanFinish: true,
      initialsSummary: goodSummary,
    });
    expect(readiness.packetReady).toBe(true);
  });

  it("prepare page uses rebuild action and never prepared copy when validation blocks", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    const banner = readFileSync(join(__dirname, "Vs01PrepPreparedBanner.tsx"), "utf8");
    expect(src).toContain("resolveVs01PreparePacketReadiness");
    expect(src).toContain("Rebuild signing packet");
    expect(src).toContain("? PREPARE_PACKET_BRIDGE_PRIMARY_CTA");
    expect(banner).toContain("Review required before sending");
    expect(banner).toContain('ready ? "LawDog prepared your signing packet"');
  });
});
