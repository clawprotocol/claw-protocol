/**
 * Confirmation before paid-session direct signing.
 *
 * Emails alone are never names-and-emails-complete. Confirmation also requires
 * durable participant bindings and matching agreement / org / session authority.
 */

import { looksLikeEmail } from "./recipientEmailValidation";

export const PAID_PRO_SIGNATURE_CONFIRMATION_MIN_SIGNERS = 2;

export type PaidProSignatureConfirmationReason =
  | "emails_only"
  | "names_incomplete"
  | "emails_incomplete"
  | "missing_participant"
  | "mismatched_participant"
  | "stale_agreement"
  | "stale_org"
  | "stale_session"
  | "missing_authority";

export type PaidProSignatureConfirmationSlot = {
  name?: string | null;
  email?: string | null;
  participantId?: string | null;
};

export type PaidProSignatureConfirmationArgs = {
  slots: readonly PaidProSignatureConfirmationSlot[];
  expectedParticipantIds: readonly string[];
  currentAgreementId?: string | null;
  expectedAgreementId?: string | null;
  currentOrganizationId?: string | null;
  expectedOrganizationId?: string | null;
  currentSessionId?: string | null;
  expectedSessionId?: string | null;
  hasVerifiedAuthority: boolean;
};

export type PaidProSignatureConfirmationResult =
  | { ok: true }
  | { ok: false; reason: PaidProSignatureConfirmationReason };

export type PersistedSignatureConfirmationParty = {
  id?: string | null;
  name?: string | null;
  signerName?: string | null;
  signer_name?: string | null;
  email?: string | null;
};

function trim(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/** Remounted owner workspace: confirm from persisted parties, not empty React slots. */
export function signatureConfirmationSlotsFromPersistedParties(
  parties: readonly PersistedSignatureConfirmationParty[],
  uiSlots: readonly PaidProSignatureConfirmationSlot[] = [],
): PaidProSignatureConfirmationSlot[] {
  const persisted = parties
    .map((party) => ({
      legalName: trim(party.name),
      name: trim(party.signerName || party.signer_name),
      email: trim(party.email),
      participantId: trim(party.id),
    }))
    .filter((party) => party.legalName.length >= 2);
  if (!persisted.length) {
    return uiSlots
      .map((slot) => ({
        name: trim(slot.name),
        email: trim(slot.email),
        participantId: trim(slot.participantId),
      }))
      .filter((slot) => slot.name || slot.email || slot.participantId);
  }
  return persisted.map((party, index) => {
    const ui =
      uiSlots.find((slot) => trim(slot.participantId) && trim(slot.participantId) === party.participantId) ||
      uiSlots[index];
    return {
      name: trim(ui?.name) || party.name,
      email: trim(ui?.email) || party.email,
      participantId: party.participantId || trim(ui?.participantId),
    };
  });
}

export function resolvePaidProSignatureConfirmationAuthority(
  args: PaidProSignatureConfirmationArgs,
): PaidProSignatureConfirmationResult {
  if (!args.hasVerifiedAuthority) return { ok: false, reason: "missing_authority" };

  const currentAgreementId = trim(args.currentAgreementId);
  const expectedAgreementId = trim(args.expectedAgreementId);
  if (!currentAgreementId || !expectedAgreementId || currentAgreementId !== expectedAgreementId) {
    return { ok: false, reason: "stale_agreement" };
  }

  const expectedOrg = trim(args.expectedOrganizationId);
  const currentOrg = trim(args.currentOrganizationId);
  if (expectedOrg && currentOrg !== expectedOrg) {
    return { ok: false, reason: "stale_org" };
  }

  const expectedSession = trim(args.expectedSessionId);
  const currentSession = trim(args.currentSessionId);
  if (expectedSession && currentSession !== expectedSession) {
    return { ok: false, reason: "stale_session" };
  }

  const slots = args.slots || [];
  if (slots.length < PAID_PRO_SIGNATURE_CONFIRMATION_MIN_SIGNERS) {
    return { ok: false, reason: "names_incomplete" };
  }

  const names = slots.map((slot) => trim(slot.name));
  const emails = slots.map((slot) => trim(slot.email));
  const namesOk = names.every((name) => name.length >= 2);
  const emailsOk = emails.every((email) => looksLikeEmail(email));

  if (emailsOk && !namesOk) return { ok: false, reason: "emails_only" };
  if (!namesOk) return { ok: false, reason: "names_incomplete" };
  if (!emailsOk) return { ok: false, reason: "emails_incomplete" };

  const ids = slots.map((slot) => trim(slot.participantId));
  if (ids.some((id) => !id)) return { ok: false, reason: "missing_participant" };
  if (new Set(ids).size !== ids.length) return { ok: false, reason: "mismatched_participant" };

  const expected = (args.expectedParticipantIds || []).map(trim).filter(Boolean);
  if (expected.length !== ids.length) return { ok: false, reason: "mismatched_participant" };
  const expectedSet = new Set(expected);
  if (ids.some((id) => !expectedSet.has(id))) return { ok: false, reason: "mismatched_participant" };

  return { ok: true };
}
