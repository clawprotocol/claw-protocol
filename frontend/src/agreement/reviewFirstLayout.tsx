import type { ReactNode } from "react";

const reviewButtonBase =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

export function reviewActionButtonClass(variant: "primary" | "secondary" | "ghost" = "secondary"): string {
  if (variant === "primary") return `vs01-btn--primary ${reviewButtonBase} bg-slate-950 text-white hover:bg-slate-800`;
  if (variant === "ghost") return `${reviewButtonBase} border border-transparent text-slate-600 hover:bg-slate-100`;
  return `${reviewButtonBase} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
}

export function ReviewShell(props: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`mx-auto w-full max-w-3xl space-y-4 rounded-[1.75rem] border border-slate-200 bg-slate-50/95 p-4 text-slate-950 shadow-sm sm:p-6 ${
        props.className ?? ""
      }`}
      data-testid="review-first-standard-shell"
    >
      {props.children}
    </div>
  );
}

export function ReviewHeader(props: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  reassurance?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {props.eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{props.eyebrow}</p>
          ) : null}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{props.title}</h1>
          {props.description ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{props.description}</p> : null}
          {props.reassurance ? (
            <p className="mt-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              {props.reassurance}
            </p>
          ) : null}
        </div>
        {props.action ? <div className="shrink-0">{props.action}</div> : null}
      </div>
    </header>
  );
}

export function ReviewMetaGrid(props: {
  items: Array<{ label: ReactNode; value: ReactNode }>;
  className?: string;
  testId?: string;
  /** Dark VS01 recipient shell — high-contrast labels/values without touching owner Pro document paper. */
  tone?: "default" | "recipientDark";
}) {
  const labelClass =
    props.tone === "recipientDark"
      ? "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400"
      : "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500";
  const valueClass =
    props.tone === "recipientDark"
      ? "mt-1 text-sm font-medium text-slate-100"
      : "mt-1 text-sm font-medium text-slate-900";
  return (
    <dl
      className={`grid gap-3 px-1 py-1 text-left sm:grid-cols-3 ${props.className ?? ""}`}
      data-testid={props.testId}
      data-review-meta-tone={props.tone ?? "default"}
    >
      {props.items.map((item, idx) => (
        <div key={idx} className="min-w-0">
          <dt className={labelClass}>{item.label}</dt>
          <dd className={valueClass}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReviewActions(props: {
  children: ReactNode;
  note?: ReactNode;
  className?: string;
  testId?: string;
  ariaLabel?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${props.className ?? ""}`}
      data-testid={props.testId ?? "review-first-standard-actions"}
      aria-label={props.ariaLabel}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{props.children}</div>
      {props.note ? <p className="mt-3 text-xs leading-relaxed text-slate-500">{props.note}</p> : null}
    </section>
  );
}

export function ReviewDocumentFrame(props: {
  children: ReactNode;
  title?: ReactNode;
  className?: string;
  testId?: string;
  ariaLabel?: string;
}) {
  return (
    <section
      className={`rounded-[1.35rem] border border-slate-200 bg-white text-slate-950 shadow-sm ${props.className ?? ""}`}
      data-testid={props.testId ?? "review-first-standard-document"}
      aria-label={props.ariaLabel}
    >
      <div className="p-5 sm:p-7">
        {props.title ? (
          <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{props.title}</div>
        ) : null}
        {props.children}
      </div>
    </section>
  );
}

export function ReviewNotice(props: {
  children: ReactNode;
  tone?: "neutral" | "warning" | "success";
  blocking?: boolean;
  testId?: string;
}) {
  const tone = props.tone ?? "neutral";
  const classes =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-slate-200 bg-white text-slate-700";
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-sm ${classes}`}
      role={props.blocking ? "alert" : "status"}
      data-testid={props.testId}
    >
      {props.children}
    </div>
  );
}

export function ReviewFuturePanel(props: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm ${props.className ?? ""}`}
      data-testid={props.testId}
    >
      {props.children}
    </section>
  );
}
