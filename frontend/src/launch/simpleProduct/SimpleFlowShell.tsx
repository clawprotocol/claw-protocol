import type { ReactNode } from "react";
import "../launch.css";
import "../../vs01/vs01.css";
import "../../joy/joy.css";
import { JOY_COPY } from "../../joy/clawJoyCopy";
import { useFeatureGate } from "../../config/featureFlags/useFeatureGate";
import { useLaunchNav } from "../LaunchNavContext";
import { useActiveGenesisAffiliateAccess } from "../genesisReferral/genesisAffiliateAccess";
import { LawdogLogoLink } from "../../components/ui/LawdogLogoLink";
import { DisclosureFooter } from "../../compliance/DisclosureFooter";

type Step = 1 | 2 | 3 | 4 | 5;

const DEFAULT_PROGRESS: readonly [string, string, string, string] = [
  JOY_COPY.progressDraft,
  JOY_COPY.progressSend,
  JOY_COPY.progressSeal,
  JOY_COPY.progressProof,
];

export function SimpleFlowShell(props: {
  children: ReactNode;
  /** Optional eyebrow above the page title (e.g. continuity kicker). */
  kicker?: string;
  title: string;
  subtitle?: string;
  /** Optional class on subtitle paragraph (e.g. larger mobile type). */
  subtitleClassName?: string;
  /** Optional class on the main H1 (e.g. checkout conversion typography). */
  titleClassName?: string;
  hideHeader?: boolean;
  /** Optional id on the page H1 for post-checkout scroll/focus restore. */
  titleHeadingId?: string;
  /** Paid Pro review: tighter header stack so the agreement card sits higher. */
  compactReviewHeader?: boolean;
  /** Optional progress: highlights current step only; earlier steps show as completed. */
  step?: Step;
  /** Override nav labels (4- or 5-step flows, e.g. checkout upgrade path). */
  progressLabels?: readonly string[];
  /** Logo destination; anonymous GTM Starter review uses marketing home (`/`), not `/app`. */
  logoHomeHref?: string;
  /** Hide Earn / affiliate workspace nav (anonymous GTM Starter review). */
  hideAffiliateNav?: boolean;
}) {
  const { navigate } = useLaunchNav();
  const affiliateFeatureOn = useFeatureGate("affiliate_opportunity_enabled");
  // Earn nav is Genesis-active only (same product boundary as Affiliate dashboard).
  const { allowed: activeGenesisAffiliate } = useActiveGenesisAffiliateAccess();
  const affiliateNav = affiliateFeatureOn && activeGenesisAffiliate;
  const {
    children,
    kicker,
    title,
    subtitle,
    subtitleClassName,
    titleClassName,
    hideHeader,
    titleHeadingId,
    compactReviewHeader,
    step,
    progressLabels = DEFAULT_PROGRESS,
    logoHomeHref = "/app",
    hideAffiliateNav = false,
  } = props;

  return (
    <div className="vs01-root">
      <div className="vs01-accent-strip" aria-hidden />
      <div className="vs01-shell w-full min-w-0 max-w-full overflow-x-clip">
        <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 py-4" aria-label="Simple flow">
          <div className="flex flex-wrap items-center gap-2">
            <LawdogLogoLink homeHref={logoHomeHref} wordmark surface="dark" />
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact min-h-11"
              onClick={() => navigate("/")}
            >
              Home
            </button>
            {affiliateNav && !hideAffiliateNav ? (
              <button
                type="button"
                className="min-h-11 rounded-md border border-transparent px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:border-slate-800 hover:text-slate-300"
                onClick={() => navigate("/app/genesis-referral")}
              >
                Earn
              </button>
            ) : null}
          </div>
          {step ? (
            <ol
              className="flex list-none flex-wrap items-center gap-x-1 gap-y-1 px-0.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:gap-x-1.5 sm:text-[11px]"
              aria-label="Agreement lifecycle"
            >
              {progressLabels.flatMap((label, i) => {
                const out: ReactNode[] = [];
                if (i > 0) {
                  out.push(
                    <li key={`sep-${i}`} aria-hidden className="px-0.5 text-slate-600">
                      →
                    </li>,
                  );
                }
                const done = i < step - 1;
                const current = i === step - 1;
                out.push(
                  <li
                    key={`step-${i}`}
                    className={
                      done
                        ? "flex items-center gap-1 rounded px-1.5 py-0.5 text-emerald-200/85"
                        : current
                          ? "flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/8 px-1.5 py-0.5 text-emerald-200"
                          : "rounded px-1.5 py-0.5 text-slate-600"
                    }
                  >
                    {done ? (
                      <span className="text-[9px] text-emerald-400/90" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                    <span>{label}</span>
                  </li>,
                );
                return out;
              })}
            </ol>
          ) : null}
        </nav>
        {!hideHeader ? (
        <header
          className={
            compactReviewHeader ? "vs01-header pb-1 pt-2 sm:pb-1 sm:pt-2" : "vs01-header pb-2 pt-4"
          }
        >
          {kicker ? (
            <p className="mb-2 text-center text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-left sm:text-xs md:text-[0.8125rem] lg:tracking-[0.1em] lg:text-slate-400">
              {kicker}
            </p>
          ) : null}
          <h1
            id={titleHeadingId}
            className={`vs01-header-title text-xl sm:text-3xl md:text-[1.875rem] lg:text-[2.25rem] lg:leading-[1.15] ${titleClassName ?? ""}`}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              className={`vs01-header-subtitle text-base leading-relaxed text-slate-300 sm:text-[0.9375rem] sm:leading-[1.55] sm:text-slate-300 md:text-[1rem] lg:text-[1.125rem] lg:leading-[1.55] lg:text-slate-300/95 ${
                compactReviewHeader
                  ? "mt-2 sm:mt-1.5"
                  : "mt-3 sm:mt-2"
              } ${subtitleClassName ?? ""}`}
            >
              {subtitle}
            </p>
          ) : null}
        </header>
        ) : null}
        <main className="vs01-main vs01-main--lawdog-funnel min-w-0 max-w-full pb-8">{children}</main>
        <footer className="vs01-footer">
          <DisclosureFooter slim dense className="border-0 pt-0" />
        </footer>
      </div>
    </div>
  );
}
