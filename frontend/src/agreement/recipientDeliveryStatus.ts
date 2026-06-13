/**
 * Owner-facing recipient delivery status API + types.
 */

import type { AgreementDraft } from "./agreementTypes";
import { clawAgreementHeaders } from "./agreementOrgHeaders";

const base = () => (typeof window !== "undefined" ? window.location.origin : "");

export type RecipientDeliveryPhase = "review" | "signing";

export type RecipientDeliveryStatusKind =
  | "not_sent"
  | "sent"
  | "opened"
  | "approved"
  | "signed"
  | "replaced"
  | "blocked";

export type RecipientDeliveryRow = {
  phase: RecipientDeliveryPhase;
  participant_id: string;
  entity_name: string;
  human_name: string | null;
  email: string;
  role: string;
  status: RecipientDeliveryStatusKind;
  last_sent_at: string | null;
  last_opened_at: string | null;
  resent_count: number;
  locked: boolean;
  lock_reason: string | null;
  can_correct_email: boolean;
  can_resend_invite: boolean;
  can_copy_link: boolean;
};

export type RecipientDeliveryStatusPayload = {
  ok: boolean;
  review_sent: boolean;
  signing_invites_sent: boolean;
  recipients: RecipientDeliveryRow[];
};

export function recipientDeliveryLinkKey(phase: RecipientDeliveryPhase, participantId: string): string {
  return `${phase}:${participantId.trim()}`;
}

export async function fetchRecipientDeliveryStatus(
  agreementId: string,
): Promise<RecipientDeliveryStatusPayload | null> {
  const id = agreementId.trim();
  if (!id) return null;
  try {
    const res = await fetch(
      `${base()}/api/agreements/${encodeURIComponent(id)}/recipient-delivery-status`,
      { headers: clawAgreementHeaders() },
    );
    if (!res.ok) return null;
    return (await res.json()) as RecipientDeliveryStatusPayload;
  } catch {
    return null;
  }
}

export async function postRecipientInviteResend(args: {
  agreementId: string;
  phase: RecipientDeliveryPhase;
  participantId: string;
  signingUrl?: string | null;
  signerRoleId?: string | null;
}): Promise<{ ok: boolean; draft?: AgreementDraft; sentInvite?: boolean; error?: string }> {
  const id = args.agreementId.trim();
  if (!id) return { ok: false, error: "missing_agreement_id" };
  try {
    const res = await fetch(`${base()}/api/agreements/${encodeURIComponent(id)}/recipient-invite-resend`, {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        phase: args.phase,
        participant_id: args.participantId.trim(),
        signing_url: (args.signingUrl ?? "").trim() || null,
        signer_role_id: (args.signerRoleId ?? "").trim() || null,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      draft?: AgreementDraft;
      sent_invite?: boolean;
      detail?: unknown;
    };
    if (!res.ok) {
      const detail = j.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : detail && typeof detail === "object" && "message" in detail
            ? String((detail as { message?: string }).message)
            : `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, draft: j.draft, sentInvite: Boolean(j.sent_invite) };
  } catch {
    return { ok: false, error: "network" };
  }
}

export const RECIPIENT_INVITE_SUPERSEDED_MESSAGE =
  "This invite was replaced. Ask the sender for the latest link.";
