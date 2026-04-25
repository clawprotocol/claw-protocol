import {
  CollapsibleDocumentSection,
  DOC_LIST_EMPTY_ESIGN,
  DOC_LIST_SECTION_ORDER,
  DOC_LIST_SECTION_TITLE,
  docListPrimaryCtaForRowStatus,
  DocumentListEmpty,
  DocumentListRow,
  DocumentListSectionGroup,
  DocumentListStacks,
  DocumentListUnstyledUl,
  formatRelativeFromMs,
  type DocListFunnelSection,
  type DocListRowStatus,
} from "../documents/DocumentWorkspaceListUi";
import type { Vs01Counterparty, Vs01Step } from "./types";

/** Mobile-first spacing and type for the quick-send documents rail only. */
const VS01_DOC_SECTION_LAYOUT = "mt-8 first:mt-0 sm:mt-7 sm:first:mt-0";
const VS01_DOC_SECTION_HEADING =
  "m-0 text-sm font-bold uppercase tracking-[0.14em] text-slate-400";
const VS01_DOC_EMPTY_CLASS = "m-0 py-2.5 text-sm leading-relaxed text-slate-400";
const VS01_DOC_ARCHIVE_SECTION = "mt-8 border-t border-slate-800/90 pt-5 sm:mt-7";

function deriveVs01RowPlacement(
  step: Vs01Step
): { section: DocListFunnelSection; status: DocListRowStatus } {
  if (step === 0) return { section: "active", status: "draft" };
  if (step === 1) return { section: "in_progress", status: "in_review" };
  if (step === 2 || step === 3) return { section: "in_progress", status: "pending_signature" };
  return { section: "completed", status: "completed" };
}

export type Vs01DocumentsListProps = {
  documentMeta: { fileName: string } | null;
  documentId: string | null;
  agreementTitle: string;
  counterparties: Vs01Counterparty[];
  step: Vs01Step;
  goToStep: (s: Vs01Step) => void;
  updatedAtMs: number;
};

/**
 * Same four-section document list pattern as Agreement workspace + legacy eSign repository,
 * backed by the current VS01 envelope session (at most one row).
 */
export function Vs01DocumentsList(props: Vs01DocumentsListProps) {
  const { documentMeta, documentId, agreementTitle, counterparties, step, goToStep, updatedAtMs } = props;
  const hasDoc = Boolean((documentId && documentId.trim()) || documentMeta);
  const title =
    (agreementTitle || "").trim() || (documentMeta?.fileName || "").trim() || "Untitled document";
  const sc = counterparties.filter((c) => (c.name || c.email || "").trim()).length;
  const subline = `${sc} ${sc === 1 ? "signer" : "signers"} · Updated ${formatRelativeFromMs(updatedAtMs)}`;

  const placement = hasDoc ? deriveVs01RowPlacement(step) : null;

  return (
    <div className="vs01-documents-list mt-10 max-w-full min-w-0">
      <h3 className="vs01-card-title text-lg font-semibold text-slate-100">Documents</h3>
      <DocumentListStacks>
        {DOC_LIST_SECTION_ORDER.map((sec) => {
          if (sec === "archive") {
            return (
              <CollapsibleDocumentSection
                key={sec}
                title={DOC_LIST_SECTION_TITLE.archive}
                count={0}
                defaultCollapsed
                sectionClassName={VS01_DOC_ARCHIVE_SECTION}
                headingClassName={VS01_DOC_SECTION_HEADING}
              >
                <DocumentListEmpty
                  className={VS01_DOC_EMPTY_CLASS}
                  message={DOC_LIST_EMPTY_ESIGN.archive}
                />
              </CollapsibleDocumentSection>
            );
          }

          const showRow = placement?.section === sec;

          return (
            <DocumentListSectionGroup
              key={sec}
              headingId={`doc-sec-vs01-${sec}`}
              title={DOC_LIST_SECTION_TITLE[sec]}
              sectionClassName={VS01_DOC_SECTION_LAYOUT}
              headingClassName={VS01_DOC_SECTION_HEADING}
            >
              {!hasDoc || !showRow ? (
                <DocumentListEmpty className={VS01_DOC_EMPTY_CLASS} message={DOC_LIST_EMPTY_ESIGN[sec]} />
              ) : (
                <DocumentListUnstyledUl>
                  <li>
                    <DocumentListRow
                      title={title}
                      subline={subline}
                      status={placement.status}
                      primaryCta={docListPrimaryCtaForRowStatus(placement.status)}
                      onPrimaryClick={() => goToStep(step)}
                      overflowItems={[]}
                    />
                  </li>
                </DocumentListUnstyledUl>
              )}
            </DocumentListSectionGroup>
          );
        })}
      </DocumentListStacks>
    </div>
  );
}
