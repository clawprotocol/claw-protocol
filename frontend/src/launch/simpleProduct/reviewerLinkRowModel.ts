import type { AgreementDraft } from "../../agreement/agreementTypes";
import { approvedParticipantIds } from "../../agreement/participantModel";
import { openRecipientProposalsForParticipant } from "../../agreement/recipientProposal";
import { findLastAcceptedProposalProposer } from "../../agreement/reviewCorpusAuthority";

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

export type ReviewerLinkRowApprovalStatus =
  | "waiting"
  | "approved"
  | "requested_changes"
  | "changes_accepted"
  | "not_participating";

const STATUS_LABEL: Record<ReviewerLinkRowApprovalStatus, string> = {
  waiting: "Waiting",
  approved: "Approved",
  requested_changes: "Requested changes",
  changes_accepted: "Changes accepted",
  not_participating: "Not participating",
};

export function reviewerLinkRowStatusLabel(s: ReviewerLinkRowApprovalStatus): string {
  return STATUS_LABEL[s];
}

/**
 * Extract minted access token from a review URL (legacy query ``t`` / ``token`` only).
 * Fragment bootstrap tokens are not extracted here (classification uses href shape only).
 */
export function extractReviewLinkTokenFromHref(href: string): string {
  const u = (href || "").trim();
  if (!u) return "";
  try {
    const parsed = new URL(u, "https://placeholder.local");
    if (parsed.hash.replace(/^#/, "").trim()) {
      return "";
    }
    return (parsed.searchParams.get("t") || parsed.searchParams.get("token") || "").trim();
  } catch {
    return "";
  }
}

export type ReviewLinkPresentationClass =
  | "fragment_invitation"
  | "tokenless_preview"
  | "legacy_query"
  | "malformed_fragment"
  | "unrelated_fragment";

/** Classify review link presentation without persisting or copying token material. */
export function classifyReviewLinkPresentation(href: string): ReviewLinkPresentationClass {
  const u = (href || "").trim();
  if (!u) return "tokenless_preview";
  try {
    const parsed = new URL(u, "https://placeholder.local");
    const onReviewPath = /\/agreements\/[^/]+\/review\/?$/i.test(parsed.pathname.replace(/\/$/, ""));
    const hashRaw = parsed.hash.replace(/^#/, "").trim();
    if (hashRaw) {
      if (!onReviewPath) return "unrelated_fragment";
      const params = new URLSearchParams(hashRaw.includes("=") ? hashRaw : `t=${hashRaw}`);
      const fragTok = (params.get("t") || params.get("token") || "").trim();
      if (fragTok.length >= 8) return "fragment_invitation";
      return "malformed_fragment";
    }
    const queryTok = (parsed.searchParams.get("t") || parsed.searchParams.get("token") || "").trim();
    if (onReviewPath && queryTok) return "legacy_query";
    if (onReviewPath) return "tokenless_preview";
    return "unrelated_fragment";
  } catch {
    return "malformed_fragment";
  }
}

/** True only for tokenless preview routes — fragment invitations are authenticated. */
export function isReviewLinkPreviewOnly(href: string): boolean {
  return classifyReviewLinkPresentation(href) === "tokenless_preview";
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
    const hashRaw = parsed.hash.replace(/^#/, "").trim();
    if (hashRaw) {
      const params = new URLSearchParams(hashRaw.includes("=") ? hashRaw : `t=${hashRaw}`);
      if (params.has("t")) params.set("t", "(redacted)");
      if (params.has("token")) params.set("token", "(redacted)");
      parsed.hash = params.toString() ? `#${params.toString()}` : "#t=(redacted)";
    }
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
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
  const lastAccepted = findLastAcceptedProposalProposer(audit);
  if (pid && lastAccepted?.proposerId === pid) return "changes_accepted";
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
