import { useState } from "react";
import { AppShell } from "./AppShell";
import { LawdogDashboardLayout } from "./LawdogProductNav";
import { AccountLoginPanel } from "./AccountLoginPanel";
import { readStoredDisplayName, writeCurrentUserDisplayName } from "../account/currentUser";
import { resolveAffiliateUserSlug, writeAffiliateUserSlug } from "../account/affiliatePresentation";

export function LawdogSettingsPage() {
  const [displayName, setDisplayName] = useState(() => readStoredDisplayName());
  const [affiliateSlug, setAffiliateSlug] = useState(() => resolveAffiliateUserSlug());
  const [saved, setSaved] = useState(false);

  function save(): void {
    writeCurrentUserDisplayName(displayName);
    writeAffiliateUserSlug(affiliateSlug);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <AppShell title="Settings" subtitle="Workspace preferences for your LawDog account.">
      <LawdogDashboardLayout activeId="settings">
        <div className="max-w-md space-y-5">
          <AccountLoginPanel className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4" />
          <label className="block">
            <span className="text-sm font-medium text-slate-300">Display name</span>
            <input
              type="text"
              className="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              data-testid="settings-display-name"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-300">Affiliate link slug</span>
            <span className="mt-0.5 block text-xs text-slate-500">Used in /r/your-slug referral links.</span>
            <input
              type="text"
              className="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
              value={affiliateSlug}
              onChange={(e) => setAffiliateSlug(e.target.value)}
              data-testid="settings-affiliate-slug"
            />
          </label>
          <button
            type="button"
            className="vs01-btn vs01-btn--primary vs01-btn--compact"
            data-testid="settings-save"
            onClick={save}
          >
            {saved ? "Saved" : "Save settings"}
          </button>
        </div>
      </LawdogDashboardLayout>
    </AppShell>
  );
}
