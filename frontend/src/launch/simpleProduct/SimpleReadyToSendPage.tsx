import { useEffect, useRef, useState, useMemo } from "react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { fetchAgreementDraft } from "../../agreement/agreementWorkspaceApi";
import { normalizeJurisdictionDisplay } from "../../agreement/jurisdictionNormalize";
import {
  formatAuthoritativeAgreementPartiesInline,
} from "../../agreement/handoffPartyDisplay";
import { useDynamicConfig } from "../../config/dynamicConfig/useDynamicConfig";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import { useLaunchNav } from "../LaunchNavContext";
import { PricingCadenceToggle } from "../PricingCadenceToggle";
import { getPricingCadencePreference, setPricingCadencePreference, type PricingCadence } from "../pricingCadenceStorage";
import { canAccessSimpleSendActions, isSimpleSendPaywallActive } from "../simpleFlowSendUnlock";
import { LawdogValueBulletsList } from "../LaunchOfferBlocks";
import { ConversionPricingTriad } from "../ConversionPricingTriad";
import { PAYWALL_DEFAULT_HEADLINE, PAYWALL_DEFAULT_SUB } from "../paywallMessaging";
import {
  AGREEMENT_LIFECYCLE_PROGRESS_LABELS,
  lifecycleStepForStage,
} from "../../agreement/agreementLifecycleRail";
import { SimpleFlowShell } from "./SimpleFlowShell";
import { normalizeAgreementDisplayTitle } from "../../components/agreements/canonicalAgreementTitle";

const FLOW_PROGRESS = AGREEMENT_LIFECYCLE_PROGRESS_LABELS;

export function SimpleReadyToSendPage(props: { agreementId: string }) {
  const { agreementId } = props;
  const { navigate } = useLaunchNav();
  const dc = useDynamicConfig();
  const rts = dc.readyToSend;
  const [draft, setDraft] = useState<AgreementDraft | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [cadence, setCadence] = useState<PricingCadence>(() => getPricingCadencePreference());
  const viewedLogged = useRef(false);

  function setCadenceAndStore(next: PricingCadence): void {
    setCadence(next);
    setPricingCadencePreference(next);
  }

  useEffect(() => {
    if (viewedLogged.current) return;
    viewedLogged.current = true;
    logProductEvent("ready_to_send_viewed", { agreementId });
    logProductEvent("pricing_viewed", { agreementId, surface: "ready_to_send_bridge" });
  }, [agreementId]);

  useEffect(() => {
    if (!isSimpleSendPaywallActive()) {
      navigate(`/app/send/${encodeURIComponent(agreementId)}?phase=send`);
      return;
    }
    if (canAccessSimpleSendActions(agreementId)) {
      navigate(`/app/send/${encodeURIComponent(agreementId)}?phase=send`);
    }
  }, [agreementId, navigate]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setLoadErr(null);
      const { ok, draft: d } = await fetchAgreementDraft(agreementId);
      if (cancel) return;
      if (!ok || !d) {
        setLoadErr("We couldn’t load this draft. Go back and try again.");
        setDraft(null);
        return;
      }
      setDraft(d);
    })();
    return () => {
      cancel = true;
    };
  }, [agreementId]);

  const partySummary = useMemo(() => {
    if (!draft?.parties?.length) return "Parties on your draft";
    return formatAuthoritativeAgreementPartiesInline(draft.parties, { maxShown: 48, separator: " · " });
  }, [draft?.parties]);
  const rawJurisdiction = (draft?.jurisdiction ?? "").trim();
  const jurisdictionLine = rawJurisdiction ? normalizeJurisdictionDisplay(rawJurisdiction) : null;

  const billingReturnTo = `/app/send/${encodeURIComponent(agreementId)}?phase=send`;

  function goToCheckoutTier(tierId: "starter" | "pro"): void {
    setPricingCadencePreference(cadence);
    navigate(
      `/app/checkout/${encodeURIComponent(agreementId)}?tier=${encodeURIComponent(tierId)}&cadence=${encodeURIComponent(cadence)}&returnTo=${encodeURIComponent(billingReturnTo)}`,
    );
  }

  return (
    <SimpleFlowShell
      step={lifecycleStepForStage("sign")}
      progressLabels={FLOW_PROGRESS}
      title={PAYWALL_DEFAULT_HEADLINE}
      subtitle={PAYWALL_DEFAULT_SUB}
    >
      <div className="space-y-8">
        <p className="text-center text-[11px] leading-relaxed text-slate-500 sm:text-left">
          No account needed to try the flow. Nothing is sent to signers until you confirm on the send step.
        </p>
        {loadErr ? (
          <div className="rounded-lg border border-rose-800/40 bg-rose-950/20 px-4 py-3 text-sm text-rose-100" role="alert">
            {loadErr}
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-800/70 bg-slate-950/[0.35] px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{rts.alreadyInGoodShapeHeading}</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            <li className="flex gap-2">
              <span className="text-emerald-500/90" aria-hidden>
                ✓
              </span>
              <span>Agreement drafted{draft?.title ? ` — “${normalizeAgreementDisplayTitle(draft.title.trim()) || draft.title.trim()}”` : ""}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500/90" aria-hidden>
                ✓
              </span>
              <span>Parties lined up — {partySummary}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500/90" aria-hidden>
                ✓
              </span>
              <span>
                Terms structured for send
                {jurisdictionLine ? ` — ${jurisdictionLine}` : ""}
              </span>
            </li>
          </ul>
        </div>

        <section aria-label="Choose a plan" className="space-y-4 overflow-x-clip">
          <p className="text-sm leading-relaxed text-slate-400">{rts.pageSubtitle}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">Most people choose Pro for 10 finalized agreements per period and watermark-free sends.</p>
            <PricingCadenceToggle value={cadence} onChange={setCadenceAndStore} idPrefix="ready-cadence" className="shrink-0" />
          </div>
          <LawdogValueBulletsList variant="dark" className="mt-4 space-y-2" />
          <ConversionPricingTriad
            cadence={cadence}
            sendReturnFlow
            bridge
            onFree={() => navigate("/app/create")}
            onStarter={() => goToCheckoutTier("starter")}
            onPro={() => goToCheckoutTier("pro")}
            onEnterprise={() => navigate("/app/create?intent=enterprise")}
          />
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary w-full min-h-[2.75rem] px-6 sm:w-auto"
            onClick={() => {
              logProductEvent("save_for_later_clicked", { agreementId, surface: "ready_to_send_bridge" });
              navigate("/app");
            }}
          >
            Save draft for later
          </button>
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary w-full min-h-[2.75rem] px-6 sm:w-auto"
            onClick={() => navigate(`/app/send/${encodeURIComponent(agreementId)}`)}
          >
            Back to edit
          </button>
          <button
            type="button"
            className="text-sm text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline sm:ml-2"
            onClick={() =>
              navigate(`/app/billing?returnTo=${encodeURIComponent(billingReturnTo)}`)
            }
          >
            Compare plans in detail
          </button>
        </div>

        <p className="text-center text-[11px] leading-relaxed text-slate-600 sm:text-left">{rts.footerReassurance}</p>
      </div>
    </SimpleFlowShell>
  );
}
