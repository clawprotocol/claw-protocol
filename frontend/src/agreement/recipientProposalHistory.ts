import type { AgreementDraft } from "./agreementTypes";
import type { PendingRecipientProposalValue } from "./recipientProposal";
import { buildReviewFirstTextDiffSummary } from "./reviewFirstTextDiff";

export type RecipientProposalLifecycleStatus =
  | "staged"
  | "submitted"
  | "accepted"
  | "rejected"
  | "superseded";

export type RecipientProposalRecord = {
  proposal_id: string;
  status: RecipientProposalLifecycleStatus;
  instruction: string;
  proposer_id?: string;
  proposer_display_name?: string;
  submitted_at?: string;
  resolved_at?: string;
  draft?: Record<string, unknown>;
  rendered_html?: string;
  changeCount: number;
};

const STAGED_KEY = "staged_recipient_proposals";

function proposalPayloadFromValue(val: unknown): PendingRecipientProposalValue | null {
  if (!val || typeof val !== "object") return null;
  const v = val as PendingRecipientProposalValue;
  const pid = String(v.proposal_id || "").trim();
  if (!pid) return null;
  return v;
}

function resolveClosureStatus(
  entries: AgreementDraft["audit_log"],
  proposalId: string,
  pendingIndex: number,
): { status: RecipientProposalLifecycleStatus; resolved_at?: string } | null {
  const pid = proposalId.trim();
  for (let j = pendingIndex + 1; j < (entries || []).length; j++) {
    const e = entries![j]!;
    const et = e.event_type || "";
    const val = e.value as { proposal_id?: string } | undefined;
    if (String(val?.proposal_id || "").trim() !== pid) continue;
    if (et === "recipient_proposal_applied") {
      return { status: "accepted", resolved_at: e.at };
    }
    if (et === "recipient_proposal_rejected") {
      return { status: "rejected", resolved_at: e.at };
    }
    if (et === "recipient_proposal_superseded") {
      return { status: "superseded", resolved_at: e.at };
    }
  }
  return null;
}

function stagedProposalsFromDraft(draft: AgreementDraft | null | undefined): Record<string, unknown> {
  const pr = draft?.pro_redline_v1;
  if (!pr || typeof pr !== "object") return {};
  const staged = (pr as Record<string, unknown>)[STAGED_KEY];
  return staged && typeof staged === "object" ? (staged as Record<string, unknown>) : {};
}

function proposalCorpusText(payload: PendingRecipientProposalValue): string {
  const inner = payload.draft as Record<string, unknown> | undefined;
  if (!inner) return "";
  const purpose = String(inner.purpose ?? "").trim();
  if (purpose.length >= 120) return purpose;
  const payment = String(inner.payment_terms ?? "").trim();
  return [purpose, payment].filter(Boolean).join("\n\n");
}

function computeChangeCount(baselineCorpus: string, payload: PendingRecipientProposalValue): number {
  const proposed = proposalCorpusText(payload);
  if (!baselineCorpus.trim() || !proposed.trim()) return 0;
  return buildReviewFirstTextDiffSummary(baselineCorpus, proposed).changedSections.length;
}

/** All recipient proposal records (open + resolved + staged), newest submitted first. */
export function listRecipientProposalRecords(args: {
  draft: AgreementDraft | null | undefined;
  baselineCorpus?: string;
}): RecipientProposalRecord[] {
  const draft = args.draft;
  const audit = draft?.audit_log || [];
  const baseline = (args.baselineCorpus || String(draft?.purpose ?? "")).trim();
  const byId = new Map<string, RecipientProposalRecord>();

  for (let i = 0; i < audit.length; i++) {
    const e = audit[i]!;
    if ((e.event_type || "") !== "recipient_proposal_pending") continue;
    const payload = proposalPayloadFromValue(e.value);
    if (!payload?.draft) continue;
    const pid = payload.proposal_id.trim();
    const closure = resolveClosureStatus(audit, pid, i);
    const status: RecipientProposalLifecycleStatus = closure?.status ?? "submitted";
    byId.set(pid, {
      proposal_id: pid,
      status,
      instruction: String(payload.instruction || "").trim(),
      proposer_id: payload.proposer_id,
      proposer_display_name: payload.proposer_display_name,
      submitted_at: payload.submitted_at || e.at,
      resolved_at: closure?.resolved_at,
      draft: payload.draft as Record<string, unknown>,
      rendered_html: payload.rendered_html,
      changeCount: computeChangeCount(baseline, payload),
    });
  }

  for (const [pid, raw] of Object.entries(stagedProposalsFromDraft(draft))) {
    if (byId.has(pid)) continue;
    const payload = proposalPayloadFromValue(raw);
    if (!payload) continue;
    byId.set(pid, {
      proposal_id: pid,
      status: "staged",
      instruction: String(payload.instruction || "").trim(),
      proposer_id: payload.proposer_id,
      proposer_display_name: payload.proposer_display_name,
      submitted_at: String((raw as { staged_at?: string }).staged_at || "").trim() || undefined,
      draft: payload.draft as Record<string, unknown>,
      rendered_html: payload.rendered_html,
      changeCount: computeChangeCount(baseline, payload),
    });
  }

  return [...byId.values()].sort((a, b) =>
    String(b.submitted_at || b.resolved_at || "").localeCompare(String(a.submitted_at || a.resolved_at || "")),
  );
}

export function openRecipientProposalRecords(records: RecipientProposalRecord[]): RecipientProposalRecord[] {
  return records.filter((r) => r.status === "submitted" || r.status === "staged");
}
