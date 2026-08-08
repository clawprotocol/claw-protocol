import type { ReactNode } from "react";
import { useState } from "react";
import "../vs01/vs01.css";
import "./launch.css";
import { useFeatureGate } from "../config/featureFlags/useFeatureGate";
import { useLaunchNav } from "./LaunchNavContext";
import { useAccess } from "../access/AccessContext";
import { DisclosureFooter } from "../compliance/DisclosureFooter";
import { JoySocialFooter } from "../joy/JoySocialFooter";
import { LawdogBuildIdentityMark } from "./LawdogBuildIdentityMark";
import { LawdogLogoLink } from "../components/ui/LawdogLogoLink";
import { LawdogBrand } from "../components/ui/LawdogBrand";
import { useActiveGenesisAffiliateAccess } from "./genesisReferral/genesisAffiliateAccess";
import { useOperatorConsoleCapability } from "./useOperatorConsoleCapability";
import { initializeNewAgreementSession } from "./newAgreementSessionReset";
import "../joy/joy.css";

export type AppShellNavMode = "default" | "esign_bridge_focused" | "minimal" | "public_completed";

type OverflowNavItem = {
  label: string;
  path: string;
  title?: string;
};

export function AppShell(props: {
  children: ReactNode;
  title: string;
  /** Main intro line; may include a short second line for workspace guidance. */
  subtitle?: ReactNode;
  /** Paid Pro agreement → VS01 bridge: fewer distractions, no duplicate Home. */
  navMode?: AppShellNavMode;
  /** Slim footer: shorter legal strip on mobile-first app surfaces (e.g. partner / pre-payment). */
  compactFooter?: boolean;
}) {
  const { navigate } = useLaunchNav();
  const access = useAccess();
  const affiliateFeatureOn = useFeatureGate("affiliate_opportunity_enabled");
  const { allowed: activeGenesisAffiliate } = useActiveGenesisAffiliateAccess();
  const showAffiliateNav = affiliateFeatureOn && activeGenesisAffiliate;
  const { ready: operatorCapabilityReady, capability: operatorCapability } =
    useOperatorConsoleCapability();
  const showAdminConsoleNav =
    operatorCapabilityReady && operatorCapability.authorized;
  const { children, title, subtitle, navMode = "default", compactFooter = false } = props;
  const showLegacyQuickPath = access.tier === "free";
  const esignBridgeNav = navMode === "esign_bridge_focused";
  const minimalNav = navMode === "minimal";
  const publicCompletedNav = navMode === "public_completed";
  const [moreOpen, setMoreOpen] = useState(false);

  const overflowItems: OverflowNavItem[] = [
    { label: "Billing", path: "/app/billing", title: "Compare plans, subscription status, and payment" },
    { label: "Integrations", path: "/app/integrations", title: "Webhooks and API integration settings" },
    { label: "Settings", path: "/app/settings", title: "Account and workspace settings" },
  ];
  const navigateToPaidWorkspaceCreate = () => {
    // Same isolation as Dashboard → Create new: never inherit a prior signer-setup arm.
    initializeNewAgreementSession();
    navigate("/app/create", {
      paidDashboardCreate: true,
      paidDashboardCreateSource: "dashboard_paid_create",
    });
  };
  if (showLegacyQuickPath) {
    overflowItems.unshift({ label: "Quick send", path: "/app/quick", title: "Legacy quick send path" });
  }
  overflowItems.push(
    { label: "Reuse agreements", path: "/app/agreement-memory", title: "Find and reuse prior agreements" },
    { label: "Work product", path: "/app/work-product", title: "Briefs and memos from your materials" },
  );
  if (showAdminConsoleNav) {
    overflowItems.push(
      {
        label: "Admin Console",
        path: "/app/admin",
        title: "Operator Admin Console (support operators only)",
      },
      {
        label: "Genesis Referral — Ops",
        path: "/app/ops/genesis-referral",
        title: "Create Genesis Dog affiliates and export commissions",
      },
    );
  }

  return (
    <div className="vs01-root">
      <div className="vs01-accent-strip" aria-hidden />
      <div className="vs01-shell">
        <nav
          className="claw-app-nav flex flex-col gap-3 border-b border-slate-800/80 pb-4 sm:flex-row sm:items-center sm:justify-between"
          aria-label="App"
          data-testid="app-shell-primary-nav"
          data-app-shell-nav={
            publicCompletedNav
              ? "public_completed"
              : minimalNav
                ? "minimal"
                : esignBridgeNav
                  ? "esign_bridge_focused"
                  : "default"
          }
        >
          <div className="flex items-center gap-3">
            {publicCompletedNav ? (
              <LawdogBrand variant="wordmark" size="md" surface="dark" />
            ) : (
              <LawdogLogoLink homeHref="/app" wordmark surface="dark" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {minimalNav ? (
              <>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                  title="LawDog dashboard"
                  onClick={() => navigate("/app")}
                >
                  Back to dashboard
                </button>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                  onClick={navigateToPaidWorkspaceCreate}
                >
                  New agreement
                </button>
              </>
            ) : null}
            {!minimalNav && esignBridgeNav ? (
              <>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                  title="Saved agreements and drafts"
                  onClick={() => navigate("/app/agreements")}
                >
                  My agreements
                </button>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                  title="LawDog dashboard"
                  onClick={() => navigate("/app")}
                >
                  Dashboard
                </button>
              </>
            ) : null}
            {!minimalNav && !esignBridgeNav && !publicCompletedNav ? (
              <>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                  title="Agreement dashboard"
                  onClick={() => navigate("/app")}
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                  onClick={navigateToPaidWorkspaceCreate}
                >
                  Create
                </button>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                  onClick={() => navigate("/app/agreements")}
                >
                  Agreements
                </button>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                  onClick={() => navigate("/app/signatures")}
                >
                  Signatures
                </button>
                {showAffiliateNav ? (
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                    data-testid="app-shell-nav-affiliate"
                    onClick={() => navigate("/app/genesis-referral")}
                  >
                    Affiliate
                  </button>
                ) : null}
                <div className="relative">
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                    aria-expanded={moreOpen}
                    aria-haspopup="menu"
                    data-testid="app-shell-nav-more"
                    onClick={() => setMoreOpen((open) => !open)}
                  >
                    More
                  </button>
                  {moreOpen ? (
                    <div
                      className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-slate-700/80 bg-slate-950 py-1 shadow-xl"
                      role="menu"
                      data-testid="app-shell-nav-more-menu"
                    >
                      {overflowItems.map((item) => (
                        <button
                          key={item.path}
                          type="button"
                          role="menuitem"
                          className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-900"
                          title={item.title}
                          onClick={() => {
                            setMoreOpen(false);
                            navigate(item.path);
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </nav>

        <header className="vs01-header">
          <div className="vs01-header-panel">
            <h1 className="vs01-header-title">{title}</h1>
            {subtitle ? <div className="vs01-header-subtitle">{subtitle}</div> : null}
          </div>
        </header>

        <main className="vs01-main">{children}</main>

        <footer className={compactFooter ? "vs01-footer vs01-footer--compact" : "vs01-footer"}>
          <DisclosureFooter slim={compactFooter} />
          <LawdogBuildIdentityMark className="mt-2 px-1 opacity-80" />
          <JoySocialFooter />
        </footer>
      </div>
    </div>
  );
}
