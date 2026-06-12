/**
 * Prevents empty signer-metadata handoff reads from clobbering a populated session handoff.
 */

import type { PremiumRecipientHandoffV2 } from "./premiumPartyNamesHandoff";
import {
  linearPremiumRecipientSlots,
  premiumRecipientHandoffPartyFingerprint,
} from "./premiumPartyNamesHandoff";
import { signerMetadataInputRaw } from "../../agreement/signerMetadataNormalize";
import {
  countSignerMetadataSlots,
  latchSignerMetadataEffectiveMax,
  logSignerMetadataEffective,
  logSignerMetadataStaleEmptyReadIgnored,
  readSignerMetadataEffectiveMax,
  resetSignerMetadataEffectiveMaxForTests,
} from "./signerMetadataEffective";

let lastPopulatedHandoff: PremiumRecipientHandoffV2 | null = null;
let sessionEverHadPopulatedHandoff = false;
let latchedCorpusHash = "";

function handoffSignerSlotCount(handoff: PremiumRecipientHandoffV2, partySlotCount: number): number {
  const slots = linearPremiumRecipientSlots(handoff, Math.max(partySlotCount, 2));
  return slots.filter((s) => signerMetadataInputRaw(s.signerName).length > 0).length;
}

function partySlotsAreKnown(handoff: PremiumRecipientHandoffV2): boolean {
  const fp = premiumRecipientHandoffPartyFingerprint(handoff);
  return fp.length > 0;
}

function mergeSignerFieldsFromPopulated(
  current: PremiumRecipientHandoffV2,
  populated: PremiumRecipientHandoffV2,
): PremiumRecipientHandoffV2 {
  const slotCount = Math.max(
    2 + (current.partyIndexSlots?.length ?? 0),
    2 + (populated.partyIndexSlots?.length ?? 0),
  );
  const curSlots = linearPremiumRecipientSlots(current, slotCount);
  const popSlots = linearPremiumRecipientSlots(populated, slotCount);
  const mergeOne = (
    cur: (typeof curSlots)[number],
    pop: (typeof popSlots)[number],
  ) => ({
    name: cur.name || pop.name,
    email: cur.email || pop.email,
    role: cur.role || pop.role || "party",
    signerName: signerMetadataInputRaw(cur.signerName) || signerMetadataInputRaw(pop.signerName),
    signerTitle: signerMetadataInputRaw(cur.signerTitle) || signerMetadataInputRaw(pop.signerTitle),
    partyAddress: cur.partyAddress || pop.partyAddress,
  });
  const party1 = mergeOne(curSlots[0] ?? { name: "", email: "", role: "" }, popSlots[0] ?? { name: "", email: "", role: "" });
  const party2 = mergeOne(curSlots[1] ?? { name: "", email: "", role: "" }, popSlots[1] ?? { name: "", email: "", role: "" });
  const extra = (current.partyIndexSlots ?? []).map((slot, i) =>
    mergeOne(
      slot ?? { name: "", email: "", role: "" },
      popSlots[i + 2] ?? { name: "", email: "", role: "" },
    ),
  );
  return {
    v: 2,
    party1,
    party2,
    savedAt: current.savedAt,
    ...(extra.length ? { partyIndexSlots: extra } : {}),
  };
}

export function latchPaidProHandoffReadGateCorpusHash(hash: string | null | undefined): void {
  latchedCorpusHash = (hash ?? "").trim();
}

export function applyPremiumRecipientHandoffReadGate(
  handoff: PremiumRecipientHandoffV2 | null,
  opts?: { partySlotCount?: number; corpusHash?: string | null },
): PremiumRecipientHandoffV2 | null {
  if (!handoff) return null;
  const partySlotCount = Math.max(opts?.partySlotCount ?? 2, 2);
  if ((opts?.corpusHash ?? "").trim()) {
    latchedCorpusHash = (opts?.corpusHash ?? "").trim();
  }
  const populatedCount = handoffSignerSlotCount(handoff, partySlotCount);

  const counts = countSignerMetadataSlots(handoff, partySlotCount);

  if (populatedCount > 0) {
    lastPopulatedHandoff = handoff;
    sessionEverHadPopulatedHandoff = true;
    latchSignerMetadataEffectiveMax(counts);
    logSignerMetadataEffective({
      source: "handoff_read_populated",
      partySlots: counts.partySlots,
      slotsWithSignerName: counts.slotsWithSignerName,
      slotsWithSignerTitle: counts.slotsWithSignerTitle,
      ignoredEmptyRead: false,
    });
    return handoff;
  }

  const priorPopulated = lastPopulatedHandoff
    ? countSignerMetadataSlots(lastPopulatedHandoff, partySlotCount)
    : null;
  const monotonicMax = readSignerMetadataEffectiveMax();
  const partyFingerprintMatch =
    partySlotsAreKnown(handoff) &&
    lastPopulatedHandoff &&
    partySlotsAreKnown(lastPopulatedHandoff) &&
    premiumRecipientHandoffPartyFingerprint(handoff) ===
      premiumRecipientHandoffPartyFingerprint(lastPopulatedHandoff);
  const monotonicSignerLatchSatisfied =
    monotonicMax.slotsWithSignerName >= 2 &&
    (priorPopulated?.slotsWithSignerName ?? 0) >= 2;

  if (
    sessionEverHadPopulatedHandoff &&
    lastPopulatedHandoff &&
    (partyFingerprintMatch || monotonicSignerLatchSatisfied)
  ) {
    logSignerMetadataStaleEmptyReadIgnored({
      partySlots: counts.partySlots,
      priorSlotsWithSignerName: priorPopulated?.slotsWithSignerName ?? monotonicMax.slotsWithSignerName,
      priorSlotsWithSignerTitle: priorPopulated?.slotsWithSignerTitle ?? monotonicMax.slotsWithSignerTitle,
    });
    const merged = mergeSignerFieldsFromPopulated(handoff, lastPopulatedHandoff);
    const mergedCounts = countSignerMetadataSlots(merged, partySlotCount);
    latchSignerMetadataEffectiveMax(mergedCounts);
    logSignerMetadataEffective({
      source: "handoff_read_stale_empty_merged",
      partySlots: mergedCounts.partySlots,
      slotsWithSignerName: mergedCounts.slotsWithSignerName,
      slotsWithSignerTitle: mergedCounts.slotsWithSignerTitle,
      ignoredEmptyRead: true,
    });
    return merged;
  }

  if (populatedCount === 0) {
    logSignerMetadataEffective({
      source: "handoff_read_empty",
      partySlots: counts.partySlots,
      slotsWithSignerName: counts.slotsWithSignerName,
      slotsWithSignerTitle: counts.slotsWithSignerTitle,
      ignoredEmptyRead: false,
    });
  }
  return handoff;
}

export function readPaidProHandoffReadGateStateForTests(): {
  sessionEverHadPopulatedHandoff: boolean;
  lastPopulatedSignerSlotCount: number;
  latchedCorpusHash: string;
} {
  return {
    sessionEverHadPopulatedHandoff,
    lastPopulatedSignerSlotCount: lastPopulatedHandoff
      ? handoffSignerSlotCount(lastPopulatedHandoff, 2)
      : 0,
    latchedCorpusHash,
  };
}

export function resetPaidProPremiumRecipientHandoffReadGateForTests(): void {
  clearPaidProPremiumRecipientHandoffReadGate();
}

/** Clears in-memory signer handoff latch (fresh free starter / new agreement session). */
export function clearPaidProPremiumRecipientHandoffReadGate(): void {
  lastPopulatedHandoff = null;
  sessionEverHadPopulatedHandoff = false;
  latchedCorpusHash = "";
  resetSignerMetadataEffectiveMaxForTests();
}
