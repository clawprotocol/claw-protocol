/**
 * Monotonic effective signer metadata counts for review-first UI and diagnostics.
 */

import type { PremiumRecipientHandoffV2 } from "./premiumPartyNamesHandoff";
import { linearPremiumRecipientSlots } from "./premiumPartyNamesHandoff";
import { signerMetadataInputRaw } from "../../agreement/signerMetadataNormalize";

export type SignerMetadataEffectiveCounts = {
  partySlots: number;
  slotsWithSignerName: number;
  slotsWithSignerTitle: number;
};

export function countSignerMetadataSlots(
  handoff: PremiumRecipientHandoffV2 | null,
  partySlotCount = 2,
): SignerMetadataEffectiveCounts {
  const cappedCount = Math.max(partySlotCount, 2);
  const slots = linearPremiumRecipientSlots(handoff, cappedCount);
  return {
    partySlots: slots.length,
    slotsWithSignerName: slots.filter((s) => signerMetadataInputRaw(s.signerName).length > 0).length,
    slotsWithSignerTitle: slots.filter((s) => signerMetadataInputRaw(s.signerTitle).length > 0).length,
  };
}

let sessionMaxSlotsWithSignerName = 0;
let sessionMaxSlotsWithSignerTitle = 0;

export function latchSignerMetadataEffectiveMax(counts: SignerMetadataEffectiveCounts): void {
  sessionMaxSlotsWithSignerName = Math.max(sessionMaxSlotsWithSignerName, counts.slotsWithSignerName);
  sessionMaxSlotsWithSignerTitle = Math.max(sessionMaxSlotsWithSignerTitle, counts.slotsWithSignerTitle);
}

export function readSignerMetadataEffectiveMax(): SignerMetadataEffectiveCounts {
  return {
    partySlots: 2,
    slotsWithSignerName: sessionMaxSlotsWithSignerName,
    slotsWithSignerTitle: sessionMaxSlotsWithSignerTitle,
  };
}

export function readSignerMetadataEffectiveMaxForTests(): SignerMetadataEffectiveCounts {
  return readSignerMetadataEffectiveMax();
}

export function resetSignerMetadataEffectiveMaxForTests(): void {
  sessionMaxSlotsWithSignerName = 0;
  sessionMaxSlotsWithSignerTitle = 0;
  lastLoggedEffectiveFingerprint = "";
}

export function logSignerMetadataStaleEmptyReadIgnored(payload: {
  partySlots: number;
  priorSlotsWithSignerName: number;
  priorSlotsWithSignerTitle: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[signer-metadata-stale-empty-read-ignored]", payload);
}

let lastLoggedEffectiveFingerprint = "";

export function logSignerMetadataEffective(payload: {
  source: string;
  partySlots: number;
  slotsWithSignerName: number;
  slotsWithSignerTitle: number;
  ignoredEmptyRead: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const fp = JSON.stringify(payload);
  if (fp === lastLoggedEffectiveFingerprint) return;
  lastLoggedEffectiveFingerprint = fp;
  // eslint-disable-next-line no-console
  console.info("[signer-metadata-effective]", payload);
}
