import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  applyRecipientProposalApi,
  fetchAgreementDraft,
  rejectRecipientProposalApi,
} from "../../agreement/agreementWorkspaceApi";
import {
  corpusFingerprint,
  isOwnerProposalReviewQaEnabled,
  logOwnerCorpusUpdated,
  logOwnerProposalAccepted,
  logOwnerProposalListLoaded,
  logOwnerProposalRejected,
  logOwnerProposalSelected,
  logOwnerReviewOpened,
} from "../../agreement/ownerProposalReviewQa";
import {
  listRecipientProposalRecords,
  openRecipientProposalRecords,
  type RecipientProposalRecord,
} from "../../agreement/recipientProposalHistory";
import { ReviewFirstChangeCard } from "../../agreement/ReviewFirstChangeCard";
import { buildReviewFirstTextDiffSummary } from "../../agreement/reviewFirstTextDiff";
import { resolveReviewFirstDisplayCorpus } from "../../launch/simpleProduct/reviewFirstDisplayCorpus";
import {
  OWNER_CTA_ACCEPT_AND_CONTINUE,
  OWNER_CTA_REJECT_SUGGESTIONS,
} from "../../agreement/ownerRecipientSuggestedEditsCopy";

function proposalCorpusText(record: RecipientProposalRecord): string {
  const inner = record.draft as Record<string, unknown> | undefined;
  if (!inner) return "";
  const purpose = String(inner.purpose ?? "").trim();
  if (purpose.length >= 120) return purpose;
  const payment = String(inner.payment_terms ?? "").trim();
  return [purpose, payment].filter(Boolean).join("\n\n");
}

function statusLabel(status: RecipientProposalRecord["status"]): string {
  switch (status) {
    case "staged":
      return "Staged";
    case "submitted":
      return "Submitted";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "superseded":
      return "Superseded";
    default:
      return status;
  }
}

type Props = {
  agreementId: string;
  draft: AgreementDraft | null;
  onDraftUpdated?: (draft: AgreementDraft | null) => void;
  qaEnabled?: boolean;
  /** Owner Done page: show panel when open change requests exist even before ?qaReview=1. */
  forceVisible?: boolean;
};

export function OwnerProposalReviewQaPanel(props: Props) {
  const { agreementId, draft, onDraftUpdated, qaEnabled, forceVisible = false } = props;
  const qaFlagOn = qaEnabled ?? isOwnerProposalReviewQaEnabled();
  const visible = forceVisible || qaFlagOn;
  const openedLoggedRef = useRef(false);
  const listLoggedRef = useRef("");
  const selectedLoggedRef = useRef("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baselineCorpus = useMemo(() => resolveReviewFirstDisplayCorpus(draft)?.text.trim() || "", [draft]);

  const records = useMemo(
    () => listRecipientProposalRecords({ draft, baselineCorpus }),
    [draft, baselineCorpus],
  );

  const openRecords = useMemo(() => openRecipientProposalRecords(records), [records]);

  const selected = useMemo(() => {
    const id = (selectedId || openRecords[0]?.proposal_id || records[0]?.proposal_id || "").trim();
    return records.find((r) => r.proposal_id === id) ?? null;
  }, [records, openRecords, selectedId]);

  const diff = useMemo(() => {
    if (!selected || !baselineCorpus.trim()) return null;
    const proposed = proposalCorpusText(selected);
    if (!proposed.trim()) return null;
    return buildReviewFirstTextDiffSummary(baselineCorpus, proposed);
  }, [baselineCorpus, selected]);

  const refreshDraft = useCallback(async () => {
    const res = await fetchAgreementDraft(agreementId);
    if (res.ok && res.draft) {
      onDraftUpdated?.(res.draft as AgreementDraft);
      return res.draft as AgreementDraft;
    }
    onDraftUpdated?.(null);
    return null;
  }, [agreementId, onDraftUpdated]);

  useEffect(() => {
    if (!visible || !draft) return;
    if (openedLoggedRef.current) return;
    openedLoggedRef.current = true;
    logOwnerReviewOpened({
      agreementId,
      proposalCount: records.length,
      openProposalCount: openRecords.length,
    });
  }, [agreementId, draft, visible, openRecords.length, records.length]);

  useEffect(() => {
    if (!visible || !draft) return;
    const key = JSON.stringify({
      agreementId,
      count: records.length,
      statuses: records.map((r) => `${r.proposal_id}:${r.status}`),
    });
    if (key === listLoggedRef.current) return;
    listLoggedRef.current = key;
    logOwnerProposalListLoaded({
      agreementId,
      proposalCount: records.length,
      statuses: records.map((r) => r.status),
    });
  }, [agreementId, draft, visible, records]);

  useEffect(() => {
    if (!visible || !selected) return;
    const key = `${selected.proposal_id}:${selected.status}`;
    if (key === selectedLoggedRef.current) return;
    selectedLoggedRef.current = key;
    logOwnerProposalSelected({
      agreementId,
      proposalId: selected.proposal_id,
      proposalStatus: selected.status,
      changeCount: selected.changeCount,
      proposerId: selected.proposer_id ?? null,
    });
  }, [agreementId, visible, selected]);

  async function acceptProposal() {
    if (!selected || selected.status !== "submitted") return;
    setBusy("accept");
    setError(null);
    const previousHash = corpusFingerprint(baselineCorpus);
    try {
      const r = await applyRecipientProposalApi(agreementId, selected.proposal_id);
      if (!r.ok) throw new Error(r.error || "accept_failed");
      const nextDraft = (r.draft as AgreementDraft | undefined) ?? (await refreshDraft());
      const nextCorpus =
        resolveReviewFirstDisplayCorpus(nextDraft)?.text.trim() || String(nextDraft?.purpose ?? "").trim();
      const updatedHash = corpusFingerprint(nextCorpus);
      logOwnerProposalAccepted({
        agreementId,
        proposalId: selected.proposal_id,
        previousCorpusHash: previousHash,
        updatedCorpusHash: updatedHash,
        acceptedCorpusHash: updatedHash,
      });
      logOwnerCorpusUpdated({
        agreementId,
        proposalId: selected.proposal_id,
        previousCorpusHash: previousHash,
        updatedCorpusHash: updatedHash,
        source: "accept",
      });
      if (nextDraft) onDraftUpdated?.(nextDraft);
      setSelectedId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not accept proposal.");
    } finally {
      setBusy(null);
    }
  }

  async function rejectProposal() {
    if (!selected || selected.status !== "submitted") return;
    setBusy("reject");
    setError(null);
    const previousHash = corpusFingerprint(baselineCorpus);
    try {
      const r = await rejectRecipientProposalApi(agreementId, selected.proposal_id);
      if (!r.ok) throw new Error(r.error || "reject_failed");
      const nextDraft = await refreshDraft();
      const nextCorpus =
        resolveReviewFirstDisplayCorpus(nextDraft)?.text.trim() || String(nextDraft?.purpose ?? "").trim();
      const rejectedHash = corpusFingerprint(nextCorpus);
      logOwnerProposalRejected({
        agreementId,
        proposalId: selected.proposal_id,
        previousCorpusHash: previousHash,
        rejectedCorpusHash: rejectedHash,
      });
      if (nextDraft) onDraftUpdated?.(nextDraft);
      setSelectedId(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not reject proposal.");
    } finally {
      setBusy(null);
    }
  }

  if (!visible) return null;
  if (!draft) {
    return (
      <section
        className="mt-4 rounded-xl border border-dashed border-violet-400/50 bg-violet-950/10 p-4 text-sm text-violet-100"
        data-testid="owner-proposal-review-qa-panel"
      >
        <p className="font-semibold">QA owner review panel</p>
        <p className="mt-1 text-xs text-violet-200/90">Loading agreement draft…</p>
      </section>
    );
  }

  return (
    <section
      className="mt-4 rounded-xl border border-violet-400/50 bg-violet-950/10 p-4 text-left text-violet-50 shadow-sm"
      data-testid="owner-proposal-review-qa-panel"
    >
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">QA owner review</p>
        <h2 className="mt-1 text-base font-semibold text-violet-50">Recipient proposals (no email required)</h2>
        <p className="mt-1 text-xs leading-relaxed text-violet-200/90">
          Temporary QA path — enable with <code className="text-violet-100">?qaReview=1</code> or{" "}
          <code className="text-violet-100">localStorage.lawdogQaOwnerReview=1</code>.
        </p>
      </header>

      {records.length === 0 ? (
        <p className="mt-3 text-sm text-violet-200/80" data-testid="owner-proposal-qa-empty">
          No suggested changes are pending for this agreement.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
              <span className="font-medium text-violet-200">Proposal</span>
              <select
                className="rounded-md border border-violet-700/60 bg-slate-950 px-2 py-1.5 text-sm text-violet-50"
                data-testid="owner-proposal-qa-select"
                value={selected?.proposal_id || ""}
                onChange={(e) => setSelectedId(e.target.value || null)}
              >
                {records.map((r) => (
                  <option key={r.proposal_id} value={r.proposal_id}>
                    {statusLabel(r.status)} · {(r.proposer_display_name || r.proposer_id || "Reviewer").slice(0, 32)} ·{" "}
                    {r.proposal_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selected ? (
            <dl
              className="mt-3 grid gap-2 rounded-lg border border-violet-800/40 bg-slate-950/40 p-3 text-xs sm:grid-cols-2"
              data-testid="owner-proposal-qa-metadata"
            >
              <div>
                <dt className="text-violet-400">proposal_id</dt>
                <dd className="font-mono text-violet-100">{selected.proposal_id}</dd>
              </div>
              <div>
                <dt className="text-violet-400">status</dt>
                <dd data-testid="owner-proposal-qa-status">{statusLabel(selected.status)}</dd>
              </div>
              <div>
                <dt className="text-violet-400">submitted_at</dt>
                <dd>{selected.submitted_at ? new Date(selected.submitted_at).toLocaleString() : "—"}</dd>
              </div>
              <div>
                <dt className="text-violet-400">proposer</dt>
                <dd>{selected.proposer_display_name || selected.proposer_id || "—"}</dd>
              </div>
              <div>
                <dt className="text-violet-400">change count</dt>
                <dd>{selected.changeCount}</dd>
              </div>
              <div>
                <dt className="text-violet-400">instruction</dt>
                <dd className="line-clamp-2">{selected.instruction || "—"}</dd>
              </div>
            </dl>
          ) : null}

          {diff?.hasMaterialChanges ? (
            <div className="mt-4 space-y-3" data-testid="owner-proposal-qa-diff">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">Phrase-level diff</p>
              {diff.changedSections.map((section) => (
                <ReviewFirstChangeCard key={`${section.title}-${section.beforePhrase}`} section={section} />
              ))}
            </div>
          ) : selected ? (
            <p className="mt-3 text-xs text-violet-300/90">No material phrase-level changes detected for this proposal.</p>
          ) : null}

          {selected?.status === "submitted" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                data-testid="owner-proposal-qa-accept"
                disabled={busy !== null}
                onClick={() => void acceptProposal()}
              >
                {busy === "accept" ? "Accepting…" : OWNER_CTA_ACCEPT_AND_CONTINUE}
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-800/60 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-950/40 disabled:opacity-50"
                data-testid="owner-proposal-qa-reject"
                disabled={busy !== null}
                onClick={() => void rejectProposal()}
              >
                {busy === "reject" ? "Rejecting…" : OWNER_CTA_REJECT_SUGGESTIONS}
              </button>
            </div>
          ) : null}
        </>
      )}

      {error ? (
        <p className="mt-3 text-xs text-rose-200" role="alert" data-testid="owner-proposal-qa-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
