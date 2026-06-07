import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import {
  normalizeWorkflowRoleForNegotiation,
  participantDisplayName,
} from "../../agreement/participantModel";
import { reviewActionButtonClass } from "../../agreement/reviewFirstLayout";

export type ReviewLinkPartySimulationRow = {
  partyIndex: number;
  partyLabel: string;
  displayName: string;
  party: AgreementParty;
};

export function buildReviewLinkPartySimulationRows(
  draft: AgreementDraft | null | undefined,
): ReviewLinkPartySimulationRow[] {
  const parties = draft?.parties ?? [];
  const rows: ReviewLinkPartySimulationRow[] = [];
  let reviewerOrdinal = 0;
  for (let i = 0; i < parties.length; i += 1) {
    const p = parties[i]!;
    const role = normalizeWorkflowRoleForNegotiation(String(p.role ?? ""));
    if (role === "viewer") continue;
    reviewerOrdinal += 1;
    rows.push({
      partyIndex: i,
      partyLabel: `Party ${reviewerOrdinal}`,
      displayName: participantDisplayName(p, i),
      party: p,
    });
  }
  return rows;
}

type Props = {
  rows: readonly ReviewLinkPartySimulationRow[];
  busyPartyIndex: number | null;
  onOpenParty: (row: ReviewLinkPartySimulationRow) => void;
};

export function ReviewLinkPartySimulationPanel({ rows, busyPartyIndex, onOpenParty }: Props) {
  if (rows.length === 0) return null;
  return (
    <section
      className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3 text-left"
      data-testid="review-link-party-simulation-panel"
      aria-label="Test reviewer views"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Test reviewer views</h3>
      <ul className="mt-2 space-y-2">
        {rows.map((row) => {
          const busy = busyPartyIndex === row.partyIndex;
          return (
            <li
              key={`${row.partyIndex}-${row.displayName}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
              data-testid={`review-link-party-simulation-row-${row.partyIndex}`}
            >
              <span className="min-w-0 text-sm text-slate-800">
                <span className="font-medium">{row.partyLabel}</span>
                <span className="text-slate-500"> — </span>
                <span>{row.displayName}</span>
              </span>
              <button
                type="button"
                className={reviewActionButtonClass("secondary")}
                data-testid={`review-link-party-simulation-open-${row.partyIndex}`}
                disabled={busyPartyIndex !== null}
                onClick={() => onOpenParty(row)}
              >
                {busy ? "Opening…" : "Open reviewer view"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
