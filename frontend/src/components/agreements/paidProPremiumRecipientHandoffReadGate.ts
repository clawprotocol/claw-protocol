/**
 * Prevents empty signer-metadata handoff reads from clobbering a populated session handoff.
 */

import type { PremiumRecipientHandoffV2 } from "./premiumPartyNamesHandoff";
import {
  linearPremiumRecipientSlots,
  premiumRecipientHandoffPartyFingerprint,
} from "./premiumPartyNamesHandoff";
import { signerMetadataInputRaw } from "../../agreement/signerMetadataNormalize";

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
  const corpusHash = (opts?.corpusHash ?? latchedCorpusHash).trim();
  const populatedCount = handoffSignerSlotCount(handoff, partySlotCount);

  if (populatedCount > 0) {
    lastPopulatedHandoff = handoff;
    sessionEverHadPopulatedHandoff = true;
    return handoff;
  }

  if (
    sessionEverHadPopulatedHandoff &&
    lastPopulatedHandoff &&
    partySlotsAreKnown(handoff) &&
    premiumRecipientHandoffPartyFingerprint(handoff) ===
      premiumRecipientHandoffPartyFingerprint(lastPopulatedHandoff) &&
    (!corpusHash || !latchedCorpusHash || corpusHash === latchedCorpusHash)
  ) {
    return mergeSignerFieldsFromPopulated(handoff, lastPopulatedHandoff);
  }

  return handoff;
}

export function readPaidProHandoffReadGateStateForTests(): {
  sessionEverHadPopulatedHandoff: boolean;
  lastPopulatedSignerSlotCount: number;
} {
  return {
    sessionEverHadPopulatedHandoff,
    lastPopulatedSignerSlotCount: lastPopulatedHandoff
      ? handoffSignerSlotCount(lastPopulatedHandoff, 2)
      : 0,
  };
}

export function resetPaidProPremiumRecipientHandoffReadGateForTests(): void {
  lastPopulatedHandoff = null;
  sessionEverHadPopulatedHandoff = false;
  latchedCorpusHash = "";
}
