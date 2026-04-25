import { useMemo } from "react";
import { useAccess } from "../../access/AccessContext";
import type { AccessTier } from "../../access/types";
import { useLaunchNav } from "../../launch/LaunchNavContext";
import { SpaLink } from "../../launch/SpaLink";
import { DOWNGRADE_ACCESS_SHORT } from "../../compliance/disclosureCopy";

const TIERS: AccessTier[] = ["free", "standard", "premium", "admin"];

export function AccessAccountPanel() {
  const { navigate } = useLaunchNav();
  const {
    planLabel,
    allowanceRows,
    showDevTierSwitcher,
    setDevOverrideTier,
    tier,
  } = useAccess();

  const summary = useMemo(
    () =>
      allowanceRows
        .filter((r) => r.limit != null)
        .map((r) =>
          r.limit != null ? `${r.label}: ${r.used} / ${r.limit === null ? "∞" : r.limit}` : null
        )
        .filter(Boolean)
        .slice(0, 3),
    [allowanceRows]
  );

  return (
    <section className="vs01-access-panel rounded-xl border border-slate-800/90 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Account · Access</h3>
      <p className="mt-2 text-sm text-slate-100">
        Current plan: <span className="font-semibold text-white">{planLabel}</span>
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        Renewal rules follow the billing interval you purchased (monthly vs. annual). Open{" "}
        <button
          type="button"
          className="min-h-9 rounded px-0.5 font-medium text-emerald-400/95 underline-offset-2 hover:text-emerald-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/70"
          onClick={() => navigate("/app/billing")}
        >
          Billing
        </button>{" "}
        to compare plans, update payment, or cancel. Refunds and credits are only as stated in the Terms of Service and
        at purchase.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">{DOWNGRADE_ACCESS_SHORT}</p>
      {summary.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-slate-400">
          {summary.map((line) => (
            <li key={String(line)}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-slate-500">Usage meters track activity in this browser for the current month.</p>
      )}
      <nav className="mt-3 flex flex-wrap gap-x-3 gap-y-2 border-t border-slate-800/80 pt-3 text-xs" aria-label="Legal and billing links">
        <SpaLink
          to="/terms"
          className="inline-flex min-h-9 items-center font-medium text-emerald-400/95 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Terms of Service
        </SpaLink>
        <SpaLink
          to="/privacy"
          className="inline-flex min-h-9 items-center font-medium text-emerald-400/95 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Privacy Policy
        </SpaLink>
        <SpaLink
          to="/privacy#privacy-contact"
          className="inline-flex min-h-9 items-center font-medium text-emerald-400/95 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Data &amp; privacy requests
        </SpaLink>
        <SpaLink
          to="/privacy#privacy-cookies-choices"
          className="inline-flex min-h-9 items-center font-medium text-emerald-400/95 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Cookie &amp; storage choices
        </SpaLink>
      </nav>
      {showDevTierSwitcher ? (
        <div className="mt-3 border-t border-slate-800/80 pt-3">
          <label htmlFor="claw-dev-tier" className="text-xs font-semibold uppercase tracking-wide text-amber-600/90">
            Dev · plan override
          </label>
          <select
            id="claw-dev-tier"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
            value={tier}
            onChange={(ev) => {
              const t = ev.target.value as AccessTier;
              if (TIERS.includes(t)) setDevOverrideTier(t);
            }}
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="mt-2 text-[11px] text-slate-500 underline hover:text-slate-300"
            onClick={() => setDevOverrideTier(null)}
          >
            Clear override (use URL/env/query resolution)
          </button>
          <p className="mt-1 text-xs text-slate-600">
            Tip: add <code className="text-slate-500">?claw_plan=premium</code> when dev tools are on.
          </p>
        </div>
      ) : null}
    </section>
  );
}
