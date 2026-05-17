import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AgreementLifecycle } from "../agreement/agreementLifecycle";

/** Funnel sections shown on screen (order: Active → In progress → Completed → Archive). */
export type DocListFunnelSection = "active" | "in_progress" | "completed" | "archive";

export const DOC_LIST_SECTION_ORDER: DocListFunnelSection[] = [
  "active",
  "in_progress",
  "completed",
  "archive",
];

export const DOC_LIST_SECTION_TITLE: Record<DocListFunnelSection, string> = {
  active: "Active",
  in_progress: "In progress",
  completed: "Completed",
  archive: "Archive",
};

export type DocListRowStatus = AgreementLifecycle;

export function docListAgreementSection(lc: AgreementLifecycle): DocListFunnelSection {
  switch (lc) {
    case "draft":
      return "active";
    case "in_review":
    case "pending_signature":
      return "in_progress";
    case "completed":
      return "completed";
    case "archived":
      return "archive";
    default:
      return "active";
  }
}

export const DOC_LIST_STATUS_LABEL: Record<DocListRowStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  pending_signature: "Pending signature",
  completed: "Completed",
  archived: "Archived",
};

export const DOC_LIST_EMPTY: Record<DocListFunnelSection, string> = {
  active: "No active agreements. Start a new one.",
  in_progress: "No agreements in progress.",
  completed: "No completed agreements yet.",
  archive: "No archived agreements.",
};

export const DOC_LIST_EMPTY_ESIGN: Record<DocListFunnelSection, string> = {
  active: "No active documents. Upload a file to start.",
  in_progress: "No documents in progress.",
  completed: "No completed documents yet.",
  archive: "No archived documents.",
};

/** Relative “Updated …” for scan-friendly rows. */
export function formatRelativeUpdated(iso: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString();
}

export function formatRelativeFromMs(ms: number): string {
  return formatRelativeUpdated(new Date(ms).toISOString());
}

function statusBadgeClass(status: DocListRowStatus): string {
  const base =
    "inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] leading-tight";
  switch (status) {
    case "draft":
      return `${base} border-slate-600/80 bg-slate-900/60 text-slate-400`;
    case "in_review":
      return `${base} border-blue-700/50 bg-blue-950/40 text-blue-200/90`;
    case "pending_signature":
      return `${base} border-amber-700/55 bg-amber-950/35 text-amber-200/90`;
    case "completed":
      return `${base} border-emerald-800/55 bg-emerald-950/35 text-emerald-200/90`;
    case "archived":
    default:
      return `${base} border-slate-700/60 bg-slate-950/50 text-slate-500`;
  }
}

export type DocumentOverflowItem = {
  id: string;
  label: string;
  onSelect: () => void | Promise<void>;
};

export type DocumentListRowProps = {
  title: string;
  subline: string;
  status: DocListRowStatus;
  primaryCta: string;
  onPrimaryClick: () => void;
  overflowItems?: DocumentOverflowItem[];
  /** Folder display name, or null when unfiled (shows “Unfiled” when showUnfiledLabel). */
  folderLabel?: string | null;
  /** Up to three shown inline; rest as +N. */
  tags?: string[];
};

export function DocumentListRow(props: DocumentListRowProps) {
  const {
    title,
    subline,
    status,
    primaryCta,
    onPrimaryClick,
    overflowItems = [],
    folderLabel,
    tags = [],
  } = props;
  const tagShow = tags.filter(Boolean).slice(0, 3);
  const tagMore = Math.max(0, tags.filter(Boolean).length - tagShow.length);
  return (
    <div className="flex w-full min-w-0 max-w-full flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-700/80 bg-slate-950/40 px-4 py-3.5 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-100">{title}</div>
        <div className="mt-0.5 text-xs leading-snug text-slate-400">{subline}</div>
        {folderLabel !== undefined ? (
          <div className="mt-1 text-xs text-slate-400">
            {folderLabel ? (
              <span className="text-slate-300">{folderLabel}</span>
            ) : (
              <span className="italic text-slate-500">Unfiled</span>
            )}
          </div>
        ) : null}
        {tagShow.length > 0 || tagMore > 0 ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {tagShow.map((t) => (
              <span
                key={t}
                className="inline-flex max-w-[8rem] truncate rounded-full border border-slate-700/70 bg-slate-900/55 px-2 py-0.5 text-[11px] font-medium text-slate-300"
              >
                {t}
              </span>
            ))}
            {tagMore > 0 ? (
              <span className="text-xs text-slate-500">+{tagMore}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
        <span className={statusBadgeClass(status)}>{DOC_LIST_STATUS_LABEL[status]}</span>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-4 py-2.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-950/50"
          onClick={onPrimaryClick}
        >
          {primaryCta}
        </button>
        <DocumentOverflowMenu items={overflowItems} />
      </div>
    </div>
  );
}

function DocumentOverflowMenu({ items }: { items: DocumentOverflowItem[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-600/80 text-sm text-slate-300 hover:bg-slate-800/80 hover:text-slate-100"
        aria-label="More actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        ···
      </button>
      {open ? (
        <ul
          className="absolute right-0 top-full z-30 mt-1 min-w-[9.5rem] rounded-md border border-slate-700 bg-slate-900 py-1 shadow-lg"
          role="menu"
        >
          {items.map((it) => (
            <li key={it.id} role="none">
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  void Promise.resolve(it.onSelect()).finally(() => setOpen(false));
                }}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function DocumentListSectionGroup(props: {
  headingId: string;
  title: string;
  titleSuffix?: string;
  children: ReactNode;
  /** Extra section wrapper classes (e.g. spacing overrides). */
  sectionClassName?: string;
  /** Override default funnel heading styles. */
  headingClassName?: string;
}) {
  const { headingId, title, titleSuffix, children, sectionClassName, headingClassName } = props;
  const h3Class =
    headingClassName ?? "m-0 text-xs font-bold uppercase tracking-[0.12em] text-slate-500";
  const sectionLayout = sectionClassName ?? "mt-6 first:mt-0";
  return (
    <section className={sectionLayout} aria-labelledby={headingId}>
      <div className="mb-2">
        <h3 className={h3Class} id={headingId}>
          {title}
          {titleSuffix ? <span className="ml-1 font-mono font-normal text-slate-600">{titleSuffix}</span> : null}
        </h3>
      </div>
      <div className="mb-3 h-px w-full bg-slate-800/90" aria-hidden />
      <div>{children}</div>
    </section>
  );
}

export function CollapsibleDocumentSection(props: {
  title: string;
  count: number;
  defaultCollapsed?: boolean;
  children: ReactNode;
  sectionClassName?: string;
  headingClassName?: string;
}) {
  const { title, count, defaultCollapsed = true, children, sectionClassName, headingClassName } = props;
  const [open, setOpen] = useState(!defaultCollapsed);
  const suffix = ` (${count})`;
  const headingCls =
    headingClassName ?? "text-xs font-bold uppercase tracking-[0.12em] text-slate-500";
  const sectionLayout =
    sectionClassName ?? "mt-6 border-t border-slate-800/90 pt-5 first:mt-0 first:border-t-0 first:pt-0";
  return (
    <section className={sectionLayout}>
      <button
        type="button"
        className="mb-2 flex min-h-11 w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={headingCls}>
          {title}
          <span className="ml-1 font-mono font-normal normal-case text-slate-600">{suffix}</span>
        </span>
        <span className="text-slate-600" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      <div className="mb-3 h-px w-full bg-slate-800/90" aria-hidden />
      {open ? <div>{children}</div> : null}
    </section>
  );
}

export function DocumentListEmpty(props: { message: string; className?: string }) {
  const cls = props.className ?? "m-0 py-2 text-xs text-slate-500";
  return <p className={cls}>{props.message}</p>;
}

/** Map VS01 repository document status to shared badge row status. */
export function esignDocRowStatus(docStatus: string): DocListRowStatus {
  if (docStatus === "Draft") return "draft";
  if (docStatus === "Sent" || docStatus === "Viewed") return "pending_signature";
  if (docStatus === "Signed" || docStatus === "Completed") return "completed";
  return "draft";
}

export function docListPrimaryCtaForRowStatus(status: DocListRowStatus): string {
  switch (status) {
    case "draft":
      return "Resume";
    case "in_review":
      return "Review";
    case "pending_signature":
      return "Track signing";
    case "completed":
      return "Open";
    case "archived":
      return "View";
    default:
      return "View";
  }
}

/** Wrapper spacing for stacked sections (agreements landing + VS01). */
export function DocumentListStacks(props: { children: ReactNode }) {
  return <div className="doc-list-stacks space-y-0">{props.children}</div>;
}

export function DocumentListUnstyledUl(props: { children: ReactNode }) {
  return <ul className="m-0 flex list-none flex-col gap-2 p-0">{props.children}</ul>;
}
