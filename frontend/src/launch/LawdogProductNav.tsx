import type { ReactNode } from "react";
import { useLaunchNav } from "./LaunchNavContext";

export type LawdogNavItemId =
  | "dashboard"
  | "agreements"
  | "signatures"
  | "affiliate"
  | "billing"
  | "settings";

type NavItem = {
  id: LawdogNavItemId;
  label: string;
  path: string;
  testId: string;
};

export const LAWDOG_NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", path: "/app", testId: "lawdog-nav-dashboard" },
  { id: "agreements", label: "Agreements", path: "/app/agreements", testId: "lawdog-nav-agreements" },
  { id: "signatures", label: "Signatures", path: "/app/signatures", testId: "lawdog-nav-signatures" },
  { id: "affiliate", label: "Affiliate", path: "/app/affiliate", testId: "lawdog-nav-affiliate" },
  { id: "billing", label: "Billing", path: "/app/billing", testId: "lawdog-nav-billing" },
  { id: "settings", label: "Settings", path: "/app/settings", testId: "lawdog-nav-settings" },
];

export function resolveLawdogNavActiveId(pathname: string): LawdogNavItemId {
  const p = (pathname || "").replace(/\/$/, "") || "/";
  if (p === "/dashboard" || p === "/app") return "dashboard";
  if (p.startsWith("/app/agreements")) return "agreements";
  if (p.startsWith("/app/signatures")) return "signatures";
  if (p === "/app/affiliate" || p === "/app/opportunity") return "affiliate";
  if (p.startsWith("/app/billing")) return "billing";
  if (p.startsWith("/app/settings")) return "settings";
  return "dashboard";
}

export function LawdogProductNav(props: { activeId?: LawdogNavItemId }) {
  const { navigate, pathname } = useLaunchNav();
  const activeId = props.activeId ?? resolveLawdogNavActiveId(pathname);

  return (
    <nav
      className="flex flex-col gap-1"
      aria-label="LawDog workspace"
      data-testid="lawdog-product-nav"
    >
      {LAWDOG_NAV_ITEMS.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
              active
                ? "bg-slate-800/80 text-white"
                : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
            }`}
            data-testid={item.testId}
            data-lawdog-nav-active={active ? "true" : "false"}
            aria-current={active ? "page" : undefined}
            onClick={() => navigate(item.path)}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

export function LawdogDashboardLayout(props: {
  children: ReactNode;
  activeId?: LawdogNavItemId;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <aside
        className="shrink-0 lg:w-44"
        aria-label="Dashboard navigation"
        data-testid="lawdog-dashboard-sidebar"
      >
        <LawdogProductNav activeId={props.activeId} />
      </aside>
      <div className="min-w-0 flex-1">{props.children}</div>
    </div>
  );
}
