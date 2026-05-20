import { type FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDynamicConfig } from "../../config/dynamicConfig/useDynamicConfig";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import { trackAgreementFunnelEvent } from "../../tracking/agreementFunnelAnalytics";
import { CHECKOUT_STARTER_UPGRADE_SUBTITLE, resolveCheckoutFlowProgress } from "./checkoutFlowProgress";
import { CHECKOUT_LEGAL_DISCLAIMER } from "./checkoutTrustCopy";
import { CheckoutTrustPanel } from "./CheckoutTrustPanel";
import { CHECKOUT_CTA, CHECKOUT_FOOTER, CHECKOUT_TITLE } from "./proConversionCopy";
import {
  CHECKOUT_CARD_ACTIVATION_LINE,
  CHECKOUT_CARD_PROCESSING_LINE,
} from "./proTransformationCopy";
import {
  createFiatToCryptoOnrampIntent,
  demoConfirmFiatToCryptoOnrampFromCard,
  type SettlementConfirmation,
} from "../clawCheckoutSettlement";
import { finalizeSettlementAndActivatePlan, finalizeSingleAgreementUnlock } from "../checkoutCompletion";
import {
  appendReturnToQueryParam,
  extractAgreementIdFromSendReturnUrl,
  parseCadenceParam,
  parseTierIdParam,
  resolveCheckoutTier,
  safeReturnToForAgreement,
} from "../checkoutParams";
import {
  buildCreateReturnToWithStarterReviewRestore,
  clearCheckoutBackRestoreSnapshot,
} from "../../components/agreements/checkoutBackRestore";
import { checkoutInvoiceUsd, formatMoneyUsdWhole } from "../pricingKeyMath";
import { CONTEXTUAL_ONE_TIME_UNLOCK_USD } from "../paywallMessaging";
import { checkoutPayloadFromPaywallAttribution, clearPaywallAttribution } from "../paywallAttribution";
import { getPricingCadencePreference, setPricingCadencePreference, type PricingCadence } from "../pricingCadenceStorage";
import type { LaunchPricingTier } from "../pricingTiersData";
import { useLaunchNav } from "../LaunchNavContext";
import {
  CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
  markAdvancedFullDraftCheckoutGranted,
} from "../../components/agreements/agreementAdvancedDraftAccess";
import { AgreementCompletionCheckoutContextPanel } from "../../components/agreements/AgreementCompletionCheckoutContext";
import {
  clearUpgradeCheckoutContext,
  readUpgradeCheckoutContext,
  type UpgradeCheckoutContextV1,
} from "../../components/agreements/upgradeCheckoutContextStorage";
import { markPaidPremiumCompletionSession } from "../../components/agreements/premiumCompletionStorage";
import { trackStarterProRefineCheckoutSuccessFromContext } from "../../components/agreements/starterProRefineCheckoutSuccess";
import { checkoutLossAversionFromIntentSignals } from "../../components/agreements/upgradeContextReasons";
import { CreateFlowAgreementCheckoutPricing } from "./CreateFlowAgreementCheckoutPricing";
import { isDevCreateFlowPaymentBypassEnabled } from "../devPaymentBypass";
import { ensureAffiliateAttributionForOrg, getAffiliateCodeForAttribution } from "../affiliate/affiliateAttributionContext";
import { ensureGenesisReferralHandoffForCheckout } from "../genesisReferral/ensureGenesisReferralHandoff";
import { getOrgId } from "../orgContext";
import { resetCheckoutEntryScroll } from "./checkoutEntryScroll";
import { SimpleFlowShell } from "./SimpleFlowShell";
import { SpaLink } from "../SpaLink";
import {
  CHECKOUT_REFUNDS_AND_CREDITS_TERMS_SHORT,
  DOWNGRADE_ACCESS_SHORT,
  MANAGE_BILLING_FROM_BILLING_SHORT,
  TAX_VAT_LOCATION_NEUTRAL,
  paidSubscriptionRenewalMaterialLine,
} from "../../compliance/disclosureCopy";

function CheckoutPrePaymentDisclosure(props: { planName: string; priceLine: string; cadence: PricingCadence }) {
  const { planName, priceLine, cadence } = props;
  return (
    <div
      className="mt-4 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-3 text-[15px] leading-7 text-slate-300 sm:text-base"
      role="group"
      aria-label="Plan, renewal, cancellation, and legal terms before payment"
    >
      <p className="text-slate-200">
        <span className="font-semibold text-white">{planName}</span>
        {" · "}
        {priceLine}
        {" · "}
        <span className="capitalize">{cadence}</span> billing
      </p>
      <p className="mt-2 text-sm leading-7 text-slate-300">{paidSubscriptionRenewalMaterialLine(cadence)}</p>
      <p className="mt-1 text-sm leading-7 text-slate-300">{MANAGE_BILLING_FROM_BILLING_SHORT}</p>
      <p className="mt-1 text-sm leading-7 text-slate-300">{DOWNGRADE_ACCESS_SHORT}</p>
      <p className="mt-1 text-sm leading-7 text-slate-300">{CHECKOUT_REFUNDS_AND_CREDITS_TERMS_SHORT}</p>
      <p className="mt-3 text-[15px] leading-7 text-slate-200 sm:text-base">
        By completing payment you agree to the{" "}
        <SpaLink
          to="/terms"
          className="inline-flex min-h-9 items-center font-medium text-emerald-400 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Terms of Service
        </SpaLink>{" "}
        and{" "}
        <SpaLink
          to="/privacy"
          className="inline-flex min-h-9 items-center font-medium text-emerald-400 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Privacy Policy
        </SpaLink>
        . For data requests and storage choices, see{" "}
        <SpaLink
          to="/privacy#privacy-contact"
          className="inline-flex min-h-9 items-center font-medium text-emerald-400 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Data &amp; privacy requests
        </SpaLink>{" "}
        and{" "}
        <SpaLink
          to="/privacy#privacy-cookies-choices"
          className="inline-flex min-h-9 items-center font-medium text-emerald-400 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Cookie &amp; storage choices
        </SpaLink>
        . Payment also constitutes agreement to subscription terms presented with your order.
      </p>
      <p className="mt-2 text-sm leading-7 text-slate-400">{TAX_VAT_LOCATION_NEUTRAL}</p>
    </div>
  );
}

function CheckoutSingleUnlockDisclosure(props: { priceLine: string }) {
  const { priceLine } = props;
  return (
    <div
      className="mt-4 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-3 text-[15px] leading-7 text-slate-300 sm:text-base"
      role="group"
      aria-label="One-time purchase terms"
    >
      <p className="text-slate-200">
        <span className="font-semibold text-white">One-time unlock</span>
        {" · "}
        {priceLine}
      </p>
      <p className="mt-2 text-sm leading-7 text-slate-300">
        Single purchase for this agreement — send and export on this flow. Not a subscription; no renewal.
      </p>
      <p className="mt-3 text-[15px] leading-7 text-slate-200 sm:text-base">
        By completing payment you agree to the{" "}
        <SpaLink
          to="/terms"
          className="inline-flex min-h-9 items-center font-medium text-emerald-400 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Terms of Service
        </SpaLink>{" "}
        and{" "}
        <SpaLink
          to="/privacy"
          className="inline-flex min-h-9 items-center font-medium text-emerald-400 underline-offset-2 hover:text-emerald-300 hover:underline"
        >
          Privacy Policy
        </SpaLink>
        .
      </p>
      <p className="mt-2 text-sm leading-7 text-slate-400">{TAX_VAT_LOCATION_NEUTRAL}</p>
    </div>
  );
}

function stripCardDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function SimpleCheckoutPage(props: { agreementId: string }) {
  const { agreementId } = props;
  const { navigate, search } = useLaunchNav();
  const dc = useDynamicConfig();
  const ck = dc.checkout;
  const checkoutLogged = useRef(false);
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const isSingleAgreementCheckout = useMemo(() => params.get("intent") === "single_agreement", [params]);

  const tierFromUrl = parseTierIdParam(params.get("tier"));
  const tier: LaunchPricingTier = useMemo(() => resolveCheckoutTier(tierFromUrl), [tierFromUrl]);
  const cadenceFromUrl = parseCadenceParam(params.get("cadence"));
  const [cadence, setCadence] = useState<PricingCadence>(() => cadenceFromUrl ?? getPricingCadencePreference());

  const returnTo = useMemo(
    () => safeReturnToForAgreement(agreementId, params.get("returnTo")),
    [agreementId, params],
  );

  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const finishedRef = useRef(false);
  const inFlightRef = useRef(false);

  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvc, setCardCvc] = useState("");

  /** One-time arrival motion per checkout mount (see useLayoutEffect below). */
  const [checkoutArrivalOn, setCheckoutArrivalOn] = useState(false);

  const amountUsd = useMemo(() => {
    if (isSingleAgreementCheckout) return CONTEXTUAL_ONE_TIME_UNLOCK_USD;
    return checkoutInvoiceUsd(tier, cadence);
  }, [isSingleAgreementCheckout, tier, cadence]);

  useEffect(() => {
    if (cadenceFromUrl) {
      setCadence(cadenceFromUrl);
      setPricingCadencePreference(cadenceFromUrl);
    }
  }, [cadenceFromUrl]);

  /** Create-flow checkout: anchor annual when URL omits cadence (conversion path). */
  useEffect(() => {
    if (agreementId !== CREATE_FLOW_CHECKOUT_AGREEMENT_ID || isSingleAgreementCheckout) return;
    if (cadenceFromUrl) return;
    setCadence("annual");
    setPricingCadencePreference("annual");
  }, [agreementId, isSingleAgreementCheckout, cadenceFromUrl]);

  useEffect(() => {
    if (checkoutLogged.current) return;
    checkoutLogged.current = true;
    const attr = checkoutPayloadFromPaywallAttribution(agreementId);
    logProductEvent("checkout_started", {
      agreementId,
      ...(isSingleAgreementCheckout ? { intent: "single_agreement" as const } : {}),
      ...attr,
    });
  }, [agreementId, isSingleAgreementCheckout]);

  useLayoutEffect(() => {
    resetCheckoutEntryScroll();
    const reduce =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setCheckoutArrivalOn(true);
      return;
    }
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setCheckoutArrivalOn(true));
    });
    return () => window.cancelAnimationFrame(id);
  }, [agreementId, search]);

  function fail(message: string): void {
    setPaymentError(message);
    setProcessing(false);
    inFlightRef.current = false;
  }

  const applyConfirmedSettlement = useCallback(
    async (conf: SettlementConfirmation) => {
      if (!conf.ok) {
        fail(conf.error);
        return;
      }
      if (finishedRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      setProcessing(true);
      setPaymentError(null);
      await new Promise((r) => window.setTimeout(r, 250));
      const attr = checkoutPayloadFromPaywallAttribution(agreementId);
      const revenueUsd = amountUsd ?? 0;
      if (isSingleAgreementCheckout) {
        finalizeSingleAgreementUnlock(conf.receipt);
        logProductEvent("checkout_completed", { agreementId, intent: "single_agreement", ...attr });
        logProductEvent("unlock_completed", { agreementId, intent: "single_agreement", ...attr });
        logProductEvent("conversion_completed", { agreementId, type: "single_agreement_unlock", ...attr });
      } else {
        finalizeSettlementAndActivatePlan(conf.receipt);
        logProductEvent("checkout_completed", { agreementId, ...attr });
        logProductEvent("conversion_completed", { agreementId, type: "paid_checkout", ...attr });
      }
      if (attr.paywall_view_id && revenueUsd > 0) {
        logProductEvent("paywall_revenue_attributed", {
          agreementId,
          ...attr,
          revenue_usd: revenueUsd,
          revenue_per_paywall_view_usd: revenueUsd,
          checkout_kind: isSingleAgreementCheckout ? "single_agreement" : "subscription",
        });
      }
      clearPaywallAttribution();
      finishedRef.current = true;
      trackAgreementFunnelEvent(
        "checkout_success_returned",
        { checkout_kind: isSingleAgreementCheckout ? "single_agreement" : "subscription" },
        { planTier: String(tier.id), agreementId },
      );
      if (agreementId === CREATE_FLOW_CHECKOUT_AGREEMENT_ID) {
        const upgradeCtx = readUpgradeCheckoutContext();
        trackStarterProRefineCheckoutSuccessFromContext(upgradeCtx, String(tier.id));
        markAdvancedFullDraftCheckoutGranted();
        clearUpgradeCheckoutContext();
        clearCheckoutBackRestoreSnapshot();
        markPaidPremiumCompletionSession();
      }
      const destination =
        agreementId === CREATE_FLOW_CHECKOUT_AGREEMENT_ID
          ? appendReturnToQueryParam(returnTo, "premiumCompletion", "1")
          : returnTo;
      navigate(destination);
      inFlightRef.current = false;
      setProcessing(false);
    },
    [navigate, returnTo, agreementId, isSingleAgreementCheckout, amountUsd, tier],
  );

  async function onCardPay(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (finishedRef.current || processing || amountUsd == null) return;
    const affiliateCode = getAffiliateCodeForAttribution();
    if (affiliateCode) {
      const attributed = await ensureAffiliateAttributionForOrg(getOrgId());
      if (!attributed.ok) {
        fail("We could not link this referral before payment. Reopen from the affiliate link and try again.");
        return;
      }
    }
    const genesisHandoff = await ensureGenesisReferralHandoffForCheckout();
    if (!genesisHandoff.ok) {
      fail("This referral link cannot be used for your own account.");
      return;
    }
    if (import.meta.env.DEV && genesisHandoff.metadata.referral_code) {
      console.info("[genesis-referral] checkout metadata", genesisHandoff.metadata);
    }
    if (devPaymentBypassActive) {
      console.info("[DEV PAYMENT BYPASS] simulating successful payment — reusing demo settlement + applyConfirmedSettlement");
      const intent = createFiatToCryptoOnrampIntent({
        agreementId,
        tierId: tier.id,
        cadence,
        amountUsd,
      });
      const conf = await demoConfirmFiatToCryptoOnrampFromCard({
        intent,
        cardNumberDigits: "4242424242424242",
      });
      await applyConfirmedSettlement(conf);
      return;
    }
    const digits = stripCardDigits(cardNumber);
    if (!cardName.trim() || digits.length < 15 || !cardExp.trim() || cardCvc.trim().length < 3) {
      fail("Please complete all card fields.");
      return;
    }
    const intent = createFiatToCryptoOnrampIntent({
      agreementId,
      tierId: tier.id,
      cadence,
      amountUsd,
    });
    const conf = await demoConfirmFiatToCryptoOnrampFromCard({ intent, cardNumberDigits: digits });
    await applyConfirmedSettlement(conf);
  }

  const priceLine =
    amountUsd == null
      ? "Custom"
      : isSingleAgreementCheckout
        ? `${formatMoneyUsdWhole(amountUsd)} one-time`
        : cadence === "annual"
          ? `${formatMoneyUsdWhole(amountUsd)} / year`
          : `${formatMoneyUsdWhole(amountUsd)} / month`;

  const tierMismatchNote =
    tierFromUrl === "enterprise" ? (
      <p className="text-sm leading-7 text-slate-400">
        Enterprise is sales-assisted — showing LawDog Pro for self-serve checkout.
      </p>
    ) : null;

  const returnParsed = extractAgreementIdFromSendReturnUrl(returnTo);

  const isCreateAgreementCheckout = agreementId === CREATE_FLOW_CHECKOUT_AGREEMENT_ID && !isSingleAgreementCheckout;
  const devPaymentBypassActive = isCreateAgreementCheckout && isDevCreateFlowPaymentBypassEnabled();
  const [upgradeCheckoutSnap, setUpgradeCheckoutSnap] = useState<UpgradeCheckoutContextV1 | null>(() =>
    agreementId === CREATE_FLOW_CHECKOUT_AGREEMENT_ID ? readUpgradeCheckoutContext() : null,
  );

  useEffect(() => {
    if (!devPaymentBypassActive) return;
    console.info(
      "[DEV PAYMENT BYPASS] active — primary checkout CTA uses demo settlement + applyConfirmedSettlement → premiumCompletion=1 (Vite dev only; set VITE_ENABLE_DEV_PAYMENT_BYPASS=0 to require card fields)",
    );
  }, [devPaymentBypassActive]);

  useEffect(() => {
    if (!isCreateAgreementCheckout) {
      setUpgradeCheckoutSnap(null);
      return;
    }
    setUpgradeCheckoutSnap(readUpgradeCheckoutContext());
  }, [isCreateAgreementCheckout, agreementId]);

  const createCheckoutLossLine = useMemo(
    () =>
      isCreateAgreementCheckout
        ? checkoutLossAversionFromIntentSignals(upgradeCheckoutSnap?.intentSignals)
        : "",
    [isCreateAgreementCheckout, upgradeCheckoutSnap],
  );

  const checkoutFlowProgress = useMemo(
    () =>
      resolveCheckoutFlowProgress({
        agreementId,
        isSingleAgreementCheckout,
        returnTo,
      }),
    [agreementId, isSingleAgreementCheckout, returnTo],
  );

  const disclosureForCheckout =
    isSingleAgreementCheckout && amountUsd != null ? (
      <CheckoutSingleUnlockDisclosure priceLine={priceLine} />
    ) : (
      <CheckoutPrePaymentDisclosure planName={tier.name} priceLine={priceLine} cadence={cadence} />
    );

  const wrappedDisclosure =
    isCreateAgreementCheckout && !isSingleAgreementCheckout ? (
      <details className="rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-slate-400">Billing details</summary>
        <div className="mt-2 max-h-[min(50vh,22rem)] overflow-y-auto text-sm leading-snug text-slate-300 [&_p]:text-sm [&_p]:leading-relaxed">
          {disclosureForCheckout}
        </div>
      </details>
    ) : (
      disclosureForCheckout
    );

  const checkoutArrivalShellClass = [
    "w-full min-w-0 motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:ease-out",
    checkoutArrivalOn
      ? "opacity-100 translate-y-0"
      : "translate-y-1 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100",
  ].join(" ");

  return (
    <div className={checkoutArrivalShellClass}>
      <SimpleFlowShell
        step={checkoutFlowProgress.step}
        progressLabels={checkoutFlowProgress.labels}
        title={
          isSingleAgreementCheckout
            ? "Unlock this agreement"
            : isCreateAgreementCheckout
              ? CHECKOUT_TITLE
              : "Activate your plan"
        }
        subtitle={
          isSingleAgreementCheckout
            ? "One-time purchase — then return to send or export this agreement."
            : isCreateAgreementCheckout
              ? CHECKOUT_STARTER_UPGRADE_SUBTITLE
              : checkoutFlowProgress.variant === "direct_send"
                ? "Continue with Pro for this agreement — review recipients before anything goes out."
                : ck.pageSubtitle
        }
        titleClassName={
          isCreateAgreementCheckout
            ? "!text-3xl sm:!text-4xl !font-semibold !tracking-tight !leading-tight"
            : undefined
        }
        subtitleClassName={
          isCreateAgreementCheckout
            ? "max-w-[56ch] !text-[15px] sm:!text-base !leading-7 !text-slate-300"
            : undefined
        }
      >
        <div
          className={
            isCreateAgreementCheckout
              ? "mx-auto w-full min-w-0 max-w-[1240px] space-y-8 overflow-x-hidden px-1 sm:px-0"
              : "mx-auto min-w-0 max-w-lg space-y-8 overflow-x-hidden"
          }
        >
        {paymentError ? (
          <div className="rounded-lg border border-amber-800/45 bg-amber-950/25 px-4 py-3 text-sm text-amber-100" role="alert">
            {paymentError}
          </div>
        ) : null}

        <div
          className={
            isCreateAgreementCheckout
              ? "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(400px,480px)] lg:items-stretch lg:gap-7"
              : undefined
          }
        >
          {isCreateAgreementCheckout ? (
            <AgreementCompletionCheckoutContextPanel
              reasons={upgradeCheckoutSnap?.reasons}
              completionLabel={upgradeCheckoutSnap?.completionLabel}
              className="min-w-0 order-2 lg:order-1"
              compact
            />
          ) : null}
          <div className={isCreateAgreementCheckout ? "min-w-0 order-1 lg:order-2" : "min-w-0 space-y-8"}>
        {isCreateAgreementCheckout ? (
          <section
            className="rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900/92 via-slate-950/96 to-slate-950 p-5 shadow-xl shadow-black/35 ring-1 ring-white/[0.04] sm:p-6 lg:p-8"
            aria-label="Choose plan, enter payment, and confirm"
          >
            <div className="pb-6 sm:pb-7" aria-labelledby="create-flow-pricing">
              <CreateFlowAgreementCheckoutPricing
                tier={tier}
                cadence={cadence}
                planFootnote={createCheckoutLossLine}
                onCadenceChange={(c) => {
                  setCadence(c);
                  setPricingCadencePreference(c);
                }}
              />
            </div>

            <div
              className="border-t border-slate-800/80 pt-6 sm:pt-8"
              aria-labelledby="checkout-payment-heading"
            >
              <p id="checkout-payment-heading" className="text-sm font-medium text-slate-300">
                Payment
              </p>
              <p className="mt-2 text-sm leading-snug text-slate-300">
                <span className="font-medium text-slate-100">{tier.name}</span>
                <span className="text-slate-600"> · </span>
                <span className="capitalize">{cadence}</span>
                <span className="text-slate-600"> · </span>
                <span className="text-slate-200">{priceLine}</span>
              </p>

              <div className="mt-5 min-w-0 rounded-xl border border-slate-800/70 bg-slate-950/35 p-4 sm:p-5">
                <CheckoutTrustPanel surface="create_flow_checkout" />
                <div className="mt-3 border-t border-slate-800/60 pt-3 sm:mt-4 sm:pt-4">
                  <p className="text-sm font-medium text-slate-200">Pay with card</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{ck.trustLines.cardProcessing}</p>
                </div>
                {wrappedDisclosure}
                <form className="space-y-3 pt-1" onSubmit={(e) => void onCardPay(e)}>
              <div>
                <label htmlFor="cc-name" className="text-sm font-medium text-slate-300">
                  Name on card
                </label>
                <input
                  id="cc-name"
                  autoComplete="cc-name"
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-[15px] text-slate-100 outline-none placeholder:text-slate-400 focus:border-emerald-500/50 sm:text-base"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="cc-num" className="text-sm font-medium text-slate-300">
                  Card number
                </label>
                <input
                  id="cc-num"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  placeholder="4242 4242 4242 4242"
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-[15px] text-slate-100 outline-none placeholder:text-slate-400 focus:border-emerald-500/50 sm:text-base"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                />
                <p className="mt-1 text-sm leading-snug text-slate-400">
                  {CHECKOUT_CARD_PROCESSING_LINE} {CHECKOUT_CARD_ACTIVATION_LINE}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cc-exp" className="text-sm font-medium text-slate-300">
                    Expires
                  </label>
                  <input
                    id="cc-exp"
                    autoComplete="cc-exp"
                    placeholder="MM / YY"
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-[15px] text-slate-100 outline-none placeholder:text-slate-400 focus:border-emerald-500/50 sm:text-base"
                    value={cardExp}
                    onChange={(e) => setCardExp(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="cc-cvc" className="text-sm font-medium text-slate-300">
                    CVC
                  </label>
                  <input
                    id="cc-cvc"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-[15px] text-slate-100 outline-none placeholder:text-slate-400 focus:border-emerald-500/50 sm:text-base"
                    value={cardCvc}
                    onChange={(e) => setCardCvc(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={processing || finishedRef.current}
                className="vs01-btn vs01-btn--primary mt-6 min-h-[3rem] w-full cursor-pointer px-6 py-3.5 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[3.25rem]"
              >
                {processing ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span
                      className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-white/25 border-t-white motion-safe:animate-spin"
                      aria-hidden
                    />
                    <span>Processing payment…</span>
                  </span>
                ) : isCreateAgreementCheckout ? (
                  CHECKOUT_CTA
                ) : (
                  "Pay & continue"
                )}
              </button>
            </form>
              </div>
              {devPaymentBypassActive ? (
                <p
                  className="mt-3 rounded-md border border-amber-600/50 bg-amber-950/40 px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-amber-200/95 sm:text-left sm:text-xs"
                  role="note"
                >
                  DEV: one-click payment success into premium return flow (no real Stripe). Set
                  VITE_ENABLE_DEV_PAYMENT_BYPASS=0 to require demo card fields.
                </p>
              ) : null}
            </div>
          </section>
        ) : (
          <>
            <section
              className="rounded-xl border border-slate-800/70 bg-slate-950/[0.35] px-5 py-5"
              aria-labelledby="plan-sum"
            >
              <h2 id="plan-sum" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                {isSingleAgreementCheckout ? "Order summary" : "Plan summary"}
              </h2>
              {isSingleAgreementCheckout ? null : tierMismatchNote}
              <p className="mt-3 text-lg font-semibold text-white">
                {isSingleAgreementCheckout ? "This agreement only" : tier.name}
              </p>
              {isSingleAgreementCheckout ? null : (
                <p className="mt-1 text-sm capitalize text-slate-400">{cadence} billing</p>
              )}
              <p className="mt-3 text-2xl font-semibold text-white">{priceLine}</p>
              {isSingleAgreementCheckout ? (
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  Covers send and export for this agreement on this device session after payment confirms. Subscriptions stay
                  on the pricing page — this path is only for this draft.
                </p>
              ) : (
                <>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">
                    You are purchasing the plan, price, and billing interval shown above.{" "}
                    {paidSubscriptionRenewalMaterialLine(cadence)}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    {MANAGE_BILLING_FROM_BILLING_SHORT} {DOWNGRADE_ACCESS_SHORT}
                  </p>
                </>
              )}
            </section>

            <section
              className="rounded-xl border border-slate-800/70 bg-slate-950/[0.35] px-5 py-5"
              aria-label="Payment method"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">
                Payment method
              </p>

              <div className="mt-5 space-y-4">
                <CheckoutTrustPanel surface="checkout" />
                <div>
                  <p className="text-sm font-medium text-slate-200">Pay with card</p>
                  <p className="text-sm leading-7 text-slate-300">{ck.trustLines.cardProcessing}</p>
                </div>
                {wrappedDisclosure}
                <form className="space-y-3" onSubmit={(e) => void onCardPay(e)}>
                  <div>
                    <label htmlFor="cc-name" className="text-sm font-medium text-slate-300">
                      Name on card
                    </label>
                    <input
                      id="cc-name"
                      autoComplete="cc-name"
                      className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-[15px] text-slate-100 outline-none placeholder:text-slate-400 focus:border-emerald-500/50 sm:text-base"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="cc-num" className="text-sm font-medium text-slate-300">
                      Card number
                    </label>
                    <input
                      id="cc-num"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder="4242 4242 4242 4242"
                      className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-[15px] text-slate-100 outline-none placeholder:text-slate-400 focus:border-emerald-500/50 sm:text-base"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                    />
                    <p className="mt-1 text-sm leading-snug text-slate-400">
                      {CHECKOUT_CARD_PROCESSING_LINE} {CHECKOUT_CARD_ACTIVATION_LINE}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="cc-exp" className="text-sm font-medium text-slate-300">
                        Expires
                      </label>
                      <input
                        id="cc-exp"
                        autoComplete="cc-exp"
                        placeholder="MM / YY"
                        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-[15px] text-slate-100 outline-none placeholder:text-slate-400 focus:border-emerald-500/50 sm:text-base"
                        value={cardExp}
                        onChange={(e) => setCardExp(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="cc-cvc" className="text-sm font-medium text-slate-300">
                        CVC
                      </label>
                      <input
                        id="cc-cvc"
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-[15px] text-slate-100 outline-none placeholder:text-slate-400 focus:border-emerald-500/50 sm:text-base"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={processing || finishedRef.current}
                    className="vs01-btn vs01-btn--primary mt-2 min-h-[2.75rem] w-full cursor-pointer px-6 py-3.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {processing ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <span
                          className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-white/25 border-t-white motion-safe:animate-spin"
                          aria-hidden
                        />
                        <span>Processing payment…</span>
                      </span>
                    ) : (
                      ck.trustLines.ctaPrimary
                    )}
                  </button>
                </form>
              </div>
            </section>
          </>
        )}
          </div>
        </div>

        <div
          className={
            isCreateAgreementCheckout
              ? "space-y-1 text-center text-sm leading-7 text-slate-400 sm:text-left"
              : "space-y-2 text-center text-sm leading-7 text-slate-300 sm:text-left sm:text-[15px]"
          }
        >
          <p className={isCreateAgreementCheckout ? "text-sm" : undefined}>
            {isSingleAgreementCheckout
              ? "Payment via card processor · Unlock applies after payment is confirmed · Nothing is sent until you confirm · You control all actions"
              : isCreateAgreementCheckout
                ? CHECKOUT_FOOTER
                : "Payment via card processor · Plans activate after payment is confirmed · Nothing is sent until you confirm · You control all actions"}
          </p>
          {isCreateAgreementCheckout ? (
            <p className="text-xs leading-relaxed text-slate-500">{CHECKOUT_LEGAL_DISCLAIMER}</p>
          ) : null}
          {!isCreateAgreementCheckout ? <p className="text-sm text-slate-400">{ck.trustLines.footnote}</p> : null}
          {returnParsed ? (
            <p>
              After activation you&apos;ll return to send for agreement{" "}
              <code className="rounded bg-slate-900 px-1 text-slate-300">{returnParsed}</code>
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className="text-sm font-medium text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
          onClick={() => {
            if (isCreateAgreementCheckout) {
              navigate(buildCreateReturnToWithStarterReviewRestore());
              return;
            }
            if (returnTo.startsWith("/app/create")) {
              navigate(appendReturnToQueryParam(returnTo, "restore", "starterReview"));
              return;
            }
            window.history.back();
          }}
        >
          Back
        </button>
      </div>
    </SimpleFlowShell>
    </div>
  );
}
