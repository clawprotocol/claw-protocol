import { useEffect, useState } from "react";
import { postReviewDeliveryDryRun } from "../../agreement/reviewDeliveryDryRunApi";
import { readReviewDeliveryMode } from "./reviewDeliveryConfig";
import type { ReviewerLinkRow, ReviewerLinkRowApprovalStatus } from "./reviewerLinkRowModel";
import { redactReviewUrlForLog, reviewerLinkRowStatusLabel } from "./reviewerLinkRowModel";

export type SimpleDoneReviewFlowDiagPanelProps = {
  visible: boolean;
  agreementId: string;
  requiredReviewerCount: number;
  approvedReviewerCount: number;
  rows: ReviewerLinkRow[];
  statuses: ReviewerLinkRowApprovalStatus[];
};

export function SimpleDoneReviewFlowDiagPanel(props: SimpleDoneReviewFlowDiagPanelProps) {
  const { visible, agreementId, requiredReviewerCount, approvedReviewerCount, rows, statuses } = props;
  const [dryPayloadCount, setDryPayloadCount] = useState<number | null>(null);
  const mode = readReviewDeliveryMode();

  useEffect(() => {
    if (!visible) return;
    let cancel = false;
    void postReviewDeliveryDryRun(agreementId).then((r) => {
      if (!cancel && r) setDryPayloadCount(r.payload_count);
    });
    return () => {
      cancel = true;
    };
  }, [visible, agreementId]);

  if (!visible) return null;

  return (
    <div
      className="mt-6 rounded-lg border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-left text-xs text-amber-100/95"
      data-testid="simple-done-review-flow-diag-panel"
    >
      <p className="font-semibold text-amber-50">QA / diagnostics (review links)</p>
      <p className="mt-1 text-amber-100/85">
        reviewDeliveryMode: <span className="font-mono text-amber-50">{mode}</span>
        {dryPayloadCount !== null ? (
          <>
            {" "}
            · email dry-run payload_count: <span className="font-mono text-amber-50">{dryPayloadCount}</span>
          </>
        ) : null}
      </p>
      <p className="mt-2 text-amber-100/85">
        Reviewers required: <span className="font-mono">{requiredReviewerCount}</span> · Approved (rollup):{" "}
        <span className="font-mono">{approvedReviewerCount}</span> · Minted rows:{" "}
        <span className="font-mono">{rows.length}</span>
      </p>
      <ul className="mt-2 list-decimal space-y-1 pl-5 text-amber-100/90">
        {rows.map((r, i) => (
          <li key={`diag_${i}`} className="break-all">
            {(r.party_name || r.displayName || "—").trim()} — {reviewerLinkRowStatusLabel(statuses[i] ?? "waiting")} ·{" "}
            <span className="font-mono text-[10px] text-amber-200/90">{redactReviewUrlForLog(r.reviewHref)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-amber-200/80">
        Open each reviewer link in a fresh incognito tab or separate browser profile.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {rows.map((r, i) => (
          <span key={`diag_btn_${i}`} className="inline-flex gap-1">
            <button
              type="button"
              className="rounded border border-amber-800/60 px-2 py-0.5 text-[11px] text-amber-50 hover:bg-amber-950/40"
              data-testid={`simple-done-diag-copy-${i}`}
              onClick={() => void navigator.clipboard.writeText(r.reviewHref)}
            >
              Copy {i + 1}
            </button>
            <button
              type="button"
              className="rounded border border-amber-800/60 px-2 py-0.5 text-[11px] text-amber-50 hover:bg-amber-950/40"
              data-testid={`simple-done-diag-open-${i}`}
              onClick={() => {
                if (r.reviewHref.trim()) window.open(r.reviewHref, "_blank", "noopener,noreferrer");
              }}
            >
              Open {i + 1}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
