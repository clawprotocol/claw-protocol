/**
 * Phase 3C — explicit signing authority lifecycle mode.
 * Post-freeze consumers must not infer state from session data presence alone.
 */

export type SigningAuthorityLifecycleMode =
  /** Before signer metadata finalize / freeze boundary. */
  | "pre_freeze"
  /** After freeze, before or during draft packet (not yet activated). */
  | "post_freeze_draft"
  /** Active or partially signed packet — durable backend authority required. */
  | "post_freeze_active"
  /** Completed, cancelled, or superseded — read-only durable authority. */
  | "post_freeze_terminal";

export type PacketLifecycleState =
  | "draft"
  | "active"
  | "partially_signed"
  | "completed"
  | "cancelled"
  | "superseded"
  | "none";

export function isPostFreezeLifecycle(mode: SigningAuthorityLifecycleMode): boolean {
  return mode !== "pre_freeze";
}

export function requiresDurableSnapshot(mode: SigningAuthorityLifecycleMode): boolean {
  return mode === "post_freeze_active" || mode === "post_freeze_terminal";
}

export function resolveLifecycleModeFromPacketState(
  packetState: PacketLifecycleState,
  hasFrozenSnapshot: boolean,
): SigningAuthorityLifecycleMode {
  if (!hasFrozenSnapshot) return "pre_freeze";
  if (packetState === "draft" || packetState === "none") return "post_freeze_draft";
  if (packetState === "active" || packetState === "partially_signed") return "post_freeze_active";
  return "post_freeze_terminal";
}
