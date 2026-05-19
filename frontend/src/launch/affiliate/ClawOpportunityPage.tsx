import { useEffect, useRef, useState } from "react";
import { useDynamicConfig } from "../../config/dynamicConfig/useDynamicConfig";
import { useFeatureGate } from "../../config/featureFlags/useFeatureGate";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import { AppShell } from "../AppShell";
import { getOrgId } from "../orgContext";
import { useLaunchNav } from "../LaunchNavContext";
import { AffiliateDashboardPanel } from "./AffiliateDashboardPanel";
import { AffiliateProgramFaq } from "./AffiliateProgramFaq";
import { SpaLink } from "../SpaLink";
import {
  EARN_ACCESS_NOTE,
  EARN_BEHAVIOR_NOTE,
  EARN_BENEFIT_CARDS,
  EARN_CTA_BACK,
  EARN_CTA_START,
  EARN_HERO_SUBHEAD,
  EARN_HERO_TITLE,
} from "../simpleProduct/proConversionCopy";

function EarnSimplifiedLanding(props: { onRequestAccess: () => void; onBack: () => void }) {
  const { onRequestAccess, onBack } = props;
  const cardClass =
    "flex min-w-0 flex-col rounded-2xl border border-slate-800/80 bg-slate-950/50 p-4 text-left shadow-sm sm:p-5";

  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-6 pb-4 sm:space-y-7">
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {EARN_BENEFIT_CARDS.map((card) => (
          <div key={card.title} className={cardClass}>
            <h2 className="text-sm font-semibold text-white">{card.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{card.body}</p>
          </div>
        ))}
      </div>

      <p className="text-sm leading-relaxed text-slate-400">{EARN_ACCESS_NOTE}</p>
      <p className="text-xs leading-relaxed text-slate-500">{EARN_BEHAVIOR_NOTE}</p>

      <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
        <button
          type="button"
          className="vs01-btn vs01-btn--primary min-h-12 w-full min-w-0 px-8 text-base font-semibold sm:w-auto"
          onClick={onRequestAccess}
        >
          {EARN_CTA_START}
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary min-h-11 w-full min-w-0 sm:w-auto"
          onClick={onBack}
        >
          {EARN_CTA_BACK}
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
  const viewLogged = useRef(false);
  const [earnDetailsOpen, setEarnDetailsOpen] = useState(false);

  useEffect(() => {
    if (!affiliateOn || viewLogged.current) return;
    viewLogged.current = true;
    logProductEvent("affiliate_opportunity_viewed", {});
  }, [affiliateOn]);

  if (!affiliateOn) {
    return (
      <AppShell title="Unavailable" subtitle="This area is paused." compactFooter>
        <p className="mx-auto max-w-xl text-sm text-slate-400">Affiliate tools are temporarily off. Your agreements are unchanged.</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={earnDetailsOpen ? opp.shellTitle : EARN_HERO_TITLE}
      subtitle={earnDetailsOpen ? opp.shellSubtitle : EARN_HERO_SUBHEAD}
      compactFooter
    >
      <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6 overflow-x-hidden pb-6 sm:space-y-8 sm:pb-8">
        {!earnDetailsOpen ? (
          <EarnSimplifiedLanding
            onRequestAccess={() => setEarnDetailsOpen(true)}
            onBack={() => navigate("/app")}
          />
        ) : (
          <>
            {orgId ? <AffiliateDashboardPanel orgId={orgId} /> : null}

            <section id="affiliate-program-rules" className="scroll-mt-6 rounded-2xl border border-slate-800/70 bg-slate-950/35">
              <details className="group p-4 sm:p-5">
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

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-500">Questions</h2>
              <AffiliateProgramFaq
                title="Common questions"
                titleId="aff-oppo-faq"
                className="rounded-2xl border border-slate-800/70 bg-slate-950/35 px-4 py-4 sm:px-5"
              />
            </div>
          </>
        )}

        {earnDetailsOpen ? (
          <div className="border-t border-slate-800/60 pt-5">
            <button type="button" className="vs01-btn vs01-btn--secondary min-h-11 w-full min-w-0 sm:w-auto" onClick={() => navigate("/app")}>
              {EARN_CTA_BACK}
            </button>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
