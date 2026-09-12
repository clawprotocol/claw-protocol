import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import { getOrgId, setOrgId, subscribeToOrgContextChanges } from "./orgContext";
import { useAuth } from "../auth/AuthProvider";
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
import { PRICING_FAQ, PRICING_PROOF_CALLOUT } from "./pricingTiersData";
import { BillingTermsNotice } from "../compliance/BillingTermsNotice";
import { ConsentAcknowledgement } from "../compliance/ConsentAcknowledgement";
import { DOWNGRADE_ACCESS_SHORT, NOT_LEGAL_ADVICE, PRODUCT_NOT_LAW_FIRM } from "../compliance/disclosureCopy";
import { PricingCadenceToggle } from "./PricingCadenceToggle";
import { getPricingCadencePreference, setPricingCadencePreference, type PricingCadence } from "./pricingCadenceStorage";
import { extractAgreementIdFromSendReturnUrl } from "./checkoutParams";
import { ConversionPricingTriad } from "./ConversionPricingTriad";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { AgreementCompletionCheckoutContextPanel } from "../components/agreements/AgreementCompletionCheckoutContext";
import { readUpgradeCheckoutContext } from "../components/agreements/upgradeCheckoutContextStorage";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../components/agreements/agreementAdvancedDraftAccess";
import {
  checkoutStartErrorCode,
  createBillingCheckoutSession,
} from "./billingCheckoutApi";
import {
  createBillingPortalSession,
  fetchBillingStatus,
  type BillingStatusPayload,
} from "./billingStatusApi";
import {
  billingStatusDetail,
  billingStatusHeadline,
  shouldOfferProCheckout,
  type BillingUiPhase,
} from "./billingAccountDisplay";

export function isBillingWorkspaceIdEditable(): boolean {
  return Boolean(import.meta.env?.DEV) || String(import.meta.env?.VITE_CLAW_ACCESS_DEV_TOOLS || "").trim() === "1";
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
  const { user, loading: authLoading } = useAuth();
  const faqBaseId = useId();
  const pricingLogged = useRef(false);
  const requestSeq = useRef(0);
  const checkoutInFlight = useRef(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutRecovery, setCheckoutRecovery] = useState<{ code: string; message: string } | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const returnToSimpleSend = useMemo(() => {
    const p = new URLSearchParams(search);
    const r = p.get("returnTo");
    if (!r) return null;
    return r.startsWith("/app/") ? r : null;
  }, [search]);
  const [cadence, setCadence] = useState<PricingCadence>(() => getPricingCadencePreference());
  const [org, setOrg] = useState(getOrgId());
  const [status, setStatus] = useState<BillingStatusPayload | null>(null);
  const [uiPhase, setUiPhase] = useState<BillingUiPhase>("loading");
  const [err, setErr] = useState<string | null>(null);
  const workspaceIdEditable = isBillingWorkspaceIdEditable();
  const returnToCreateFlow = Boolean(returnToSimpleSend && /^\/app\/create(\?|$)/.test(returnToSimpleSend));
  const upgradeCheckoutEcho = useMemo(
    () => (returnToCreateFlow ? readUpgradeCheckoutContext() : null),
    [returnToCreateFlow, returnToSimpleSend],
  );
  const userId = user?.id ?? null;

  useEffect(() => {
    return subscribeToOrgContextChanges((next) => {
      setOrg(next);
      setStatus(null);
      setErr(null);
      setCheckoutRecovery(null);
      setUiPhase("loading");
    });
  }, []);

  useEffect(() => {
    setStatus(null);
    setErr(null);
    setPortalError(null);
    setCheckoutRecovery(null);
    setUiPhase(userId ? "loading" : authLoading ? "loading" : "signed_out");
  }, [org, userId, authLoading]);

  useEffect(() => {
    if (pricingLogged.current) return;
    pricingLogged.current = true;
    logProductEvent("pricing_viewed", { surface: "billing_page", send_context: Boolean(returnToSimpleSend) });
  }, [returnToSimpleSend]);

  useEffect(() => {
    const seq = ++requestSeq.current;
    const contextOrg = org;
    const contextUser = userId;
    if (!userId) {
      if (!authLoading) {
        setStatus(null);
        setUiPhase("signed_out");
      }
      return;
    }
    if (!featureFlags.serverBilling) {
      setStatus(null);
      setUiPhase("unavailable");
      return;
    }
    setUiPhase("loading");
    void (async () => {
      const s = await fetchBillingStatus();
      if (seq !== requestSeq.current) return;
      if (contextOrg !== getOrgId() || contextUser !== userId) return;
      if (s.anonymousExpected) {
        setStatus(null);
        setErr(null);
        setUiPhase("signed_out");
        return;
      }
      if (s.authFailure) {
        setStatus(null);
        setErr(s.error);
        setUiPhase(s.code === "wrong_org" ? "unavailable" : "signed_out");
        return;
      }
      if (s.unavailable || s.error || !s.data) {
        setStatus(null);
        setErr(s.error);
        setUiPhase("unavailable");
        return;
      }
      setErr(null);
      setStatus(s.data);
      setUiPhase(s.data.display_state);
    })();
  }, [org, userId, authLoading]);

  function returnToAgreementOrStay(): void {
    if (returnToSimpleSend) {
      navigate(returnToSimpleSend);
      return;
    }
  }

  function goToLocalCheckout(agreementId: string, returnTo: string): void {
    navigate(
      `/app/checkout/${encodeURIComponent(agreementId)}?tier=pro&cadence=${encodeURIComponent(cadence)}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  async function startProCheckout(): Promise<void> {
    if (checkoutInFlight.current || checkoutBusy) return;
    if (!shouldOfferProCheckout(status, uiPhase)) {
      returnToAgreementOrStay();
      return;
    }
    checkoutInFlight.current = true;
    setCheckoutBusy(true);
    setCheckoutRecovery(null);
    const aid =
      (returnToSimpleSend && extractAgreementIdFromSendReturnUrl(returnToSimpleSend)) ||
      CREATE_FLOW_CHECKOUT_AGREEMENT_ID;
    const returnTo = returnToSimpleSend || "/app/create";
    try {
      const session = await createBillingCheckoutSession({
        agreementId: aid,
        cadence,
        returnTo,
        customerEmail: user?.email ?? null,
      });
      if (!session.checkout_url) {
        setCheckoutRecovery({
          code: "payment_processing",
          message: "Your payment is being processed. Do not pay again.",
        });
        checkoutInFlight.current = false;
        setCheckoutBusy(false);
        return;
      }
      window.location.assign(session.checkout_url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start checkout.";
      const code = checkoutStartErrorCode(error);
      if (code === "already_subscribed" || /already_subscribed|already has an active subscription/i.test(message)) {
        const refreshed = await fetchBillingStatus();
        if (!refreshed.unavailable && refreshed.data) {
          setStatus(refreshed.data);
          setUiPhase(refreshed.data.display_state);
          setErr(null);
        }
        checkoutInFlight.current = false;
        setCheckoutBusy(false);
        return;
      }
      if (code === "purchase_unresolved" || /purchase_unresolved|could not confirm the previous checkout/i.test(message)) {
        setCheckoutRecovery({
          code: "purchase_unresolved",
          message: "We could not confirm the previous checkout. Do not pay again.",
        });
        checkoutInFlight.current = false;
        setCheckoutBusy(false);
        return;
      }
      if (code === "payment_processing" || /payment_processing|being processed|do not pay again/i.test(message)) {
        setCheckoutRecovery({
          code: "payment_processing",
          message: "Your payment is being processed. Do not pay again.",
        });
        checkoutInFlight.current = false;
        setCheckoutBusy(false);
        return;
      }
      if (code === "stripe_checkout_not_configured" || /stripe_checkout_not_configured/i.test(message)) {
        goToLocalCheckout(aid, returnTo);
        return;
      }
      setCheckoutRecovery({
        code: code || "checkout_failed",
        message,
      });
      checkoutInFlight.current = false;
      setCheckoutBusy(false);
    }
  }

  function ctaForTier(tierId: string) {
    if (tierId === "enterprise") {
      navigate("/app/create?intent=enterprise");
      return;
    }
    startProCheckout();
  }

  async function openBillingPortal(): Promise<void> {
    if (portalBusy || !status?.manage_available) return;
    setPortalBusy(true);
    setPortalError(null);
    try {
      const session = await createBillingPortalSession({
        returnTo: returnToSimpleSend || "/app/billing",
      });
      if (!session.portal_url) {
        throw new Error("Billing management did not return a destination.");
      }
      window.location.assign(session.portal_url);
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : "Could not open billing management.");
      setPortalBusy(false);
    }
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
            onPro={() => void ctaForTier("pro")}
            onEnterprise={() => navigate("/app/create?intent=enterprise")}
            proCtaDisabled={checkoutBusy || !shouldOfferProCheckout(status, uiPhase)}
            proCtaLabel={
              shouldOfferProCheckout(status, uiPhase)
                ? returnToSimpleSend
                  ? "Continue to checkout"
                  : "Upgrade to Pro"
                : status?.entitled
                  ? "You’re on Pro"
                  : "Upgrade to Pro"
            }
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

        <section
          className="vs01-card vs01-card--envelope space-y-4 border-slate-800/60"
          data-testid="billing-account-panel"
          data-billing-state={uiPhase}
        >
          <h3 className="text-sm font-semibold text-white">Your account</h3>
          <p className="text-sm text-slate-400">Subscription status comes from this signed-in workspace, not from the browser or a return link.</p>
          {workspaceIdEditable ? (
            <div>
              <label htmlFor="claw-org" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Development workspace id
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
              <p className="mt-1 text-xs text-slate-500">Development diagnostic only.</p>
            </div>
          ) : null}

          <p className="text-sm text-slate-200" data-testid="billing-status-headline">
            {billingStatusHeadline(uiPhase, status?.plan_label ?? null)}
          </p>
          <p className="text-sm text-slate-400" data-testid="billing-status-detail">
            {billingStatusDetail(status, uiPhase)}
          </p>
          {err ? (
            <p className="text-sm text-rose-300" role="alert" data-testid="billing-status-error">
              {err}
            </p>
          ) : null}
          {portalError ? (
            <p className="text-sm text-rose-300" role="alert" data-testid="billing-portal-error">
              {portalError}
            </p>
          ) : null}
          {checkoutRecovery ? (
            <p
              className="text-sm text-amber-100"
              role="alert"
              data-testid="billing-checkout-recovery"
              data-checkout-recovery={checkoutRecovery.code}
            >
              {checkoutRecovery.message}
            </p>
          ) : null}

          {status?.manage_available ? (
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary"
              data-testid="billing-manage-portal"
              disabled={portalBusy}
              onClick={() => void openBillingPortal()}
            >
              {portalBusy ? "Opening billing portal…" : "Manage billing"}
            </button>
          ) : uiPhase !== "loading" && uiPhase !== "signed_out" && uiPhase !== "no_subscription" ? (
            <p className="text-sm text-amber-200/90" data-testid="billing-manage-unavailable">
              Billing management is not connected in this environment. This is a staging blocker until the Stripe customer
              portal is configured.
            </p>
          ) : null}

          {returnToSimpleSend ? (
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary"
              data-testid="billing-return-agreement"
              onClick={() => navigate(returnToSimpleSend)}
            >
              Return to your agreement
            </button>
          ) : null}

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
