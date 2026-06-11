import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  applyRecipientProposalApi,
  fetchAgreementDraft,
  rejectRecipientProposalApi,
} from "../../agreement/agreementWorkspaceApi";
import {
  OWNER_CTA_ACCEPT_PROPOSED_CHANGES,
  OWNER_CTA_DECLINE_PROPOSED_CHANGES,
  OWNER_NO_PENDING_SUGGESTED_CHANGES,
  OWNER_SUGGESTED_CHANGES_NEED_REVIEW,
  OWNER_SUGGESTED_CHANGES_RECEIVED_TITLE,
} from "../../agreement/ownerRecipientSuggestedEditsCopy";
import {
  corpusFingerprint,
  logOwnerCorpusUpdated,
  logOwnerProposalAccept,
  logOwnerProposalAccepted,
  logOwnerProposalDecline,
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
import {
  acceptedProposalCorpusText,
  logReviewStatusTransition,
  promoteAcceptedReviewCorpus,
} from "../../agreement/reviewCorpusAuthority";
import { resolveReviewFirstDisplayCorpus } from "../../launch/simpleProduct/reviewFirstDisplayCorpus";
import { displayCreatorAgreementTitle } from "../../launch/creatorDashboardPresentation";

function proposalCorpusText(record: RecipientProposalRecord): string {
  const inner = record.draft as Record<string, unknown> | undefined;
  if (!inner) return "";
  const purpose = String(inner.purpose ?? "").trim();
  if (purpose.length >= 120) return purpose;
  const payment = String(inner.payment_terms ?? "").trim();
  return [purpose, payment].filter(Boolean).join("\n\n");
}

type Props = {
  agreementId: string;
  draft: AgreementDraft | null;
  onDraftUpdated?: (draft: AgreementDraft | null) => void;
  onBack?: () => void;
  /** QA-only chrome in OwnerProposalReviewQaPanel wrapper. */
  showQaChrome?: boolean;
};

export function OwnerProposalReviewPanel(props: Props) {
  const { agreementId, draft, onDraftUpdated, onBack, showQaChrome = false } = props;
  const openedLoggedRef = useRef(false);
  const listLoggedRef = useRef("");
  const selectedLoggedRef = useRef("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptFlash, setAcceptFlash] = useState(false);

  const baselineCorpus = useMemo(() => {
    const fromDisplay = resolveReviewFirstDisplayCorpus(draft)?.text.trim();
    if (fromDisplay) return fromDisplay;
    return String(draft?.purpose ?? "").trim();
  }, [draft]);
  const agreementTitle = displayCreatorAgreementTitle(draft?.title ?? "");

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
    if (!draft) return;
    if (openedLoggedRef.current) return;
    openedLoggedRef.current = true;
    logOwnerReviewOpened({
      agreementId,
      proposalCount: records.length,
      openProposalCount: openRecords.length,
    });
  }, [agreementId, draft, openRecords.length, records.length]);

  useEffect(() => {
    if (!draft) return;
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
  }, [agreementId, draft, records]);

  useEffect(() => {
    if (!selected) return;
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
  }, [agreementId, selected]);

  async function acceptProposal() {
    if (!selected || selected.status !== "submitted") return;
    setBusy("accept");
    setError(null);
    const previousHash = corpusFingerprint(baselineCorpus);
    try {
      const r = await applyRecipientProposalApi(agreementId, selected.proposal_id);
      if (!r.ok) throw new Error(r.error || "accept_failed");
      const nextDraft = (r.draft as AgreementDraft | undefined) ?? (await refreshDraft());
      const acceptedPlain =
        acceptedProposalCorpusText(selected.draft) ||
        String(nextDraft?.purpose ?? "").trim() ||
        resolveReviewFirstDisplayCorpus(nextDraft)?.text.trim() ||
        "";
      const promotion = acceptedPlain.trim()
        ? promoteAcceptedReviewCorpus({
            agreementId,
            corpusText: acceptedPlain,
            source: "review_first_final_corpus",
            surface: "proposal_accept",
            beforeAcceptHash: previousHash,
            draft: nextDraft ?? null,
          })
        : null;
      const proposerId = String(selected.proposer_id || "").trim();
      if (proposerId) {
        logReviewStatusTransition({
          agreementId,
          partyId: proposerId,
          from: "requested_changes",
          to: "changes_accepted",
          reason: "recipient_proposal_applied",
        });
      }
      const nextCorpus =
        resolveReviewFirstDisplayCorpus(nextDraft)?.text.trim() || acceptedPlain;
      const updatedHash = corpusFingerprint(nextCorpus);
      logOwnerProposalAccept({
        agreementId,
        proposalId: selected.proposal_id,
        previousCorpusHash: previousHash,
        updatedCorpusHash: updatedHash,
      });
      logOwnerProposalAccepted({
        agreementId,
        proposalId: selected.proposal_id,
        previousCorpusHash: previousHash,
        updatedCorpusHash: updatedHash,
        acceptedCorpusHash: promotion?.acceptedProposalHash ?? updatedHash,
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
      setAcceptFlash(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not accept proposed changes.");
    } finally {
      setBusy(null);
    }
  }

  async function declineProposal() {
    if (!selected || selected.status !== "submitted") return;
    setBusy("decline");
    setError(null);
    const previousHash = corpusFingerprint(baselineCorpus);
    try {
      const r = await rejectRecipientProposalApi(agreementId, selected.proposal_id);
      if (!r.ok) throw new Error(r.error || "decline_failed");
      const nextDraft = await refreshDraft();
      const nextCorpus =
        resolveReviewFirstDisplayCorpus(nextDraft)?.text.trim() || String(nextDraft?.purpose ?? "").trim();
      const rejectedHash = corpusFingerprint(nextCorpus);
      logOwnerProposalDecline({
        agreementId,
        proposalId: selected.proposal_id,
        previousCorpusHash: previousHash,
        declinedCorpusHash: rejectedHash,
      });
      logOwnerProposalRejected({
        agreementId,
        proposalId: selected.proposal_id,
        previousCorpusHash: previousHash,
        rejectedCorpusHash: rejectedHash,
      });
      if (nextDraft) onDraftUpdated?.(nextDraft);
      setSelectedId(null);
      setAcceptFlash(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not decline proposed changes.");
    } finally {
      setBusy(null);
    }
  }

  if (!draft) {
    return (
      <section
        className="rounded-2xl border border-slate-800/70 bg-slate-950/40 px-5 py-6"
        data-testid="owner-proposal-review-panel"
        aria-busy="true"
      >
        <p className="text-sm text-slate-400">Loading agreement…</p>
      </section>
    );
  }

  const proposerLabel = selected?.proposer_display_name || selected?.proposer_id || "Reviewer";

  return (
    <section
      className="rounded-2xl border border-slate-800/70 bg-slate-950/40 px-5 py-6 text-left shadow-sm"
      data-testid="owner-proposal-review-panel"
    >
      {showQaChrome ? (
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">QA owner review</p>
      ) : null}

      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {OWNER_SUGGESTED_CHANGES_RECEIVED_TITLE}
        </p>
        <h1 className="mt-2 text-xl font-semibold text-white">{agreementTitle}</h1>
        {openRecords.length > 0 ? (
          <p className="mt-2 text-sm font-medium text-amber-200/95" data-testid="owner-proposal-review-status">
            {OWNER_SUGGESTED_CHANGES_NEED_REVIEW}
          </p>
        ) : null}
      </header>

      {acceptFlash && openRecords.length === 0 ? (
        <p className="mt-4 text-sm text-emerald-200/95" data-testid="owner-proposal-accept-success">
          Proposed changes were accepted. The draft has been updated. Review may continue until all required
          reviewers approve.
        </p>
      ) : null}

      {openRecords.length === 0 && !acceptFlash ? (
        <div className="mt-4 space-y-4" data-testid="owner-proposal-review-empty">
          <p className="text-sm text-slate-300">{OWNER_NO_PENDING_SUGGESTED_CHANGES}</p>
          {onBack ? (
            <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact" onClick={onBack}>
              Back to dashboard
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {openRecords.length > 1 ? (
            <label className="mt-4 flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-400">Proposal</span>
              <select
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                data-testid="owner-proposal-review-select"
                value={selected?.proposal_id || ""}
                onChange={(e) => setSelectedId(e.target.value || null)}
              >
                {openRecords.map((r) => (
                  <option key={r.proposal_id} value={r.proposal_id}>
                    {(r.proposer_display_name || r.proposer_id || "Reviewer").slice(0, 48)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {selected ? (
            <dl
              className="mt-4 grid gap-3 rounded-xl border border-slate-800/80 bg-slate-900/50 p-4 text-sm sm:grid-cols-2"
              data-testid="owner-proposal-review-metadata"
            >
              <div>
                <dt className="text-slate-500">Suggested by</dt>
                <dd className="font-medium text-slate-100">{proposerLabel}</dd>
              </div>
              {selected.instruction ? (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500">Summary</dt>
                  <dd className="text-slate-200">{selected.instruction}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {diff?.hasMaterialChanges ? (
            <div className="mt-4 space-y-3" data-testid="owner-proposal-review-diff">
              {diff.changedSections.map((section) => (
                <ReviewFirstChangeCard key={`${section.title}-${section.beforePhrase}`} section={section} />
              ))}
            </div>
          ) : selected ? (
            <p className="mt-4 text-sm text-slate-400">No material phrase-level changes detected for this proposal.</p>
          ) : null}

          {selected?.status === "submitted" ? (
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                className="vs01-btn vs01-btn--primary vs01-btn--compact min-w-[11rem]"
                data-testid="owner-proposal-review-accept"
                disabled={busy !== null}
                onClick={() => void acceptProposal()}
              >
                {busy === "accept" ? "Accepting…" : OWNER_CTA_ACCEPT_PROPOSED_CHANGES}
              </button>
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary vs01-btn--compact min-w-[11rem]"
                data-testid="owner-proposal-review-decline"
                disabled={busy !== null}
                onClick={() => void declineProposal()}
              >
                {busy === "decline" ? "Declining…" : OWNER_CTA_DECLINE_PROPOSED_CHANGES}
              </button>
              {onBack ? (
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact min-w-[11rem]"
                  data-testid="owner-proposal-review-back"
                  disabled={busy !== null}
                  onClick={onBack}
                >
                  Back to dashboard
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {error ? (
        <p className="mt-4 text-sm text-rose-300" role="alert" data-testid="owner-proposal-review-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
