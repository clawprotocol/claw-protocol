import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { readPaidProVs01PostSignHandoff } from "../vs01/vs01PaidProPostSignHandoff";
import { filterSupersededStaleDraftWorkspaceRows } from "./supersededStaleDraftWorkspaceRows";

function normId(id: string): string {
  return id.trim();
}

function rowRichnessScore(row: WorkspaceIndexAgreement): number {
  let score = 0;
  if (row.title.trim() && row.title.trim() !== "Untitled agreement") score += 2;
  if (row.party_count > 0) score += 1;
  if (row.version_ledger_count > 0) score += 1;
  if (row.review_sent_at) score += 1;
  if (row.has_server_signing_lock) score += 2;
  if (row.completed_signed) score += 3;
  if (row.reviewer_approved) score += 1;
  if ((row.workspace_tags?.length ?? 0) > 0) score += 1;
  return score;
}

function resolveDocumentIdForRow(row: WorkspaceIndexAgreement): string | null {
  const handoff = readPaidProVs01PostSignHandoff(row.id);
  const doc = handoff?.vs01DocumentId?.trim();
  return doc || null;
}

function pickPreferredRow(
  a: WorkspaceIndexAgreement,
  b: WorkspaceIndexAgreement,
): WorkspaceIndexAgreement {
  const sa = rowRichnessScore(a);
  const sb = rowRichnessScore(b);
  if (sa !== sb) return sa > sb ? a : b;
  const ta = Date.parse(a.updated_at);
  const tb = Date.parse(b.updated_at);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta > tb ? a : b;
  return a;
}

/**
 * Deduplicate workspace index rows by agreement id, then by VS01 document id when present locally.
 */
export function dedupeWorkspaceIndexAgreements(
  rows: WorkspaceIndexAgreement[],
): WorkspaceIndexAgreement[] {
  const withoutSupersededDrafts = filterSupersededStaleDraftWorkspaceRows(rows);
  const byAgreement = new Map<string, WorkspaceIndexAgreement>();
  for (const row of withoutSupersededDrafts) {
    const id = normId(row.id);
    if (!id) continue;
    const prev = byAgreement.get(id);
    byAgreement.set(id, prev ? pickPreferredRow(prev, row) : row);
  }

  const byDocument = new Map<string, WorkspaceIndexAgreement>();
  const withoutDoc: WorkspaceIndexAgreement[] = [];

  for (const row of byAgreement.values()) {
    const docId = resolveDocumentIdForRow(row);
    if (!docId) {
      withoutDoc.push(row);
      continue;
    }
    const prev = byDocument.get(docId);
    byDocument.set(docId, prev ? pickPreferredRow(prev, row) : row);
  }

  const merged = [...withoutDoc, ...byDocument.values()];
  return merged.sort((a, b) => {
    const ta = Date.parse(a.updated_at);
    const tb = Date.parse(b.updated_at);
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });
}
