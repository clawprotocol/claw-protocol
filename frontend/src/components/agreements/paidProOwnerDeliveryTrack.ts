/**
 * Owner-scoped delivery-track persistence.
 * Chosen before signer setup; survives dashboard resume. Not browser-only authority.
 */

import { patchAgreementField } from "../../agreement/agreementWorkspaceApi";

export type OwnerDeliveryTrack = "review" | "signature";

const memoryTracks = new Map<string, OwnerDeliveryTrack>();

export function normalizeOwnerDeliveryTrack(value: unknown): OwnerDeliveryTrack | null {
  const v = String(value || "").trim().toLowerCase();
  if (v === "review" || v === "signature") return v;
  return null;
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
  return patchAgreementField(id, "owner_delivery_track", normalized);
}
