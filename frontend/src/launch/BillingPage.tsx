import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import { getOrgId, setOrgId } from "./orgContext";
import { fetchSubscription } from "./billingApi";
import { featureFlags } from "../config/featureFlags";
import { useLaunchNav } from "./LaunchNavContext";
import {
  HOMEPAGE_PRODUCT_TRUST_MICRO,
  LAWDOG_MICRO_TRUST_UNDER_CTA,
  PRICING_CREDIBILITY_ONE_WORKFLOW,
  PRICING_HEADLINE,
  PRICING_SUBHEAD,
} from "./pricingContent";
import { SampleArtifactsPreview } from "./SampleArtifactsPreview";
import { LawdogValueBulletsList, PricingGuaranteePanel } from "./LaunchOfferBlocks";
import { LAUNCH_PRICING_TIERS, PRICING_FAQ, PRICING_PROOF_CALLOUT } from "./pricingTiersData";
import { BillingTermsNotice } from "../compliance/BillingTermsNotice";
import { ConsentAcknowledgement } from "../compliance/ConsentAcknowledgement";
import { DOWNGRADE_ACCESS_SHORT, NOT_LEGAL_ADVICE, PRODUCT_NOT_LAW_FIRM } from "../compliance/disclosureCopy";
import { PricingCadenceToggle } from "./PricingCadenceToggle";
import { getPricingCadencePreference, setPricingCadencePreference, type PricingCadence } from "./pricingCadenceStorage";
import {
  buildCreateFlowProCheckoutPath,
  extractAgreementIdFromSendReturnUrl,
  isCreateFlowUpgradeReturnTo,
} from "./checkoutParams";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../components/agreements/agreementAdvancedDraftAccess";
import { paintedFreeDumpOpensExistingCheckout } from "../components/agreements/paidProSessionEligibility";
import { buildCreateReturnToWithStarterReviewRestore } from "../components/agreements/checkoutBackRestore";
import { applySimpleSendUnlockFromReturnPath } from "./simpleFlowSendUnlock";
import { ConversionPricingTriad } from "./ConversionPricingTriad";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { AgreementCompletionCheckoutContextPanel } from "../components/agreements/AgreementCompletionCheckoutContext";
import { readUpgradeCheckoutContext } from "../components/agreements/upgradeCheckoutContextStorage";

function planLabelFromCode(code: string | undefined | null): string | null {
  const c = (code || "").trim().toLowerCase();
  if (!c) return null;
  const t = LAUNCH_PRICING_TIERS.find((x) => x.id === c);
  if (t) return t.name;
  if (c === "team") return LAUNCH_PRICING_TIERS.find((x) => x.id === "pro")?.name ?? "LawDog Pro";
  if (c === "business") return "Enterprise";
  return c.replace(/_/g, " ");
}

const OUTCOME_ROWS = [
  { title: "Create", detail: "Describe the deal in plain language — get a structured draft you can review in minutes." },
  { title: "Send", detail: "Turn drafts into real agreements: professional sends, signatures, and records you can stand behind." },
  { title: "Scale", detail: "Upgrade when you need watermark-free delivery, export, team workflows, and integrations." },
  {
    title: "Enterprise",
    detail:
      "Custom pricing for volume agreement programs, API access, compliance packaging, and org-level Agreement Memory — when Pro self-serve is not enough.",
  },
] as const;

export function BillingPage() {
  const { navigate, search } = useLaunchNav();
  const faqBaseId = useId();
  const pricingLogged = useRef(false);
  const returnToSimpleSend = useMemo(() => {
    const p = new URLSearchParams(search);
    const r = p.get("returnTo");
    if (!r) return null;
    return r.startsWith("/app/") ? r : null;
  }, [search]);
  const [cadence, setCadence] = useState<PricingCadence>(() => getPricingCadencePreference());
  const [org, setOrg] = useState(getOrgId());
  const [sub, setSub] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const returnToCreateFlow = Boolean(returnToSimpleSend && /^\/app\/create(\?|$)/.test(returnToSimpleSend));
  const upgradeCheckoutEcho = useMemo(
    () => (returnToCreateFlow ? readUpgradeCheckoutContext() : null),
    [returnToCreateFlow, returnToSimpleSend],
  );

  useEffect(() => {
    if (pricingLogged.current) return;
    pricingLogged.current = true;
    logProductEvent("pricing_viewed", { surface: "billing_page", send_context: Boolean(returnToSimpleSend) });
  }, [returnToSimpleSend]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setErr(null);
      if (!featureFlags.serverBilling) {
        setSub(null);
        return;
      }
      const s = await fetchSubscription(org);
      if (cancel) return;
      if (s.error) setErr(s.error);
      setSub((s.data ?? null) as Record<string, unknown> | null);
    })();
    return () => {
      cancel = true;
    };
  }, [org]);

  const currentPlanCode = typeof sub?.plan_code === "string" ? sub.plan_code : null;
  const currentPlanLabel = planLabelFromCode(currentPlanCode);

  function ctaForTier(tierId: string) {
    if (tierId === "enterprise") {
      navigate("/app/create?intent=enterprise");
      return;
    }
    if (returnToSimpleSend) {
      const aid = extractAgreementIdFromSendReturnUrl(returnToSimpleSend);
      if (aid) {
        navigate(
          `/app/checkout/${encodeURIComponent(aid)}?tier=${encodeURIComponent(tierId)}&cadence=${encodeURIComponent(cadence)}&returnTo=${encodeURIComponent(returnToSimpleSend)}`,
        );
        return;
      }
      if (isCreateFlowUpgradeReturnTo(returnToSimpleSend)) {
        navigate(
          buildCreateFlowProCheckoutPath({
            agreementId: CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
            returnTo: returnToSimpleSend,
            cadence,
          }),
          { guestCheckout: true },
        );
        return;
      }
      applySimpleSendUnlockFromReturnPath(returnToSimpleSend);
      navigate(returnToSimpleSend);
      return;
    }
    if (paintedFreeDumpOpensExistingCheckout() || returnToCreateFlow) {
      navigate(
        buildCreateFlowProCheckoutPath({
          agreementId: CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
          returnTo: buildCreateReturnToWithStarterReviewRestore(),
          cadence,
        }),
        { guestCheckout: true },
      );
      return;
    }
    navigate("/app/create");
  }

  function setCadenceAndStore(next: PricingCadence): void {
    setCadence(next);
    setPricingCadencePreference(next);
  }

  return (
    <AppShell title={PRICING_HEADLINE} subtitle={PRICING_SUBHEAD}>
      <div className="space-y-12">
        <div className="max-w-2xl space-y-3 rounded-lg border border-slate-800/80 bg-slate-950/35 px-4 py-4">
          <p className="text-sm font-medium leading-snug text-slate-200">{PRICING_CREDIBILITY_ONE_WORKFLOW}</p>
          <p className="text-xs leading-relaxed text-slate-500">{HOMEPAGE_PRODUCT_TRUST_MICRO.join(" · ")}</p>
          <SampleArtifactsPreview variant="app" />
        </div>
        {returnToSimpleSend && !returnToCreateFlow ? (
          <div
            className="max-w-2xl rounded-lg border border-emerald-800/35 bg-emerald-950/20 px-4 py-3 text-sm leading-relaxed text-slate-200"
            role="status"
          >
            You&apos;re making this agreement official. Pick a plan and we&apos;ll bring you back to{" "}
            <span className="font-medium text-emerald-200/95">send</span> — your draft stays as you left it.
          </div>
        ) : null}

        {returnToCreateFlow ? (
          <div className="mx-auto w-full max-w-[1240px] rounded-2xl border border-slate-800/80 bg-slate-950/25 p-5 sm:p-6 lg:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">
              Returning to create
            </p>
            <p className="mt-2 text-lg font-semibold tracking-tight text-slate-100 sm:text-xl">Complete this agreement</p>
            <p className="mt-2 max-w-[56ch] text-[15px] leading-7 text-slate-300 sm:text-base">
              Same reasons you saw before — pick a plan, then you&apos;ll return to your draft to finish the complete
              version.
            </p>
            <div className="mt-6 max-w-3xl border-t border-slate-800/60 pt-6">
              <AgreementCompletionCheckoutContextPanel
                compact
                reasons={upgradeCheckoutEcho?.reasons ?? undefined}
                completionLabel={upgradeCheckoutEcho?.completionLabel}
              />
            </div>
          </div>
        ) : null}

        <section aria-label="Plans" className="overflow-x-clip">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-xl text-sm leading-relaxed text-slate-500">
              Create and send agreements in minutes. Try LawDog as a Guest, subscribe to LawDog Pro ($49/mo), or talk to us for Enterprise. Plus is retired.
            </p>
            <PricingCadenceToggle value={cadence} onChange={setCadenceAndStore} idPrefix="billing-cadence" className="shrink-0" />
          </div>

          <LawdogValueBulletsList variant="dark" className="mt-6 max-w-2xl space-y-2.5" />

          <PricingGuaranteePanel variant="dark" className="mt-8" />

          <ConversionPricingTriad
            cadence={cadence}
            sendReturnFlow={Boolean(returnToSimpleSend)}
            onFree={() => navigate("/app/create")}
            onStarter={() => ctaForTier("starter")}
            onPro={() => ctaForTier("pro")}
            onEnterprise={() => navigate("/app/create?intent=enterprise")}
          />

          <p className="mx-auto mt-6 max-w-2xl text-center text-xs font-medium leading-relaxed text-slate-400 sm:text-left">
            {LAWDOG_MICRO_TRUST_UNDER_CTA}
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-center text-xs leading-relaxed text-slate-500 sm:text-left">
            Subscription plans — simple monthly or annual billing. See FAQ for details.
          </p>

          <p className="mt-4 text-center text-sm text-slate-500 md:text-left">
            <span className="text-slate-600">Enterprise or custom terms?</span>{" "}
            <button
              type="button"
              className="font-medium text-emerald-400/95 underline-offset-2 hover:text-emerald-300 hover:underline"
              onClick={() => navigate("/app/create?intent=enterprise")}
            >
              Talk to us
            </button>
          </p>
        </section>

        <section className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-5 sm:p-6" aria-labelledby="outcomes-heading">
          <h2 id="outcomes-heading" className="text-center text-sm font-semibold uppercase tracking-[0.14em] text-slate-500 md:text-left">
            What you get
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {OUTCOME_ROWS.map((row) => (
              <div key={row.title} className="rounded-lg border border-slate-800/60 bg-slate-950/35 px-4 py-4">
                <p className="text-sm font-semibold text-slate-100">{row.title}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">{row.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-5 sm:p-6" aria-labelledby="proof-callout">
          <h2 id="proof-callout" className="text-sm font-semibold text-emerald-300/95">
            After you send
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{PRICING_PROOF_CALLOUT}</p>
        </section>

        <section className="border-t border-slate-800/80 pt-10" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-center text-lg font-semibold text-white md:text-left">
            FAQ
          </h2>
          <div className="mx-auto mt-6 max-w-2xl space-y-2 md:mx-0">
            {PRICING_FAQ.map((item, i) => (
              <details
                key={item.q}
                className="group rounded-lg border border-slate-800/90 bg-slate-950/40 open:border-emerald-900/25"
              >
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-200 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-2">
                    {item.q}
                    <span className="text-slate-500 group-open:rotate-180 motion-safe:transition">▼</span>
                  </span>
                </summary>
                <div
                  id={`${faqBaseId}-faq-${i}`}
                  className="border-t border-slate-800/80 px-4 py-3 text-sm leading-relaxed text-slate-400"
                >
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </section>

        <BillingTermsNotice />

        <ConsentAcknowledgement
          className="rounded-lg border border-slate-800/80 bg-slate-950/30 p-4"
          disclosureKey="product_terms_1"
          orgId={org.trim() || undefined}
          userRef="launch_pricing_visitor"
          subjectType="page"
          subjectId="pricing"
          label={`I acknowledge ${PRODUCT_NOT_LAW_FIRM} ${NOT_LEGAL_ADVICE} and that product disclosures are informational.`}
        />

        <div className="flex flex-col items-center gap-3 border-t border-slate-800/80 pt-10">
          <button
            type="button"
            className="vs01-btn vs01-btn--primary px-8 py-3 text-sm font-semibold"
            onClick={() => navigate("/app/create")}
          >
            Create your first agreement
          </button>
        </div>

        <section className="vs01-card vs01-card--envelope space-y-4 border-slate-800/60">
          <h3 className="text-sm font-semibold text-white">Your workspace</h3>
          <div>
            <label htmlFor="claw-org" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Workspace id
            </label>
            <input
              id="claw-org"
              className="mt-1 w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              onBlur={() => {
                setOrgId(org);
                setOrg(getOrgId());
              }}
            />
            <p className="mt-1 text-xs text-slate-500">
              Use the same workspace id in checkout so your plan applies to the right place.
            </p>
          </div>

          {!featureFlags.serverBilling ? (
            <p className="text-sm text-amber-200/90">
              Live plan lookup isn&apos;t enabled in this build. This page describes how LawDog is sold; connect billing in
              production to link a plan to this workspace.
            </p>
          ) : null}

          {featureFlags.serverBilling && currentPlanLabel ? (
            <p className="text-sm text-slate-300">
              Current plan: <strong className="text-white">{currentPlanLabel}</strong>
            </p>
          ) : null}
          {featureFlags.serverBilling && !currentPlanLabel && !err ? (
            <p className="text-sm text-slate-500">No active plan on file for this workspace yet.</p>
          ) : null}

          {err ? <p className="text-sm text-rose-300" role="alert">{err}</p> : null}
          <p className="mt-3 text-sm leading-relaxed text-slate-400">{DOWNGRADE_ACCESS_SHORT}</p>
          <p className="text-xs text-slate-500">
            Enterprise: custom pricing — we align volume, APIs, compliance, and org-wide intelligence with your
            procurement process; no list-rate surprises in-product.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
