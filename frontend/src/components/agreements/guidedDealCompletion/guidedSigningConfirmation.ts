/**
 * Guided Pro final review → signing confirmation (no second recipient setup).
 */

import type { CanonicalPartyIdentity } from "./signerPartyIdentity";
import { formatSignerPartyIdentityConfirmationLines } from "./signerPartyIdentity";

export type GuidedSigningPacketBlockReason =
  | "signers_incomplete"
  | "authoritative_body_missing"
  | "party_placeholders_unresolved";

export type GuidedSigningPacketGateResult = {
  ok: boolean;
  reason: GuidedSigningPacketBlockReason | null;
  bodyLen: number;
};

export type EvaluateGuidedSigningPacketGateArgs = {
  signersComplete: boolean;
  authoritativeBodyLen: number;
  partyPlaceholdersUnresolved?: boolean;
  minBodyLen?: number;
};

export function evaluateGuidedSigningPacketGate(
  args: EvaluateGuidedSigningPacketGateArgs,
): GuidedSigningPacketGateResult {
  const bodyLen = args.authoritativeBodyLen;
  const minLen = args.minBodyLen ?? 500;
  if (!args.signersComplete) {
    return { ok: false, reason: "signers_incomplete", bodyLen };
  }
  if (bodyLen < minLen) {
    return { ok: false, reason: "authoritative_body_missing", bodyLen };
  }
  if (args.partyPlaceholdersUnresolved) {
    return { ok: false, reason: "party_placeholders_unresolved", bodyLen };
  }
  return { ok: true, reason: null, bodyLen };
}

export function formatGuidedSigningConfirmationSignerLines(
  identities: readonly CanonicalPartyIdentity[],
): string[] {
  return formatSignerPartyIdentityConfirmationLines(identities);
}

export function logGuidedFinalReviewSendSignatureStart(payload: { bodyLen: number }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-send-signature-start]", payload);
}

export function logGuidedFinalReviewSigningPacketReady(payload: {
  bodyLen: number;
  signerCount: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-signing-packet-ready]", payload);
}

export function logGuidedFinalReviewSigningBlocked(
  reason: GuidedSigningPacketBlockReason,
  payload?: { bodyLen?: number },
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-signing-blocked]", { reason, ...payload });
}

export function logGuidedSigningConfirmationMounted(payload: {
  bodyLen: number;
  signerCount: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-signing-confirmation-mounted]", payload);
}
