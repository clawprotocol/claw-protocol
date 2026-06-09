import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatVs01PacketReadyDebugLabel,
  resolveVs01PreparePacketReadiness,
} from "./vs01PreparePacketReadiness";

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

  it("allows continue when initials are disabled (initialsSummary null)", () => {
    const readiness = resolveVs01PreparePacketReadiness({
      corpusGate: { allowed: true },
      placementCanFinish: true,
      initialsSummary: null,
      canonicalTextRendered: true,
      canonicalSignatureLinesRendered: true,
    });
    expect(readiness.packetReady).toBe(true);
    expect(readiness.reason).toBeNull();
  });

  it("maps packet block reasons to safe debug labels without PII", () => {
    expect(formatVs01PacketReadyDebugLabel("unsafe_initials_fields")).toBe("initials_overlap_or_oob");
    expect(formatVs01PacketReadyDebugLabel("initials_validation_incomplete")).toBe("initials_incomplete");
    expect(formatVs01PacketReadyDebugLabel(null)).toBeNull();
  });

  it("prepare page uses packetReady-gated bridge copy and no rebuild warning", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    const completion = readFileSync(join(__dirname, "vs01PreparePacketCompletion.ts"), "utf8");
    expect(src).toContain("resolveVs01PreparePacketReadiness");
    expect(src).not.toContain("Rebuild signing packet");
    expect(src).toMatch(/packetReady[\s\S]{0,80}PREPARE_PACKET_BRIDGE_HEADLINE_READY/);
    expect(src).toContain("PREPARE_PACKET_BRIDGE_HEADLINE_BLOCKED");
    expect(completion).toContain("Continue to signing links");
    expect(completion).toContain("Initials are enabled on each page");
  });
});
