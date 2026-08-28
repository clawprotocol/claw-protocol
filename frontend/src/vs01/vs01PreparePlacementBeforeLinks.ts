/**
 * Prepare-for-signing must reach field placement before links-ready.
 *
 * First failing predicate after #139/#140 (stay-off-dashboard closed):
 * `StepPrepareSignature` auto-dispatched continue when `packetReady` flipped
 * from the canonical model (corpus signature lines), then
 * `completeBridgePreparePacket` / `stayOnPrivateSigningLinks` called
 * `goToStep(3)` (StepSigningPacketStatus) with `fieldsPlacedCount: 0`.
 * #139 removed seal+invite so the buyer stayed off `/app?vs01_packet_ready=1`,
 * but that same jump skipped the placement surface.
 *
 * Links-ready is not commercial while no fields are placed. Open signing view
 * must reuse the seeded vs01 document — do not remint a second packet identity.
 */

import { readPaidProVs01PostSignHandoff } from "./vs01PaidProPostSignHandoff";
import { readAgreementFieldsPlacedCount } from "./vs01WorkspaceSigningStatus";
import { readAgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";

export const FIRST_FAILING_PLACEMENT_SKIP_PREDICATE =
  "bridge_auto_prepare_jumps_links_ready_with_zero_placed_fields" as const;

export const PLACEMENT_BEFORE_LINKS_STAY_REASON = "stay_on_placement_until_fields_placed" as const;
export const LINKS_READY_REQUIRES_PLACED_FIELDS_REASON = "links_ready_requires_placed_fields" as const;
export const REUSE_SEEDED_DOCUMENT_REASON = "reuse_seeded_vs01_document" as const;

export type PrepareAfterSeedStep = 2 | 3;

export function countPlacedSigningFields(args: {
  senderPlacedCount?: number;
  recipientPlacedCount?: number;
  portableFieldCount?: number;
  storedFieldsPlacedCount?: number;
}): number {
  const sender = Math.max(0, Math.floor(args.senderPlacedCount ?? 0));
  const recipient = Math.max(0, Math.floor(args.recipientPlacedCount ?? 0));
  const portable = Math.max(0, Math.floor(args.portableFieldCount ?? 0));
  const stored = Math.max(0, Math.floor(args.storedFieldsPlacedCount ?? 0));
  return Math.max(sender + recipient, portable, stored);
}

/** Links-ready / StepSigningPacketStatus is illegal while nothing is placed. */
export function canClaimPrivateSigningLinksReady(fieldsPlacedCount: number): boolean {
  return Number.isFinite(fieldsPlacedCount) && fieldsPlacedCount > 0;
}

export function resolvePrepareStepAfterSeed(args: {
  fieldsPlacedCount: number;
  packetPrepared?: boolean;
}): { step: PrepareAfterSeedStep; reason: string } {
  if (canClaimPrivateSigningLinksReady(args.fieldsPlacedCount)) {
    return {
      step: 3,
      reason: LINKS_READY_REQUIRES_PLACED_FIELDS_REASON,
    };
  }
  return {
    step: 2,
    reason: PLACEMENT_BEFORE_LINKS_STAY_REASON,
  };
}

/**
 * Remount / idempotent Prepare: never skip to links-ready with 0 fields,
 * even if a prior #139 jump marked the packet prepared.
 */
export function resolveRemountPrepareStep(args: {
  agreementId: string;
  senderPlacedCount?: number;
  recipientPlacedCount?: number;
}): { step: PrepareAfterSeedStep; fieldsPlacedCount: number; reason: string } {
  const stored = readAgreementFieldsPlacedCount(args.agreementId);
  const fieldsPlacedCount = countPlacedSigningFields({
    senderPlacedCount: args.senderPlacedCount,
    recipientPlacedCount: args.recipientPlacedCount,
    storedFieldsPlacedCount: stored,
  });
  const landing = resolvePrepareStepAfterSeed({
    fieldsPlacedCount,
    packetPrepared: true,
  });
  return { ...landing, fieldsPlacedCount };
}

/** Prefer the already-seeded vs01 document. Never remint when one exists. */
export function resolveExistingPreparedDocumentId(agreementId: string): string | null {
  const id = agreementId.trim();
  if (!id) return null;
  const bridge = readAgreementVs01BridgeSession();
  const fromBridge = (bridge?.agreementId === id ? bridge.vs01DocumentId : "").trim();
  if (fromBridge && fromBridge !== "pending") return fromBridge;
  const fromHandoff = (readPaidProVs01PostSignHandoff(id)?.vs01DocumentId || "").trim();
  if (fromHandoff) return fromHandoff;
  return null;
}

export function signingViewUsesPreparedDocument(args: {
  seededDocumentId: string;
  signingUrl: string;
}): boolean {
  const seeded = args.seededDocumentId.trim();
  if (!seeded) return false;
  const url = (args.signingUrl || "").trim();
  if (!url) return false;
  try {
    const u = new URL(url, "https://lawdog.local");
    const pathDoc = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const queryDoc = (u.searchParams.get("document_id") || "").trim();
    const decodedPath = decodeURIComponent(pathDoc);
    if (decodedPath !== seeded && queryDoc && queryDoc !== seeded) return false;
    return decodedPath === seeded || queryDoc === seeded || url.includes(seeded);
  } catch {
    return url.includes(seeded);
  }
}
