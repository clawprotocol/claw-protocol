import type { ReactNode } from "react";
import type { RedlineSegmentVM } from "./recipientPreviewDiffModel";
import type { LegalRedlineDocumentViewModel, LegalRedlineSegment } from "./legalRedlineBlocks";

type Props = {
  /** @deprecated Prefer {@link document} for block-aware redline. */
  segments?: RedlineSegmentVM[];
  document?: LegalRedlineDocumentViewModel;
  variant?: "page" | "column";
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

function segmentLineClass(type: "same" | "insert" | "delete"): string {
  if (type === "same") {
    return "recipient-legal-redline-same text-[15px] leading-[1.65] text-slate-900";
  }
  if (type === "insert") {
    return [
      "recipient-legal-redline-insert",
      "text-[15px] leading-[1.65]",
      "rounded-sm px-2 py-1",
      "bg-emerald-200 text-emerald-950",
      "shadow-sm ring-1 ring-emerald-700/35",
      "font-medium",
    ].join(" ");
  }
  return [
    "recipient-legal-redline-delete",
    "text-[15px] leading-[1.65]",
    "rounded-sm px-2 py-1",
    "bg-rose-200 text-rose-950",
    "line-through decoration-2 decoration-rose-900/80",
    "shadow-sm ring-1 ring-rose-700/35",
    "font-medium",
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
        <div key={key} className={heading ? "mb-4 mt-5 border-b border-slate-200 pb-3 first:mt-0" : "mb-3 last:mb-0"}>
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

export function RecipientLegalRedlineDocument({ segments, document, variant = "page" }: Props) {
  const shell =
    variant === "page"
      ? "mx-auto w-full max-w-[42rem] rounded-lg border border-slate-300/90 bg-white px-6 py-8 shadow-md sm:px-10 sm:py-10"
      : "mx-auto w-full max-w-none rounded-md border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-5 sm:py-6";

  return (
    <article
      className={`recipient-legal-redline-document ${shell}`}
      data-testid="recipient-legal-redline-document"
    >
      {document ? (
        <div className="space-y-0">
          {document.blocks.map((block) => (
            <section
              key={block.id}
              data-testid="recipient-legal-redline-block"
              data-block-kind={block.kind}
              className="recipient-legal-redline-block mb-8 border-b border-slate-100 pb-8 last:mb-0 last:border-b-0 last:pb-0"
            >
              <div className="space-y-0">{renderSegmentStream(block.segments, block.id)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-0">{renderSegmentStream(segments ?? [], "legacy")}</div>
      )}
    </article>
  );
}
