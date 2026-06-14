/**
 * Owner-side recipient email correction — eligibility + API wrappers.
 */

import type { AgreementDraft } from "./agreementTypes";
import { clawAgreementHeaders } from "./agreementOrgHeaders";
import { apiUrl } from "../lib/clawApi";

export const RECIPIENT_EMAIL_CORRECTION_HELPER =
  "Fix a mistyped email without changing the agreement.";

export const SIGNER_ALREADY_SIGNED_EMAIL_BLOCK =
  "This signer has already signed. To change signer identity, create a new signing packet/version.";

export type RecipientEmailCorrectionPhase = "review" | "signing";

export type RecipientEmailCorrectionResult = {
  ok: boolean;
  draft?: AgreementDraft;
  sentInvite?: boolean;
  error?: string;
};

function approvedParticipantIds(draft: AgreementDraft | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const e of draft?.audit_log ?? []) {
    const et = (e.event_type ?? "").trim();
    if (et !== "participant_approved" && et !== "recipient_approved") continue;
    const pid = String((e.value as { participant_id?: string } | undefined)?.participant_id ?? "").trim();
    if (pid) out.add(pid);
  }
  return out;
}

function signedParticipantIds(draft: AgreementDraft | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const e of draft?.audit_log ?? []) {
    if ((e.event_type ?? "").trim() !== "signature_completed") continue;
    const pid = String((e.value as { participant_id?: string } | undefined)?.participant_id ?? "").trim();
    if (pid) out.add(pid);
  }
  return out;
}

function normalizeRole(role: string | undefined): string {
  const r = (role ?? "").trim().toLowerCase();
  if (r === "owner" || r === "sender" || r === "landlord" || r === "client") return "owner";
  return r || "party";
}

export function canCorrectReviewRecipientEmail(args: {
  draft: AgreementDraft | null | undefined;
  participantId: string;
}): { allowed: boolean; reason?: string } {
  const pid = args.participantId.trim();
  if (!pid) return { allowed: false, reason: "missing_participant" };
  const party = args.draft?.parties?.find((p) => (p.id ?? "").trim() === pid);
  if (!party) return { allowed: false, reason: "participant_not_found" };
  if (normalizeRole(party.role) === "owner") return { allowed: false, reason: "owner_not_editable" };
  if (approvedParticipantIds(args.draft).has(pid)) {
    return { allowed: false, reason: "reviewer_already_approved" };
  }
  return { allowed: true };
}

export function canCorrectSigningRecipientEmail(args: {
  draft: AgreementDraft | null | undefined;
  participantId: string;
  signerStatus?: "waiting" | "opened" | "signed" | null;
}): { allowed: boolean; reason?: string } {
  const pid = args.participantId.trim();
  if (!pid) return { allowed: false, reason: "missing_participant" };
  const party = args.draft?.parties?.find((p) => (p.id ?? "").trim() === pid);
  if (!party) return { allowed: false, reason: "participant_not_found" };
  if (signedParticipantIds(args.draft).has(pid) || args.signerStatus === "signed") {
    return { allowed: false, reason: "signer_already_signed" };
  }
  return { allowed: true };
}

function parseApiError(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message?: string }).message || "");
  }
  return "";
}

export async function postReviewRecipientEmailCorrection(args: {
  agreementId: string;
  participantId: string;
  newEmail: string;
  resendInvite?: boolean;
}): Promise<RecipientEmailCorrectionResult> {
  const id = args.agreementId.trim();
  if (!id) return { ok: false, error: "missing_agreement_id" };
  try {
    const res = await fetch(apiUrl(`/api/agreements/${encodeURIComponent(id)}/review-recipient-email`), {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        participant_id: args.participantId.trim(),
        new_email: args.newEmail.trim(),
        resend_invite: args.resendInvite !== false,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      draft?: AgreementDraft;
      sent_invite?: boolean;
      detail?: unknown;
    };
    if (!res.ok) {
      return { ok: false, error: parseApiError(j.detail) || `HTTP ${res.status}` };
    }
    return { ok: true, draft: j.draft, sentInvite: Boolean(j.sent_invite) };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function postSigningRecipientEmailCorrection(args: {
  agreementId: string;
  participantId: string;
  newEmail: string;
  signerRoleId?: string | null;
  signingUrl?: string | null;
  resendInvite?: boolean;
}): Promise<RecipientEmailCorrectionResult> {
  const id = args.agreementId.trim();
  if (!id) return { ok: false, error: "missing_agreement_id" };
  try {
    const res = await fetch(apiUrl(`/api/agreements/${encodeURIComponent(id)}/signing-recipient-email`), {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        participant_id: args.participantId.trim(),
        new_email: args.newEmail.trim(),
        signer_role_id: (args.signerRoleId ?? "").trim() || null,
        signing_url: (args.signingUrl ?? "").trim() || null,
        resend_invite: args.resendInvite !== false,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      draft?: AgreementDraft;
      sent_invite?: boolean;
      detail?: unknown;
    };
    if (!res.ok) {
      return { ok: false, error: parseApiError(j.detail) || `HTTP ${res.status}` };
    }
    return { ok: true, draft: j.draft, sentInvite: Boolean(j.sent_invite) };
  } catch {
    return { ok: false, error: "network" };
  }
}

export function recipientEmailCorrectionErrorMessage(code: string | undefined): string {
  switch ((code ?? "").trim()) {
    case "reviewer_already_approved":
      return "This reviewer already approved. Their email can no longer be changed here.";
    case "signer_already_signed":
      return SIGNER_ALREADY_SIGNED_EMAIL_BLOCK;
    case "invalid_email":
      return "Enter a valid email address.";
    case "email_unchanged":
      return "That is already the saved email address.";
    case "review_not_sent_yet":
      return "Review has not been sent yet. Update the email in signer setup instead.";
    case "signing_url_required":
      return "A signing link is required to resend the invite.";
    default:
      return code ? code.replace(/_/g, " ") : "Could not update email. Try again.";
  }
}
