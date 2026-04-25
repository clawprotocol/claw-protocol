import { LAWDOG_EMBLEM_SRC } from "../../design/tokens";

export type LawdogBrandSize = "xs" | "sm" | "md";
export type LawdogBrandSurface = "light" | "dark";
export type LawdogBrandVariant = "emblem" | "wordmark";

const PX: Record<LawdogBrandSize, number> = {
  xs: 16,
  sm: 22,
  md: 28,
};

function emblemFilterClass(surface: LawdogBrandSurface): string {
  return surface === "dark" ? "brightness-0 invert" : "";
}

type LawdogBrandProps = {
  variant: LawdogBrandVariant;
  size: LawdogBrandSize;
  surface: LawdogBrandSurface;
  className?: string;
};

/**
 * LawDog emblem (PNG) with optional wordmark — light-touch, fixed pixel sizes for crisp nav.
 */
export function LawdogBrand({ variant, size, surface, className = "" }: LawdogBrandProps) {
  const px = PX[size];
  const img = (
    <img
      src={LAWDOG_EMBLEM_SRC}
      alt=""
      aria-hidden
      width={px}
      height={px}
      className={`object-contain ${emblemFilterClass(surface)}`.trim()}
      decoding="async"
    />
  );

  if (variant === "emblem") {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center ${className}`.trim()} aria-hidden>
        {img}
      </span>
    );
  }

  const textTone = surface === "dark" ? "text-slate-100" : "text-slate-900";
  return (
    <span className={`inline-flex items-center gap-2.5 shrink-0 ${className}`.trim()}>
      {img}
      <span className={`font-semibold tracking-tight ${textTone} text-sm sm:text-base`}>LawDog</span>
    </span>
  );
}
