import type { ReviewerLinkRow, ReviewerLinkRowApprovalStatus } from "./reviewerLinkRowModel";
import { reviewerLinkRowStatusLabel } from "./reviewerLinkRowModel";

export type PaidProReviewReviewerLinksTableProps = {
  rows: ReviewerLinkRow[];
  statuses: ReviewerLinkRowApprovalStatus[];
  rowCopyFlashByKey: Record<string, boolean>;
  onCopyRow: (rowKey: string, href: string) => void;
  onOpenRow: (
    href: string,
    ctx: { rowIndex: number; partyIndex?: number; recipientId?: string },
  ) => void;
};

function rowKey(i: number): string {
  return `r${i}`;
}

export function PaidProReviewReviewerLinksTable(props: PaidProReviewReviewerLinksTableProps) {
  const { rows, statuses, rowCopyFlashByKey, onCopyRow, onOpenRow } = props;
  if (rows.length <= 1) return null;
  return (
    <div className="mt-5 space-y-3" data-testid="paid-pro-reviewer-links-table">
      <h3 className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reviewer links</h3>
      <div className="overflow-x-auto rounded-lg border border-slate-800/80">
        <table className="w-full min-w-[32rem] text-left text-sm text-slate-200">
          <thead className="border-b border-slate-800/80 bg-slate-950/50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Party</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const k = rowKey(i);
              const st = statuses[i] ?? "waiting";
              const partyLabel = (r.party_name || r.displayName || "—").trim();
              const email = (r.recipientEmail || r.reviewer_email || "").trim() || "—";
              return (
                <tr key={k} className="border-b border-slate-800/40 last:border-b-0">
                  <td className="px-3 py-2.5 font-medium text-slate-100">{partyLabel}</td>
                  <td className="px-3 py-2.5 text-slate-400">{email}</td>
                  <td className="px-3 py-2.5 text-slate-300">{reviewerLinkRowStatusLabel(st)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-800/80"
                        data-testid={`paid-pro-reviewer-copy-${i}`}
                        onClick={() => onCopyRow(k, r.reviewHref)}
                      >
                        {rowCopyFlashByKey[k] ? "Copied." : "Copy link"}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-800/80"
                        data-testid={`paid-pro-reviewer-open-${i}`}
                        onClick={() =>
                          onOpenRow(r.reviewHref, {
                            rowIndex: i,
                            partyIndex: r.party_index,
                            recipientId: r.recipientPartyId || r.reviewer_id,
                          })
                        }
                      >
                        Open reviewer view
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
