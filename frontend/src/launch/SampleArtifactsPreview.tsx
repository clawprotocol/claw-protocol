import type { ReactElement, ReactNode } from "react";
import { SAMPLE_ARTIFACTS_DISCLAIMER_COMPACT, SAMPLE_ARTIFACTS_DISCLAIMER_FULL } from "./pricingContent";

/**
 * Static sample-artifact previews — product-shaped examples, clearly labeled.
 * No testimonials; no legal-outcome or enforceability claims.
 */

type Variant = "marketing" | "app";
type Density = "default" | "compact";

function cardShell(variant: Variant, inner: ReactNode): ReactElement {
  const m = variant === "marketing";
  return (
    <div
      className={`rounded-lg border px-3 py-3 text-left ${
        m ? "border-slate-200/90 bg-white/95 shadow-sm" : "border-slate-700/80 bg-slate-900/50"
      }`}
    >
      {inner}
    </div>
  );
}

export function SampleArtifactsPreview(props: {
  variant?: Variant;
  density?: Density;
  /** Homepage: modestly larger type on lg+ without changing copy or layout structure. */
  comfortableMarketing?: boolean;
}) {
  const variant = props.variant ?? "marketing";
  const density = props.density ?? "default";
  const comfortable = Boolean(props.comfortableMarketing) && variant === "marketing" && density === "default";
  const m = variant === "marketing";

  if (density === "compact") {
    return (
      <div
        className="mt-4 rounded-lg border border-slate-700/85 bg-slate-900/50 px-3 py-2.5 text-left"
        role="region"
        aria-label="Example product outputs"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">See what you&apos;ll get</p>
        <ul className="mt-2 list-none space-y-1.5 text-[10px] leading-snug text-slate-400">
          <li>
            <span className="font-medium text-slate-500">Structured agreement — </span>
            Parties · term · scope · obligations · governing law (example layout).
          </li>
          <li>
            <span className="font-medium text-slate-500">Proof record — </span>
            Digest · recorded time · event sequence (example fields).
          </li>
          <li>
            <span className="font-medium text-slate-500">Send/sign flow — </span>
            Review → send → sign → keep proof.
          </li>
        </ul>
        <p className="mt-2 border-t border-slate-800/80 pt-2 text-[9px] leading-relaxed text-slate-600">
          {SAMPLE_ARTIFACTS_DISCLAIMER_COMPACT}
        </p>
      </div>
    );
  }

  const titleCls = m
    ? comfortable
      ? "text-sm font-semibold tracking-tight text-slate-900 lg:text-[0.9375rem]"
      : "text-sm font-semibold tracking-tight text-slate-900"
    : "text-sm font-semibold text-slate-100";
  const labelCls = m
    ? comfortable
      ? "mt-1 text-[11px] font-medium text-slate-500 lg:text-[13px]"
      : "mt-1 text-[11px] font-medium text-slate-500"
    : "mt-1 text-[11px] font-medium text-slate-400";
  const bodyCls = m
    ? comfortable
      ? "mt-2 font-mono text-[11px] leading-relaxed text-slate-700 lg:text-[13px]"
      : "mt-2 font-mono text-[11px] leading-relaxed text-slate-700"
    : "mt-2 font-mono text-[11px] leading-relaxed text-slate-400";
  const outerCls = m
    ? comfortable
      ? "rounded-xl border border-slate-200/90 bg-slate-50/95 p-4 sm:p-5 lg:p-6"
      : "rounded-xl border border-slate-200/90 bg-slate-50/95 p-4 sm:p-5"
    : "rounded-xl border border-slate-700/80 bg-slate-950/40 p-4 sm:p-5";

  return (
    <div className={outerCls} role="region" aria-label="Example product outputs">
      <h3
        className={
          m
            ? comfortable
              ? "text-base font-semibold tracking-tight text-slate-900 lg:text-lg"
              : "text-base font-semibold tracking-tight text-slate-900"
            : "text-base font-semibold text-slate-100"
        }
      >
        See what you&apos;ll get
      </h3>
      <p
        className={`mt-1 leading-relaxed ${m ? (comfortable ? "text-xs text-slate-600 lg:text-sm" : "text-xs text-slate-600") : "text-xs text-slate-500"}`}
      >
        {SAMPLE_ARTIFACTS_DISCLAIMER_FULL}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {cardShell(
          variant,
          <>
            <p className={titleCls}>Structured agreement preview</p>
            <p className={labelCls}>Parties · term · scope · obligations · governing law</p>
            <pre className={`${bodyCls} whitespace-pre-wrap`}>
              {`Sample outline (labels only)
Parties: Acme LLC · Beta Co.
Term: 12 mo · Law: CA (example)
Scope: confidential materials
Obligations: return / destroy on end`}
            </pre>
          </>,
        )}
        {cardShell(
          variant,
          <>
            <p className={titleCls}>Proof record example</p>
            <p className={labelCls}>Digest · recorded time · event sequence</p>
            <pre className={`${bodyCls} whitespace-pre-wrap`}>
              {`Digest: a9f3…c821 (example)
Recorded: 2026-04-01 14:22 UTC
Events: draft → sent →
opened → signed`}
            </pre>
          </>,
        )}
        {cardShell(
          variant,
          <>
            <p className={titleCls}>Send/sign flow example</p>
            <p className={labelCls}>Review → send → sign → keep proof</p>
            <pre className={`${bodyCls} whitespace-pre-wrap`}>
              {`1. Review draft in app
2. Send signing links
3. Collect signatures
4. Proof stays in workspace`}
            </pre>
          </>,
        )}
      </div>
    </div>
  );
}
