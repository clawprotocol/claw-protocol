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
  EARN_BENEFIT_CARDS,
  EARN_CTA_START,
  EARN_EARLY_ACCESS_NOTE,
  EARN_HERO_SUBHEAD,
  EARN_HERO_TITLE,
} from "../simpleProduct/proConversionCopy";

function EarnSimplifiedLanding(props: { onStart: () => void }) {
  const { onStart } = props;
  const cardClass =
    "flex flex-1 flex-col rounded-2xl border border-slate-800/80 bg-slate-950/50 p-5 text-left shadow-sm min-h-[7.5rem]";

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {EARN_BENEFIT_CARDS.map((card) => (
          <div key={card.title} className={cardClass}>
            <h2 className="text-sm font-semibold text-white">{card.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{card.body}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-4 sm:items-start">
        <button type="button" className="vs01-btn vs01-btn--primary min-h-12 px-8 text-base font-semibold" onClick={onStart}>
          {EARN_CTA_START}
        </button>
        <p className="max-w-xl text-center text-sm leading-relaxed text-slate-500 sm:text-left">{EARN_EARLY_ACCESS_NOTE}</p>
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
      <AppShell title="Unavailable" subtitle="This area is paused.">
        <p className="mx-auto max-w-xl text-sm text-slate-400">Affiliate tools are temporarily off. Your agreements are unchanged.</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={earnDetailsOpen ? opp.shellTitle : EARN_HERO_TITLE}
      subtitle={earnDetailsOpen ? opp.shellSubtitle : EARN_HERO_SUBHEAD}
    >
      <div className="mx-auto w-full max-w-5xl space-y-8 pb-10">
        {!earnDetailsOpen ? (
          <EarnSimplifiedLanding onStart={() => setEarnDetailsOpen(true)} />
        ) : (
          <>
            {orgId ? <AffiliateDashboardPanel orgId={orgId} /> : null}

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
          </>
        )}

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
