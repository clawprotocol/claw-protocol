/**
 * Inline starter / free notice for multi-party drafts.
 *
 *   • status="caution"      → 7–12 real parties; gentle review reminder, no block.
 *   • status="requires_pro" → 13+ real parties; explicit LawDog Pro explanation + amber chrome.
 *   • status="normal"       → render nothing.
 *
 * Rendering rules (see Railway QA):
 *   • Always mounts inline (NOT position:fixed) so it survives mobile viewport, keyboard
 *     overlay, and surface hydration without depending on the sticky bottom bar.
 *   • Stable test ids + roles for assistive tech and regression coverage.
 *   • Single canonical source for the public copy — copy literals live in
 *     `starterPartyLimits.ts`, not duplicated in callers.
 */

import {
  STARTER_PARTY_CAUTION_NOTICE,
  STARTER_PARTY_PRO_REQUIRED_NOTICE,
  STARTER_PARTY_PRO_REQUIRED_TITLE,
  type StarterPartyCountStatus,
} from "./starterPartyLimits";

type StarterPartyCountNoticeProps = {
  status: StarterPartyCountStatus;
  /**
   * Optional surface tag — purely informational, threaded into the test id so duplicate
   * mount points (e.g. inline preview + sticky-bar fallback) can be asserted independently.
   */
  surface?: "inline" | "sticky";
  className?: string;
};

export function StarterPartyCountNotice({
  status,
  surface = "inline",
  className,
}: StarterPartyCountNoticeProps): React.ReactElement | null {
  if (status === "normal") return null;

  const surfaceSuffix = surface === "sticky" ? "-sticky" : "";

  if (status === "requires_pro") {
    return (
      <div
        data-testid={`starter-party-count-pro-required${surfaceSuffix}`}
        role="alert"
        aria-live="polite"
        className={
          className ??
          "mb-3 rounded-lg border border-amber-400/55 bg-amber-500/15 px-3 py-3 text-left sm:px-4 sm:py-3.5"
        }
      >
        <p className="text-sm font-semibold leading-snug text-amber-50 sm:text-[0.9375rem]">
          {STARTER_PARTY_PRO_REQUIRED_TITLE}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-amber-100/95 sm:text-[0.9375rem]">
          {STARTER_PARTY_PRO_REQUIRED_NOTICE}
        </p>
      </div>
    );
  }

  // caution (7–12 parties)
  return (
    <div
      data-testid={`starter-party-count-caution${surfaceSuffix}`}
      role="status"
      aria-live="polite"
      className={
        className ??
        "mb-3 rounded-lg border border-slate-500/55 bg-slate-800/60 px-3 py-2.5 text-left sm:px-4"
      }
    >
      <p className="text-sm leading-relaxed text-slate-100 sm:text-[0.9375rem]">
        {STARTER_PARTY_CAUTION_NOTICE}
      </p>
    </div>
  );
}

export default StarterPartyCountNotice;
