import type { ReactNode } from "react";
import type { RedlineSegmentVM } from "./recipientPreviewDiffModel";
import type { LegalRedlineDocumentViewModel, LegalRedlineSegment } from "./legalRedlineBlocks";

type Props = {
  /** @deprecated Prefer {@link document} for block-aware redline. */
  segments?: RedlineSegmentVM[];
  document?: LegalRedlineDocumentViewModel;
  /** `suggested` — recipient single-surface review: contract typography, inline track marks only (no heavy block chrome). */
  variant?: "page" | "column" | "suggested";
};

type AnySeg = LegalRedlineSegment | RedlineSegmentVM;

/** Exported for tests: split segment body into paragraphs, then lines. */
export function splitSegmentTextToParagraphLines(text: string): string[][] {
  const raw = String(text ?? "");
  if (!raw) return [];
  return raw.split(/\n\n+/).map((block) => block.split(/\n/));
}

/** Lines like "3. Compensation" or "3.1 Payment Schedule" get slightly stronger typography. */
export function lineLooksLikeSectionHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 4 || t.length > 160) return false;
  return /^\d+(?:\.\d+)*\.?\s+\S/.test(t);
}

export function segmentLineClass(type: "same" | "insert" | "delete"): string {
  if (type === "same") {
    return "recipient-legal-redline-same text-[15px] leading-[1.65] text-slate-900";
  }
  if (type === "insert") {
    return [
      "recipient-legal-redline-insert",
      "text-[15px] leading-[1.65]",
      "rounded-sm px-1.5 py-0.5",
      "font-semibold text-emerald-950",
      "bg-emerald-200/95",
      "underline decoration-emerald-700 decoration-2 underline-offset-2",
      "shadow-sm ring-1 ring-emerald-600/40",
    ].join(" ");
  }
  return [
    "recipient-legal-redline-delete",
    "text-[15px] leading-[1.65]",
    "rounded-sm px-1.5 py-0.5",
    "font-medium text-rose-950",
    "bg-rose-100",
    "line-through decoration-2 decoration-rose-800",
    "shadow-sm ring-1 ring-rose-600/35",
  ].join(" ");
}

function renderSegmentStream(segments: AnySeg[], keyPrefix: string): ReactNode[] {
  return segments.flatMap((seg, segIdx) => {
    const blocks = splitSegmentTextToParagraphLines(seg.text);
    if (blocks.length === 0) {
      return [
        <div key={`${keyPrefix}_e_${segIdx}`} className="mb-3">
          <span data-redline={seg.type} className={`block ${segmentLineClass(seg.type)}`}>
            {"\u00a0"}
          </span>
        </div>,
      ];
    }
    return blocks.map((lines, blockIdx) => {
      const key = `${keyPrefix}_s${segIdx}_b${blockIdx}`;
      const firstLine = lines[0] ?? "";
      const heading = lineLooksLikeSectionHeading(firstLine);
      return (
        <div key={key} className={heading ? "mb-3 mt-4 border-b border-slate-200 pb-2 first:mt-0" : "mb-2 last:mb-0"}>
          {lines.map((line, li) => {
            const isFirstHeadingLine = heading && li === 0 && seg.type === "same";
            return (
              <span
                key={li}
                data-redline={seg.type}
                className={`block ${segmentLineClass(seg.type)} ${
                  isFirstHeadingLine ? "text-[16px] font-semibold tracking-tight text-slate-900" : ""
                }`.trim()}
              >
                {line.length > 0 ? line : "\u00a0"}
              </span>
            );
          })}
        </div>
      );
    });
  });
}

/** Renders tracked-change segments (used in redline doc and side-by-side proposed cells). */
export function RecipientLegalRedlineBlockSegments({
  segments,
  keyPrefix,
}: {
  segments: LegalRedlineSegment[];
  keyPrefix: string;
}): ReactNode {
  return <div className="space-y-0">{renderSegmentStream(segments, keyPrefix)}</div>;
}

export function RecipientLegalRedlineDocument({ segments, document, variant = "page" }: Props) {
  const shell =
    variant === "suggested"
      ? "mx-auto w-full max-w-[40rem] rounded-md border border-slate-200/95 bg-white px-7 py-9 text-[15px] leading-[1.7] text-slate-900 shadow-sm sm:px-10 sm:py-11"
      : variant === "page"
        ? "mx-auto w-full max-w-[42rem] rounded-lg border border-slate-300/90 bg-white px-6 py-8 shadow-md sm:px-10 sm:py-10"
        : "mx-auto w-full max-w-none rounded-md border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-5 sm:py-6";

  return (
    <article
      className={`recipient-legal-redline-document ${shell}`}
      data-testid="recipient-legal-redline-document"
    >
      {document ? (
        <div className="space-y-0">
          {document.blocks.map((block) => {
            const changed = block.hasChange;
            const blockChrome =
              variant === "suggested"
                ? "recipient-legal-redline-block border-b border-slate-100 py-3.5 last:border-b-0"
                : [
                    "recipient-legal-redline-block border-b border-slate-100 py-4 last:border-b-0",
                    changed
                      ? "border-l-4 border-l-amber-500 bg-amber-50/60 pl-4 pr-2 sm:pl-5"
                      : "border-l-4 border-l-transparent pl-4 pr-2 sm:pl-5",
                  ].join(" ");
            return (
              <section
                key={block.id}
                data-testid={changed ? "recipient-redline-changed-block" : "recipient-legal-redline-block"}
                data-block-kind={block.kind}
                data-block-id={block.id}
                data-clause-number={block.clauseNumber ?? ""}
                className={blockChrome}
              >
                <div className="space-y-0">
                  <RecipientLegalRedlineBlockSegments segments={block.segments} keyPrefix={block.id} />
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-0">{renderSegmentStream(segments ?? [], "legacy")}</div>
      )}
    </article>
  );
}
