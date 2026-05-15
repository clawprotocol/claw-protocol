import type { AgreementDraft } from "../../agreement/agreementTypes";
import { approvedParticipantIds } from "../../agreement/participantModel";
import { openRecipientProposalsForParticipant } from "../../agreement/recipientProposal";

/** Session handoff + mint metadata for one reviewer-specific review link (owner-only). */
export type ReviewerLinkRow = {
  displayName: string;
  reviewHref: string;
  recipientEmail?: string;
  /** Party id used when minting (matches audit participant_id when present). */
  recipientPartyId?: string;
  reviewer_id?: string;
  party_index?: number;
  party_name?: string;
  reviewer_name?: string;
  reviewer_email?: string;
  token_status?: "active" | "unknown" | "expired";
  approval_status?: ReviewerLinkRowApprovalStatus;
  created_at?: string;
  last_opened_at?: string;
};

export type ReviewerLinkRowApprovalStatus = "waiting" | "approved" | "requested_changes" | "not_participating";

const STATUS_LABEL: Record<ReviewerLinkRowApprovalStatus, string> = {
  waiting: "Waiting",
  approved: "Approved",
  requested_changes: "Requested changes",
  not_participating: "Not participating",
};

export function reviewerLinkRowStatusLabel(s: ReviewerLinkRowApprovalStatus): string {
  return STATUS_LABEL[s];
}

/**
 * Redact query token from a review URL for logs (never log full secrets).
 * Returns a short hint like ``https://host/.../review?...`` with ``t=(redacted)``.
 */
export function redactReviewUrlForLog(url: string): string {
  const u = (url || "").trim();
  if (!u) return "";
  try {
    const parsed = new URL(u, "https://placeholder.local");
    if (parsed.searchParams.has("t")) parsed.searchParams.set("t", "(redacted)");
    if (parsed.searchParams.has("token")) parsed.searchParams.set("token", "(redacted)");
    const path = `${parsed.pathname}${parsed.search}`;
    return `${parsed.origin !== "https://placeholder.local" ? parsed.origin : ""}${path}`;
  } catch {
    return u.length > 80 ? `${u.slice(0, 40)}…(redacted)` : "(redacted)";
  }
}

export function deriveReviewerLinkRowApprovalStatus(
  draft: AgreementDraft | null | undefined,
  row: Pick<ReviewerLinkRow, "recipientPartyId" | "reviewer_id" | "party_index">,
  opts: { legacyGlobalApproval: boolean; rowIndex: number },
): ReviewerLinkRowApprovalStatus {
  const pid = String(row.recipientPartyId || row.reviewer_id || "").trim();
  const audit = draft?.audit_log;
  if (pid && audit && openRecipientProposalsForParticipant(audit, pid).length > 0) {
    return "requested_changes";
  }
  const approved = approvedParticipantIds(audit);
  if (pid && approved.has(pid)) return "approved";
  if (opts.legacyGlobalApproval && opts.rowIndex === 0) return "approved";
  return "waiting";
}

export function normalizeHandoffToReviewerLinkRows(
  rows: Array<Partial<ReviewerLinkRow> & { displayName?: string; reviewHref?: string }>,
): ReviewerLinkRow[] {
  const out: ReviewerLinkRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const displayName = String(r.displayName ?? r.reviewer_name ?? "").trim();
    const reviewHref = String(r.reviewHref ?? "").trim();
    if (!displayName || !reviewHref) continue;
    const recipientEmail = String(r.recipientEmail ?? r.reviewer_email ?? "").trim() || undefined;
    const recipientPartyId = String(r.recipientPartyId ?? r.reviewer_id ?? "").trim() || undefined;
    out.push({
      displayName,
      reviewHref,
      ...(recipientEmail ? { recipientEmail, reviewer_email: recipientEmail } : {}),
      ...(recipientPartyId ? { recipientPartyId, reviewer_id: recipientPartyId } : {}),
      ...(typeof r.party_index === "number" ? { party_index: r.party_index } : {}),
      ...(r.party_name ? { party_name: String(r.party_name) } : {}),
      ...(r.reviewer_name ? { reviewer_name: String(r.reviewer_name) } : { reviewer_name: displayName }),
      ...(r.token_status ? { token_status: r.token_status } : {}),
      ...(r.created_at ? { created_at: String(r.created_at) } : {}),
      ...(r.last_opened_at ? { last_opened_at: String(r.last_opened_at) } : {}),
    });
  }
  return out;
}
