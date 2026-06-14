import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgreementDraft } from "./agreementTypes";
import { RecipientEmailCorrectionModal } from "./RecipientEmailCorrectionModal";
import {
  postReviewRecipientEmailCorrection,
  postSigningRecipientEmailCorrection,
  recipientEmailCorrectionErrorMessage,
} from "./recipientEmailCorrection";
import {
  fetchRecipientDeliveryStatus,
  postRecipientInviteResend,
  recipientDeliveryLinkKey,
  type RecipientDeliveryPhase,
  type RecipientDeliveryRow,
} from "./recipientDeliveryStatus";
import {
  formatRecipientDeliveryTimestamp,
  filterRecipientRowsByPhase,
  recipientDeliveryRoleLabel,
  recipientDeliveryStatusLabel,
  recipientDisplayName,
} from "./recipientDeliveryPresentation";

export type RecipientControlCenterProps = {
  agreementId: string;
  phase?: RecipientDeliveryPhase | "all";
  /** Active invite URLs keyed by `review:pid` / `signing:pid`. */
  linkByParticipantKey?: Readonly<Record<string, string>>;
  /** Resolve signing URL when not in link map (e.g. from packet handoff). */
  signingUrlForRow?: (row: RecipientDeliveryRow) => string | null;
  signerRoleIdForRow?: (row: RecipientDeliveryRow) => string | null;
  onDraftUpdated?: (draft: AgreementDraft) => void;
  title?: string;
  compact?: boolean;
  className?: string;
};

type EmailCorrectionCtx = {
  phase: RecipientDeliveryPhase;
  participantId: string;
  partyName: string;
  currentEmail: string;
  signingUrl?: string | null;
  signerRoleId?: string | null;
};

export function RecipientControlCenter(props: RecipientControlCenterProps) {
  const {
    agreementId,
    phase = "all",
    linkByParticipantKey = {},
    signingUrlForRow,
    signerRoleIdForRow,
    onDraftUpdated,
    title = "Recipient delivery",
    compact = false,
    className = "",
  } = props;

  const [rows, setRows] = useState<RecipientDeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyFlashKey, setCopyFlashKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [emailCorrection, setEmailCorrection] = useState<EmailCorrectionCtx | null>(null);
  const [emailCorrectionBusy, setEmailCorrectionBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const payload = await fetchRecipientDeliveryStatus(agreementId);
    if (!payload) {
      setError("Could not load recipient status.");
      setRows([]);
    } else {
      setRows(filterRecipientRowsByPhase(payload.recipients, phase));
    }
    setLoading(false);
  }, [agreementId, phase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const linkForRow = useCallback(
    (row: RecipientDeliveryRow): string => {
      const key = recipientDeliveryLinkKey(row.phase, row.participant_id);
      const mapped = (linkByParticipantKey[key] ?? "").trim();
      if (mapped) return mapped;
      if (row.phase === "signing" && signingUrlForRow) {
        return (signingUrlForRow(row) ?? "").trim();
      }
      return "";
    },
    [linkByParticipantKey, signingUrlForRow],
  );

  const copyLink = useCallback(async (row: RecipientDeliveryRow) => {
    const url = linkForRow(row);
    if (!url) return;
    const key = recipientDeliveryLinkKey(row.phase, row.participant_id);
    try {
      await navigator.clipboard.writeText(url);
      setCopyFlashKey(key);
      window.setTimeout(() => setCopyFlashKey((k) => (k === key ? null : k)), 2000);
    } catch {
      /* ignore */
    }
  }, [linkForRow]);

  const resendInvite = useCallback(
    async (row: RecipientDeliveryRow) => {
      const key = recipientDeliveryLinkKey(row.phase, row.participant_id);
      setBusyKey(key);
      try {
        const signingUrl = row.phase === "signing" ? linkForRow(row) : null;
        const result = await postRecipientInviteResend({
          agreementId,
          phase: row.phase,
          participantId: row.participant_id,
          signingUrl,
          signerRoleId: signerRoleIdForRow?.(row) ?? null,
        });
        if (!result.ok) {
          setError(result.error ?? "Could not resend invite.");
          return;
        }
        if (result.draft) onDraftUpdated?.(result.draft);
        await refresh();
      } finally {
        setBusyKey(null);
      }
    },
    [agreementId, linkForRow, onDraftUpdated, refresh, signerRoleIdForRow],
  );

  const submitEmailCorrection = useCallback(
    async (newEmail: string) => {
      const ctx = emailCorrection;
      if (!ctx) return;
      setEmailCorrectionBusy(true);
      try {
        const result =
          ctx.phase === "review"
            ? await postReviewRecipientEmailCorrection({
                agreementId,
                participantId: ctx.participantId,
                newEmail,
                resendInvite: true,
              })
            : await postSigningRecipientEmailCorrection({
                agreementId,
                participantId: ctx.participantId,
                newEmail,
                signerRoleId: ctx.signerRoleId,
                signingUrl: ctx.signingUrl,
                resendInvite: true,
              });
        if (!result.ok) {
          throw new Error(recipientEmailCorrectionErrorMessage(result.error));
        }
        if (result.draft) onDraftUpdated?.(result.draft);
        setEmailCorrection(null);
        await refresh();
      } finally {
        setEmailCorrectionBusy(false);
      }
    },
    [agreementId, emailCorrection, onDraftUpdated, refresh],
  );

  const visibleRows = useMemo(() => rows, [rows]);

  if (loading && visibleRows.length === 0) {
    return (
      <div
        className={`recipient-control-center recipient-control-center--loading ${className}`.trim()}
        data-testid="recipient-control-center"
        aria-busy="true"
      >
        <p className="text-sm text-slate-500">Loading recipient delivery…</p>
      </div>
    );
  }

  if (!loading && visibleRows.length === 0 && !error) {
    return null;
  }

  if (!loading && visibleRows.length === 0 && error) {
    return (
      <div
        className={`recipient-control-center mt-5 space-y-3 ${className}`.trim()}
        data-testid="recipient-control-center"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {title}
          </h3>
          <button
            type="button"
            className="text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
            data-testid="recipient-control-center-retry"
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </div>
        <p className="text-sm text-rose-300" data-testid="recipient-control-center-error">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`recipient-control-center mt-5 space-y-3 ${compact ? "recipient-control-center--compact" : ""} ${className}`.trim()}
      data-testid="recipient-control-center"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h3>
        <button
          type="button"
          className="text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
          data-testid="recipient-control-center-refresh"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </div>
      {error ? (
        <p className="text-sm text-rose-300" data-testid="recipient-control-center-error">
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-slate-800/80">
        <table className="w-full min-w-[40rem] text-left text-sm text-slate-200">
          <thead className="border-b border-slate-800/80 bg-slate-950/50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Recipient</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              {!compact ? <th className="px-3 py-2">Last sent</th> : null}
              {!compact ? <th className="px-3 py-2">Last opened</th> : null}
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const key = recipientDeliveryLinkKey(row.phase, row.participant_id);
              const link = linkForRow(row);
              const hasLink = Boolean(link);
              const isBusy = busyKey === key;
              return (
                <tr
                  key={key}
                  className="border-b border-slate-800/40 last:border-b-0"
                  data-testid={`recipient-control-row-${row.phase}-${row.participant_id}`}
                  data-recipient-status={row.status}
                >
                  <td className="px-3 py-2.5 font-medium text-slate-100">
                    {recipientDisplayName(row)}
                    {row.phase === "signing" ? (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-500">
                        signing
                      </span>
                    ) : (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-500">
                        review
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">{row.email || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-400">{recipientDeliveryRoleLabel(row.role)}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`recipient-control-status recipient-control-status--${row.status}`}
                      data-testid={`recipient-control-status-${row.phase}-${row.participant_id}`}
                    >
                      {recipientDeliveryStatusLabel(row.status)}
                      {row.resent_count > 0 ? (
                        <span className="ml-1 text-xs text-slate-500">· {row.resent_count} resend{row.resent_count === 1 ? "" : "s"}</span>
                      ) : null}
                    </span>
                    {row.locked && row.lock_reason ? (
                      <p className="mt-1 text-xs text-slate-500">{row.lock_reason}</p>
                    ) : null}
                  </td>
                  {!compact ? (
                    <td className="px-3 py-2.5 text-slate-400">
                      {formatRecipientDeliveryTimestamp(row.last_sent_at)}
                    </td>
                  ) : null}
                  {!compact ? (
                    <td className="px-3 py-2.5 text-slate-400">
                      {formatRecipientDeliveryTimestamp(row.last_opened_at)}
                    </td>
                  ) : null}
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-2">
                      {row.can_resend_invite ? (
                        <button
                          type="button"
                          className="rounded-md border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-slate-600"
                          data-testid={`recipient-control-resend-${key}`}
                          disabled={isBusy || (row.phase === "signing" && !hasLink)}
                          onClick={() => void resendInvite(row)}
                        >
                          {isBusy ? "Sending…" : "Resend invite"}
                        </button>
                      ) : null}
                      {row.can_correct_email ? (
                        <button
                          type="button"
                          className="rounded-md border border-amber-700/60 bg-amber-950/30 px-2.5 py-1 text-xs font-medium text-amber-100 hover:border-amber-600"
                          data-testid={`recipient-control-correct-${key}`}
                          onClick={() =>
                            setEmailCorrection({
                              phase: row.phase,
                              participantId: row.participant_id,
                              partyName: row.entity_name,
                              currentEmail: row.email,
                              signingUrl: row.phase === "signing" ? link : null,
                              signerRoleId: signerRoleIdForRow?.(row) ?? null,
                            })
                          }
                        >
                          Correct email
                        </button>
                      ) : null}
                      {row.can_copy_link && hasLink ? (
                        <button
                          type="button"
                          className="rounded-md border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-slate-600"
                          data-testid={`recipient-control-copy-${key}`}
                          onClick={() => void copyLink(row)}
                        >
                          {copyFlashKey === key ? "Copied." : "Copy link"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {emailCorrection ? (
        <RecipientEmailCorrectionModal
          open
          phase={emailCorrection.phase}
          partyName={emailCorrection.partyName}
          currentEmail={emailCorrection.currentEmail}
          busy={emailCorrectionBusy}
          onClose={() => setEmailCorrection(null)}
          onConfirm={(email) => void submitEmailCorrection(email)}
        />
      ) : null}
    </div>
  );
}
