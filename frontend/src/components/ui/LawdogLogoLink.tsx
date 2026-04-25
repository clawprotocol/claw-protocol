import { LawdogBrand, type LawdogBrandSurface } from "./LawdogBrand";
import { useLaunchNav } from "../../launch/LaunchNavContext";

type Props = {
  /** Dashboard vs marketing home */
  homeHref?: string;
  className?: string;
  /** Show “LawDog” next to the emblem (app chrome). */
  wordmark?: boolean;
  /** Marketing = light background; app shells = dark. */
  surface?: LawdogBrandSurface;
};

/**
 * Clickable LawDog identity — compact emblem, optional wordmark. Navigates without full reload.
 */
export function LawdogLogoLink({ homeHref = "/", wordmark = false, surface = "dark", className = "" }: Props) {
  const { navigate } = useLaunchNav();
  return (
    <button
      type="button"
      onClick={() => navigate(homeHref)}
      className={`inline-flex shrink-0 items-center justify-center rounded-md border border-transparent px-0.5 py-0.5 text-left opacity-95 transition hover:border-slate-700/80 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500/50 ${className}`.trim()}
      aria-label="LawDog home"
    >
      <LawdogBrand variant={wordmark ? "wordmark" : "emblem"} size={wordmark ? "md" : "sm"} surface={surface} />
    </button>
  );
}
