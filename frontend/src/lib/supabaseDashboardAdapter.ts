/**
 * Map Supabase dashboard agreement rows to workspace-index card shape.
 * Phase A: backend workspace-index remains canonical; adapter supports tests + future reads.
 */

import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";

export type SupabaseAgreementDashboardRow = {
  id: string;
  organization_id: string;
  title: string;
  agreement_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  workspace_archived_at?: string | null;
  review_sent_at?: string | null;
};

export type SupabaseAgreementPartyRow = {
  agreement_id: string;
  role?: string | null;
  display_name?: string | null;
};

export function mapSupabaseAgreementRowToDashboardCard(
  row: SupabaseAgreementDashboardRow,
  parties: SupabaseAgreementPartyRow[] = [],
): WorkspaceIndexAgreement {
  const partyRows = parties.filter((p) => p.agreement_id === row.id);
  const signerCount = partyRows.filter(
    (p) => String(p.role || "").toLowerCase() === "signer",
  ).length;
  return {
    id: row.id,
    title: (row.title || "").trim() || "Untitled agreement",
    created_at: row.created_at || undefined,
    updated_at: row.updated_at || row.created_at || "",
    party_count: partyRows.length,
    signer_count: signerCount,
    version_ledger_count: 0,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: row.workspace_archived_at ?? null,
    review_sent_at: row.review_sent_at ?? null,
    reviewer_approved: false,
    review_approvals_completed: 0,
    review_approvals_required: 0,
    all_reviewers_approved: false,
  };
}

export function mergeSupabaseRowsWithWorkspaceIndex(
  remoteRows: SupabaseAgreementDashboardRow[],
  existing: WorkspaceIndexAgreement[],
  parties: SupabaseAgreementPartyRow[] = [],
): WorkspaceIndexAgreement[] {
  const byId = new Map(existing.map((row) => [row.id, row]));
  for (const remote of remoteRows) {
    if (!byId.has(remote.id)) {
      byId.set(remote.id, mapSupabaseAgreementRowToDashboardCard(remote, parties));
    }
  }
  return [...byId.values()].sort((a, b) =>
    String(b.updated_at || "").localeCompare(String(a.updated_at || "")),
  );
}
