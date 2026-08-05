import { LawdogEmblem } from "./LawdogEmblem";

export type LawdogBrandSize = "xs" | "sm" | "md";
export type LawdogBrandSurface = "light" | "dark";
export type LawdogBrandVariant = "emblem" | "wordmark";

const PX: Record<LawdogBrandSize, number> = {
  xs: 16,
  sm: 22,
  md: 28,
};

type LawdogBrandProps = {
  variant: LawdogBrandVariant;
  size: LawdogBrandSize;
  surface: LawdogBrandSurface;
  className?: string;
};

/**
 * LawDog emblem (vector) with optional wordmark — currentColor for crisp light/dark chrome.
 */
export function LawdogBrand({ variant, size, surface, className = "" }: LawdogBrandProps) {
  const px = PX[size];
  const tone = surface === "dark" ? "text-slate-100" : "text-slate-900";
  const emblem = <LawdogEmblem size={px} />;

  if (variant === "emblem") {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center ${tone} ${className}`.trim()} aria-hidden>
        {emblem}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 shrink-0 ${tone} ${className}`.trim()}>
      {emblem}
      <span className="font-semibold tracking-tight text-sm sm:text-base">LawDog</span>
    </span>
  );
}
