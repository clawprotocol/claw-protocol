import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDynamicConfig } from "../../config/dynamicConfig/useDynamicConfig";
import { useFeatureGate } from "../../config/featureFlags/useFeatureGate";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import { AppShell } from "../AppShell";
import { getOrgId } from "../orgContext";
import { useLaunchNav } from "../LaunchNavContext";
import { getOpportunitySnapshot } from "./clawOpportunityStore";
import { AffiliateDashboardPanel } from "./AffiliateDashboardPanel";
import { ClawOpportunityGamificationSections } from "./ClawOpportunityGamificationSections";
import { buildOpportunityGamificationView } from "./opportunityGamification";
import { AffiliateProgramFaq } from "./AffiliateProgramFaq";
import { SpaLink } from "../SpaLink";
import { readAffiliateTermsAccepted } from "../legal/affiliateTermsAcceptance";

type LinkCardState = "join" | "create" | "ready";

function OpportunityIntroCards(props: { onGoTo: (id: string) => void; linkState: LinkCardState }) {
  const { onGoTo, linkState } = props;
  const cardClass =
    "flex flex-1 flex-col rounded-2xl border border-slate-800/80 bg-slate-950/50 p-5 text-left shadow-sm transition hover:border-slate-700/90 min-h-[8.5rem] sm:min-h-0";
  const linkCopy =
    linkState === "join"
      ? { body: "Accept terms to join the affiliate program first.", cta: "Join first" }
      : linkState === "create"
        ? { body: "Create your referral link to start sharing.", cta: "Create your link" }
        : { body: "Copy and share your link.", cta: "Copy and share your link" };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-white">Your link</h2>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{linkCopy.body}</p>
        <button
          type="button"
          className="mt-3 self-start text-sm font-medium text-emerald-400/95 underline-offset-2 hover:underline"
          onClick={() => onGoTo("affiliate-your-link")}
        >
          {linkCopy.cta}
        </button>
      </div>
      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-white">Payouts &amp; activity</h2>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">
          Monthly payouts. Under $25 rolls forward to the next payout cycle.
        </p>
        <button
          type="button"
          className="mt-3 self-start text-sm font-medium text-emerald-400/95 underline-offset-2 hover:underline"
          onClick={() => onGoTo("affiliate-payouts-activity")}
        >
          Open activity
        </button>
      </div>
      <div className={`${cardClass} sm:col-span-2 lg:col-span-1`}>
        <h2 className="text-sm font-semibold text-white">Program rules</h2>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">Terms, taxes, and how the program works.</p>
        <button
          type="button"
          className="mt-3 self-start text-sm font-medium text-emerald-400/95 underline-offset-2 hover:underline"
          onClick={() => onGoTo("affiliate-program-rules")}
        >
          View rules
        </button>
      </div>
    </div>
  );
}

export function ClawOpportunityPage() {
  const { navigate } = useLaunchNav();
  const orgId = getOrgId();
  const affiliateOn = useFeatureGate("affiliate_opportunity_enabled");
  const dc = useDynamicConfig();
  const opp = dc.opportunity;
  const [refresh, setRefresh] = useState(0);
  const viewLogged = useRef(false);
  const [linkState, setLinkState] = useState<LinkCardState>(() => (readAffiliateTermsAccepted() ? "create" : "join"));

  const scrollToId = useCallback((id: string) => {
    if (typeof document === "undefined") return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const onVis = (): void => {
      if (document.visibilityState === "visible") setRefresh((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!affiliateOn || viewLogged.current) return;
    viewLogged.current = true;
    logProductEvent("affiliate_opportunity_viewed", {});
  }, [affiliateOn]);

  const snap = useMemo(() => getOpportunitySnapshot(), [refresh]);
  const gamification = useMemo(() => buildOpportunityGamificationView(snap), [snap]);

  if (!affiliateOn) {
    return (
      <AppShell title="Unavailable" subtitle="This area is paused.">
        <p className="mx-auto max-w-xl text-sm text-slate-400">Affiliate tools are temporarily off. Your agreements are unchanged.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={opp.shellTitle} subtitle={opp.shellSubtitle}>
      <div className="mx-auto w-full max-w-5xl space-y-8 pb-10">
        <OpportunityIntroCards onGoTo={scrollToId} linkState={linkState} />

        {orgId ? <AffiliateDashboardPanel orgId={orgId} onLinkStateChange={setLinkState} /> : null}

        <section id="affiliate-program-rules" className="scroll-mt-6 rounded-2xl border border-slate-800/70 bg-slate-950/35">
          <details className="group p-5 sm:p-6">
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-200 marker:content-none [&::-webkit-details-marker]:hidden">
              Program terms &amp; legal{" "}
              <span className="font-normal text-slate-500">(expand)</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Participation is subject to the{" "}
              <SpaLink to="/affiliate-terms" className="font-medium text-emerald-400/90 underline-offset-2 hover:underline">
                Affiliate Terms
              </SpaLink>
              . For general service terms, see the{" "}
              <SpaLink to="/terms" className="font-medium text-emerald-400/90 underline-offset-2 hover:underline">
                Terms of Service
              </SpaLink>
              .
            </p>
          </details>
        </section>

        <div className="space-y-4">
          <h2 className="text-center text-sm font-semibold text-slate-500 sm:text-left">Questions</h2>
          <AffiliateProgramFaq
            title="Common questions"
            titleId="aff-oppo-faq"
            className="rounded-2xl border border-slate-800/70 bg-slate-950/35 px-4 py-4 sm:px-6"
          />
        </div>

        <details className="rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/25 px-4 py-3 sm:px-5">
          <summary className="cursor-pointer text-sm font-medium text-slate-500">Device preview (not payouts)</summary>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            The section below is a local-only preview in this browser. Payouts and real activity are in{" "}
            <span className="text-slate-400">Payouts &amp; activity</span> above.
          </p>
          <div className="mt-4">
            <ClawOpportunityGamificationSections snapshot={snap} gamification={gamification} orgId={orgId} />
          </div>
        </details>

        <div className="flex flex-wrap justify-center gap-3 border-t border-slate-800/60 pt-8 sm:justify-start">
          <button type="button" className="vs01-btn vs01-btn--secondary" onClick={() => navigate("/app")}>
            Back to dashboard
          </button>
          <button type="button" className="vs01-btn vs01-btn--primary" onClick={() => navigate("/app/create")}>
            New agreement
          </button>
        </div>
      </div>
    </AppShell>
  );
}
