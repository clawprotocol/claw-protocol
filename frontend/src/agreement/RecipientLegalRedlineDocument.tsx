import type { ReactNode } from "react";
import type { RedlineSegmentVM } from "./recipientPreviewDiffModel";
import type { LegalRedlineDocumentViewModel, LegalRedlineSegment } from "./legalRedlineBlocks";

type Props = {
  /** @deprecated Prefer {@link document} for block-aware redline. */
  segments?: RedlineSegmentVM[];
  document?: LegalRedlineDocumentViewModel;
  /** `suggested` — recipient single-surface review: contract typography, inline track marks only (no heavy block chrome). */
  variant?: "page" | "column" | "suggested";
  /** When true, split narrow payment inserts into scroll targets (`data-recipient-redline-anchor`). */
  recipientNarrowIntentAnchors?: boolean;
  /** Brief highlight ring for the anchor matching an intent-status click. */
  highlightedRecipientAnchor?: string | null;
};

type AnySeg = LegalRedlineSegment | RedlineSegmentVM;

const PAUSE_REMEDY_ANCHOR_RE =
  /If payment is more than\s+[\w-]+\s+\(\d+\)\s+days late,\s+Developer may pause work until all overdue undisputed amounts are paid\./i;

type RecipientAnchor = "payment_timing" | "pause_suspend_work";

function splitTimingInsertChunk(s: string): { text: string; anchor?: RecipientAnchor }[] {
  const m = s.match(/\b(net\s*\d+\.?)/i);
  if (!m || m.index == null) return s ? [{ text: s }] : [];
  const i = m.index;
  const out: { text: string; anchor?: RecipientAnchor }[] = [];
  if (i > 0) out.push({ text: s.slice(0, i) });
  out.push({ text: m[1]!, anchor: "payment_timing" });
  if (i + m[1]!.length < s.length) out.push({ text: s.slice(i + m[1]!.length) });
  return out;
}

function splitInsertForRecipientAnchors(full: string): { text: string; anchor?: RecipientAnchor }[] {
  const rest = String(full ?? "");
  const pm = PAUSE_REMEDY_ANCHOR_RE.exec(rest);
  if (pm?.index != null && pm[0]) {
    const i = pm.index;
    const out: { text: string; anchor?: RecipientAnchor }[] = [];
    if (i > 0) out.push(...splitTimingInsertChunk(rest.slice(0, i)));
    out.push({ text: pm[0], anchor: "pause_suspend_work" });
    const after = rest.slice(i + pm[0].length);
    if (after) out.push(...splitTimingInsertChunk(after));
    return out.length ? out : [{ text: rest }];
  }
  return splitTimingInsertChunk(rest);
}

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

function renderAnchoredInsertLine(
  line: string,
  keyBase: string,
  highlightedRecipientAnchor: string | null | undefined,
): ReactNode {
  const pieces = splitInsertForRecipientAnchors(line);
  if (pieces.length === 0) {
    return (
      <span key={keyBase} data-redline="insert" className={`block ${segmentLineClass("insert")}`}>
        {line.length > 0 ? line : "\u00a0"}
      </span>
    );
  }
  if (pieces.length <= 1 && !pieces[0]?.anchor) {
    return (
      <span
        key={keyBase}
        data-redline="insert"
        className={`block ${segmentLineClass("insert")}`}
      >
        {line.length > 0 ? line : "\u00a0"}
      </span>
    );
  }
  return (
    <span key={keyBase} className={`block ${segmentLineClass("insert")}`} data-redline="insert">
      {pieces.map((p, pi) => {
        const hl =
          p.anchor && highlightedRecipientAnchor && p.anchor === highlightedRecipientAnchor
            ? " ring-2 ring-amber-400 ring-offset-1 ring-offset-white transition-shadow duration-300"
            : "";
        return (
          <span
            key={`${keyBase}_p${pi}`}
            className={hl.trim() || undefined}
            data-recipient-redline-anchor={p.anchor}
          >
            {p.text}
          </span>
        );
      })}
    </span>
  );
}

function renderSegmentStream(
  segments: AnySeg[],
  keyPrefix: string,
  opts?: {
    recipientNarrowIntentAnchors?: boolean;
    highlightedRecipientAnchor?: string | null;
  },
): ReactNode[] {
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
            if (seg.type === "insert" && opts?.recipientNarrowIntentAnchors) {
              return renderAnchoredInsertLine(line, `${key}_l${li}`, opts.highlightedRecipientAnchor);
            }
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
  recipientNarrowIntentAnchors,
  highlightedRecipientAnchor,
}: {
  segments: LegalRedlineSegment[];
  keyPrefix: string;
  recipientNarrowIntentAnchors?: boolean;
  highlightedRecipientAnchor?: string | null;
}): ReactNode {
  return (
    <div className="space-y-0">
      {renderSegmentStream(segments, keyPrefix, {
        recipientNarrowIntentAnchors,
        highlightedRecipientAnchor,
      })}
    </div>
  );
}

export function RecipientLegalRedlineDocument({
  segments,
  document,
  variant = "page",
  recipientNarrowIntentAnchors,
  highlightedRecipientAnchor,
}: Props) {
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
                  <RecipientLegalRedlineBlockSegments
                    segments={block.segments}
                    keyPrefix={block.id}
                    recipientNarrowIntentAnchors={recipientNarrowIntentAnchors}
                    highlightedRecipientAnchor={highlightedRecipientAnchor}
                  />
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-0">
          {renderSegmentStream(segments ?? [], "legacy", {
            recipientNarrowIntentAnchors,
            highlightedRecipientAnchor,
          })}
        </div>
      )}
    </article>
  );
}
