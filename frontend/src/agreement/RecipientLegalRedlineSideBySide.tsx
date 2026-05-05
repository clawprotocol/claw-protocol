import type { ReactNode } from "react";
import type { LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { RecipientLegalRedlineBlockSegments } from "./RecipientLegalRedlineDocument";

function plainCellBody(text: string | undefined): ReactNode {
  const raw = (text ?? "").trim();
  if (!raw) {
    return <span className="text-slate-400">—</span>;
  }
  const pars = raw.split(/\n\n+/);
  return (
    <div className="whitespace-pre-wrap text-left text-[15px] leading-[1.65] text-slate-900">
      {pars.map((p, i) => (
        <p key={i} className="mb-2 last:mb-0">
          {p}
        </p>
      ))}
    </div>
  );
}

type Props = {
  document: LegalRedlineDocumentViewModel;
  showTrackedChanges: boolean;
};

/**
 * Block-aligned side-by-side: one row per legal block (same VM as redline tab).
 * Single scroll container so columns stay vertically aligned.
 */
export function RecipientLegalRedlineSideBySide({ document, showTrackedChanges }: Props) {
  return (
    <div
      className="max-h-[min(72vh,880px)] overflow-y-auto rounded-lg border border-slate-700/50 bg-white shadow-sm"
      data-testid="recipient-side-by-side-block-grid"
    >
      <table className="w-full table-fixed border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-slate-100 shadow-sm">
          <tr>
            <th className="w-[50%] border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
              Current
            </th>
            <th className="w-[50%] border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
              Proposed
            </th>
          </tr>
        </thead>
        <tbody>
          {document.blocks.map((block) => (
            <tr
              key={block.id}
              data-testid="recipient-side-by-side-row"
              data-block-id={block.id}
              data-clause-number={block.clauseNumber ?? ""}
              className={block.hasChange ? "bg-amber-50/40" : ""}
            >
              <td className="border-b border-slate-100 px-3 py-3 align-top text-slate-900">
                {plainCellBody(block.currentText)}
              </td>
              <td
                className="border-b border-slate-100 px-3 py-3 align-top text-slate-900"
                data-testid="recipient-side-by-side-proposed-cell"
              >
                {showTrackedChanges ? (
                  <RecipientLegalRedlineBlockSegments keyPrefix={`ss_${block.id}`} segments={block.segments} />
                ) : (
                  plainCellBody(block.proposedText)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
