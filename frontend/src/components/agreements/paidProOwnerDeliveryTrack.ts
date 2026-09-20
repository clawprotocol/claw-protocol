/**
 * Owner-scoped delivery-track persistence.
 * Chosen before signer setup; survives dashboard resume. Not browser-only authority.
 */

import type { AgreementOwnerDeliveryTrack } from "../../agreement/agreementTypes";
import { normalizeAgreementOwnerDeliveryTrack } from "../../agreement/agreementDraftNormalize";
import {
  fetchAgreementDraft,
  fetchAgreementDraftWithSigningLock,
  patchAgreementField,
} from "../../agreement/agreementWorkspaceApi";

export type OwnerDeliveryTrack = AgreementOwnerDeliveryTrack;

const memoryTracks = new Map<string, OwnerDeliveryTrack>();

export function normalizeOwnerDeliveryTrack(value: unknown): OwnerDeliveryTrack | null {
  return normalizeAgreementOwnerDeliveryTrack(value);
}

export function rememberOwnerDeliveryTrack(
  agreementId: string | null | undefined,
  track: OwnerDeliveryTrack,
): void {
  const id = String(agreementId || "").trim();
  if (!id) return;
  memoryTracks.set(id, track);
}

export function readOwnerDeliveryTrack(agreementId?: string | null): OwnerDeliveryTrack | null {
  const id = String(agreementId || "").trim();
  if (!id) return null;
  return memoryTracks.get(id) ?? null;
}

export function hasPersistedOwnerDeliveryTrack(agreementId?: string | null): boolean {
  return readOwnerDeliveryTrack(agreementId) != null;
}

/** Send-for-signature after remount must honor the persisted track, not only in-memory draft. */
export function isPersistedSignatureDeliveryTrack(
  agreementId?: string | null,
  draftTrack?: string | null,
): boolean {
  if (normalizeOwnerDeliveryTrack(draftTrack) === "signature") return true;
  return readOwnerDeliveryTrack(agreementId) === "signature";
}

export function clearOwnerDeliveryTracksForTests(): void {
  memoryTracks.clear();
}

export async function persistOwnerDeliveryTrack(
  agreementId: string | null | undefined,
  track: OwnerDeliveryTrack,
): Promise<boolean> {
  const id = String(agreementId || "").trim();
  const normalized = normalizeOwnerDeliveryTrack(track);
  if (!id || !normalized) return false;
  rememberOwnerDeliveryTrack(id, normalized);
  if (await patchAgreementField(id, "owner_delivery_track", normalized)) return true;
  const existing = await fetchAgreementDraft(id);
  if (normalizeOwnerDeliveryTrack(existing.draft?.owner_delivery_track) === normalized) {
    return true;
  }
  const locked = await fetchAgreementDraftWithSigningLock(id);
  if (normalizeOwnerDeliveryTrack(locked.draft?.owner_delivery_track) === normalized) {
    return true;
  }
  return Boolean(String(locked.lockedVersionId || "").trim());
}
