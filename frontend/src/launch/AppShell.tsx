import type { ReactNode } from "react";
import "../vs01/vs01.css";
import "./launch.css";
import { useFeatureGate } from "../config/featureFlags/useFeatureGate";
import { usePowerGatedNavigation } from "../monetization/usePowerGatedNavigation";
import { useLaunchNav } from "./LaunchNavContext";
import { useAccess } from "../access/AccessContext";
import { DisclosureFooter } from "../compliance/DisclosureFooter";
import { JoySocialFooter } from "../joy/JoySocialFooter";
import { LawdogLogoLink } from "../components/ui/LawdogLogoLink";
import "../joy/joy.css";

export function AppShell(props: {
  children: ReactNode;
  title: string;
  /** Main intro line; may include a short second line for workspace guidance. */
  subtitle?: ReactNode;
}) {
  const { navigate } = useLaunchNav();
  const { navigateToReuse, navigateToWorkProduct } = usePowerGatedNavigation();
  const access = useAccess();
  const affiliateNav = useFeatureGate("affiliate_opportunity_enabled");
  const { children, title, subtitle } = props;
  const showLegacyQuickPath = access.tier === "free";

  return (
    <div className="vs01-root">
      <div className="vs01-accent-strip" aria-hidden />
      <div className="vs01-shell">
        <nav
          className="claw-app-nav flex flex-col gap-3 border-b border-slate-800/80 pb-4 sm:flex-row sm:items-center sm:justify-between"
          aria-label="App"
        >
          <div className="flex items-center gap-3">
            <LawdogLogoLink homeHref="/app" wordmark surface="dark" />
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact"
              onClick={() => navigate("/")}
            >
              Home
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact"
              onClick={() => navigate("/app")}
            >
              Home
            </button>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact"
              onClick={() => navigate("/app/create")}
            >
              Create
            </button>
            {showLegacyQuickPath ? (
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                onClick={() => navigate("/app/quick")}
              >
                Quick send
              </button>
            ) : null}
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact"
              title="Find and reuse your agreements"
              onClick={() => navigateToReuse("app_shell_nav", "/app/agreement-memory")}
            >
              Reuse
            </button>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact"
              title="Briefs, memos, white papers from your LawDog materials — assistive drafts, not proofs"
              onClick={() => navigateToWorkProduct("app_shell_nav")}
            >
              Work product
            </button>
            {showLegacyQuickPath ? (
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                onClick={() => navigate("/app/quick")}
              >
                Quick
              </button>
            ) : null}
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact"
              title="Compare plans, subscription status, and payment"
              onClick={() => navigate("/app/billing")}
            >
              Billing
            </button>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact"
              title="Webhooks and API integration settings"
              onClick={() => navigate("/app/integrations")}
            >
              Integrations
            </button>
            {affiliateNav ? (
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary vs01-btn--compact opacity-80"
                onClick={() => navigate("/app/opportunity")}
              >
                Earn
              </button>
            ) : null}
          </div>
        </nav>

        <header className="vs01-header">
          <div className="vs01-header-panel">
            <h1 className="vs01-header-title">{title}</h1>
            {subtitle ? <div className="vs01-header-subtitle">{subtitle}</div> : null}
          </div>
        </header>

        <main className="vs01-main vs01-main--lawdog-funnel">{children}</main>

        <footer className="vs01-footer !mt-8 !border-t !border-slate-900/40 !pt-3">
          <JoySocialFooter className="mb-3 px-2 text-[10px] font-normal normal-case leading-snug tracking-normal text-slate-500 opacity-90" />
          <DisclosureFooter dense className="!border-t-0 !pt-2 text-xs text-slate-500" />
        </footer>
      </div>
    </div>
  );
}
