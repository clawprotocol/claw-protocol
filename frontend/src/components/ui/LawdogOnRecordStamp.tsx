import { LawdogBrand } from "./LawdogBrand";

type Props = {
  className?: string;
  /** Dark: VS01 / slate panels. Light: marketing-style light cards. */
  surface?: "dark" | "light";
};

/**
 * Compact “record exists in LawDog” seal — proof / completion only (not drafting).
 */
export function LawdogOnRecordStamp({ className = "", surface = "dark" }: Props) {
  const shell =
    surface === "dark"
      ? "border-emerald-800/45 bg-emerald-950/35 text-emerald-100/95"
      : "border-slate-200 bg-white/90 text-slate-700 shadow-sm";
  const label = surface === "dark" ? "text-emerald-100/90" : "text-slate-600";
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 ${shell} ${className}`.trim()}
      role="status"
      aria-label="LawDog on record"
    >
      <LawdogBrand variant="emblem" size="xs" surface={surface} />
      <span className={`whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.11em] ${label}`}>
        LawDog · on record
      </span>
    </span>
  );
}
