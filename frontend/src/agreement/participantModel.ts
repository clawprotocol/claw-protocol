import type { AgreementDraft } from "./agreementTypes";
import { findOpenRecipientProposals } from "./recipientProposal";

/** Align with backend `_normalize_workflow_role` for gating + labels. */
export function normalizeWorkflowRoleForNegotiation(role: string): string {
  const r = (role || "").trim().toLowerCase();
  if (["owner", "sender", "landlord"].includes(r)) return "owner";
  if (["signer", "signatory"].includes(r)) return "signer";
  if (r === "reviewer") return "reviewer";
  if (["viewer", "counterparty", "fyi", "copy", "read_only", "readonly"].includes(r)) return "viewer";
  return r || "party";
}

export function roleColumnLabel(role: string): string {
  const n = normalizeWorkflowRoleForNegotiation(role);
  if (n === "owner") return "Owner";
  if (n === "signer") return "Signer";
  if (n === "reviewer") return "Reviewer";
  if (n === "viewer") return "Viewer";
  return role?.trim() || "Party";
}

/** Row label: real name from draft, or Party A/B/C only when empty. */
export function participantDisplayName(party: { name?: string | null }, index: number): string {
  const n = (party.name || "").trim();
  if (n) return n;
  if (index === 0) return "Party A";
  if (index === 1) return "Party B";
  return `Party ${String.fromCharCode(65 + index)}`;
}

/** Map intake tokens (party_a / party_b) + workflow roles to table-friendly labels. */
export function humanizePartyRoleForTable(role: string): string {
  const low = (role || "").trim().toLowerCase();
  if (low === "party_a") return "Client";
  if (low === "party_b") return "Consultant";
  if (low === "party") return "Party";
  return roleColumnLabel(role);
}

export function approvedParticipantIds(audit: AgreementDraft["audit_log"] | undefined): Set<string> {
  const out = new Set<string>();
  for (const e of audit || []) {
    if (e.event_type !== "participant_approved" && e.event_type !== "recipient_approved") continue;
    const v = e.value as { participant_id?: string } | undefined;
    const pid = String(v?.participant_id || "").trim();
    if (pid) out.add(pid);
  }
  return out;
}

/**
 * Whether **this** participant has a recorded approval on the audit log.
 *
 * - If any approval event carries a non-empty ``participant_id``, the log is treated as
 *   **multi-reviewer**: only an event whose ``participant_id`` matches ``participantId`` counts.
 * - If no approval event has ``participant_id``, legacy single-recipient semantics apply: any
 *   approval counts for every reviewer context (including when ``participantId`` is set).
 * - When ``participantId`` is empty, only legacy events without ``participant_id`` count.
 */
export function auditHasRecipientApprovalForParticipant(
  audit: AgreementDraft["audit_log"] | undefined,
  participantId: string | null | undefined,
): boolean {
  const want = String(participantId || "").trim();
  const log = audit || [];
  const approvalEvents = log.filter((e) => {
    const t = String(e?.event_type || "").trim();
    return t === "recipient_approved" || t === "participant_approved";
  });
  const anyScopedApproval = approvalEvents.some((e) => {
    const v = e?.value as { participant_id?: string } | undefined;
    return Boolean(String(v?.participant_id || "").trim());
  });
  if (want) {
    if (anyScopedApproval) {
      return approvalEvents.some((e) => {
        const v = e?.value as { participant_id?: string } | undefined;
        return String(v?.participant_id || "").trim() === want;
      });
    }
    return approvalEvents.length > 0;
  }
  for (const e of approvalEvents) {
    const v = e?.value as { participant_id?: string } | undefined;
    if (String(v?.participant_id || "").trim()) continue;
    return true;
  }
  return false;
}

/** Signers (excluding implicit owner) who must approve before server signing lock when party ids exist. */
export function missingSignerApprovals(draft: AgreementDraft | null): string[] {
  if (!draft?.parties?.length) return [];
  if (!draft.parties.some((p) => String(p.id || "").trim())) return [];
  const approved = approvedParticipantIds(draft.audit_log);
  const missing: string[] = [];
  for (const p of draft.parties) {
    if (normalizeWorkflowRoleForNegotiation(p.role) !== "signer") continue;
    const pid = String(p.id || "").trim();
    if (pid && !approved.has(pid)) missing.push(p.name || pid);
  }
  return missing;
}

export type ParticipantRowStatus =
  | "Pending"
  | "Approved"
  | "Signed"
  | "Suggested changes";

export type ParticipantRow = {
  partyId: string;
  name: string;
  roleRaw: string;
  roleLabel: string;
  status: ParticipantRowStatus;
};

export function deriveParticipantRows(draft: AgreementDraft | null): ParticipantRow[] {
  if (!draft?.parties?.length) return [];
  const open = findOpenRecipientProposals(draft.audit_log);
  const byProposer = new Set(
    open.map((p) => String(p.proposer_id || "").trim()).filter(Boolean)
  );
  const approved = approvedParticipantIds(draft.audit_log);
  const docSigned = (draft.audit_log || []).some((e) => e.event_type === "signed");

  return draft.parties.map((p, idx) => {
    const partyId = String(p.id || "").trim() || `legacy_${idx}`;
    const norm = normalizeWorkflowRoleForNegotiation(p.role);
    const roleLabel = humanizePartyRoleForTable(p.role);
    let status: ParticipantRowStatus = "Pending";
    if (norm === "owner") {
      status = "Approved";
    } else if (norm === "signer") {
      if (docSigned) status = "Signed";
      else if (partyId && approved.has(partyId)) status = "Approved";
      else status = "Pending";
    } else if (norm === "reviewer") {
      if (partyId && byProposer.has(partyId)) status = "Suggested changes";
      else if (partyId && approved.has(partyId)) status = "Approved";
      else status = "Pending";
    } else {
      status = "Pending";
    }
    return {
      partyId,
      name: participantDisplayName(p, idx),
      roleRaw: p.role,
      roleLabel,
      status,
    };
  });
}
