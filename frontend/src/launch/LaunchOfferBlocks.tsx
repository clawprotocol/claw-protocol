import {
  LAWDOG_VALUE_BULLETS,
  PRICING_FIRST_WORKFLOW_GUARANTEE_BODY,
  PRICING_FIRST_WORKFLOW_GUARANTEE_FOOTNOTE,
  PRICING_FIRST_WORKFLOW_GUARANTEE_TITLE,
} from "./pricingContent";

export function LawdogValueBulletsList(props: {
  variant: "light" | "dark";
  className?: string;
  /** Extra classes on each `<li>` */
  itemClassName?: string;
}) {
  const { variant, className, itemClassName = "" } = props;
  const dot =
    variant === "dark" ? "shrink-0 text-emerald-400/90" : "shrink-0 text-emerald-600";
  const text =
    variant === "dark"
      ? "text-sm leading-snug text-slate-300"
      : "text-[1.05rem] leading-relaxed text-slate-700";
  return (
    <ul className={className} aria-label="What CLAW helps you do">
      {LAWDOG_VALUE_BULLETS.map((b) => (
        <li key={b} className={`flex gap-2.5 ${text} ${itemClassName}`}>
          <span className={dot} aria-hidden>
            ✓
          </span>
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

export function PricingGuaranteePanel(props: { variant: "light" | "dark"; className?: string }) {
  const { variant, className = "" } = props;
  const box =
    variant === "dark"
      ? "rounded-xl border border-emerald-800/45 bg-emerald-950/20 px-5 py-5 sm:px-6"
      : "rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-5 py-5 shadow-sm sm:px-6";
  const title =
    variant === "dark" ? "text-lg font-semibold text-emerald-100" : "text-xl font-semibold text-emerald-950";
  const body =
    variant === "dark"
      ? "mt-2 text-sm leading-relaxed text-slate-300"
      : "mt-2 text-base leading-relaxed text-slate-800";
  const foot =
    variant === "dark"
      ? "mt-3 text-xs leading-relaxed text-slate-500"
      : "mt-3 text-[0.8125rem] leading-relaxed text-slate-600";
  return (
    <section className={`${box} ${className}`} aria-labelledby="lawdog-first-workflow-guarantee-heading">
      <h2 id="lawdog-first-workflow-guarantee-heading" className={title}>
        {PRICING_FIRST_WORKFLOW_GUARANTEE_TITLE}
      </h2>
      <p className={body}>{PRICING_FIRST_WORKFLOW_GUARANTEE_BODY}</p>
      <p className={foot}>{PRICING_FIRST_WORKFLOW_GUARANTEE_FOOTNOTE}</p>
    </section>
  );
}
