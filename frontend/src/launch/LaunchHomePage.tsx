import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./clawSeoHome.css";
import "./launch.css";
import { useLaunchNav } from "./LaunchNavContext";
import { DisclosureFooter } from "../compliance/DisclosureFooter";
import { JoySocialFooter } from "../joy/JoySocialFooter";
import {
  mergeHomeHeroDraftForHandoff,
  resolveHomeHeroSubmitText,
  stashHeroIntakePrefill,
} from "./heroIntakePrefill";
import { HeroVoiceInputBar } from "./HeroVoiceInputBar";
import { useHeroMediaDictation } from "./useHeroMediaDictation";
import "../joy/joy.css";
import { recordInboundRefLanding } from "./affiliate/clawOpportunityStore";
import { rememberAffiliateCodeFromSearch } from "./affiliate/affiliateAttributionContext";
import { useDynamicConfig } from "../config/dynamicConfig/useDynamicConfig";
import { LawdogMarketingPixels } from "../compliance/LawdogMarketingPixels";
import { NOT_LEGAL_ADVICE } from "../compliance/disclosureCopy";
import {
  HOMEPAGE_CTA_CREATE_FREE_DRAFT,
  HOMEPAGE_CTA_VIEW_EXAMPLE,
  HOMEPAGE_HERO_MICRO_TRUST,
  HOMEPAGE_HERO_PLACEHOLDER,
  HOMEPAGE_HERO_SUBHEAD,
  HOMEPAGE_HERO_TITLE,
  HOMEPAGE_TRUST_CARDS,
  HOMEPAGE_TRUST_SECTION_TITLE,
  HOMEPAGE_WHAT_HAPPENS_NEXT_BULLETS,
  HOMEPAGE_WHAT_HAPPENS_NEXT_TITLE,
  NOTHING_SENT_UNTIL_CONFIRM,
} from "./pricingContent";
import { LawdogBrand } from "../components/ui/LawdogBrand";
import { PricingGuaranteePanel } from "./LaunchOfferBlocks";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { markLawdogFunnelStep } from "../tracking/lawdogSession";
import { clearPaidDashboardCreateContext } from "./paidDashboardCreateContext";
import { initializeNewAgreementSession } from "./newAgreementSessionReset";
import { bootstrapWorkspaceOrg } from "./orgContext";
import { prepareFreshMarketingEntry } from "./marketingSession";
import {
  getLawdogEntryContextStored,
  setLawdogEntryContext,
  setLawdogFocusCreateIntakeAfterNavigation,
} from "./lawdogEntryContext";
import { clearCreateComplexityResume } from "../components/agreements/agreementCreateComplexityResume";
import { isFirstLawdogSession } from "./lawdogFirstDraftSession";
import { ReEngagementBanner } from "./ReEngagementBanner";
import { peekCreateOrHomeBanner, type CreateOrHomeBanner } from "./reEngagementStore";
import { useInputConfidenceHint } from "./useInputConfidenceHint";
import { HOME_EXAMPLE_PROMPTS, logHomeExampleSelected } from "./homeExamplePrompts";
import { logHomeCreateSubmit, meetsHomeDraftSubmitThreshold } from "./homeCreateSubmit";
import { HomeCreateTransitionOverlay } from "./simpleProduct/HomeCreateTransitionOverlay";
import {
  HOMEPAGE_TEXTAREA_LARGE_LINE_THRESHOLD,
  useAutoResizeTextarea,
  useResponsiveTextareaMaxPx,
} from "./useAutoResizeTextarea";

export function LaunchHomePage() {
  const { navigate } = useLaunchNav();
  const dc = useDynamicConfig();
  const home = dc.home;
  const [heroInput, setHeroInput] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [homeTransitionActive, setHomeTransitionActive] = useState(false);
  const intakeRef = useRef<HTMLTextAreaElement | null>(null);
  const {
    maxPx: heroTextareaMaxPx,
    bottomFadeOverlayEnabled: heroBottomFadeOverlayEnabled,
    viewportWidth: heroViewportWidth,
  } = useResponsiveTextareaMaxPx();
  const {
    sync: syncHeroTextarea,
    onPaste: onHeroTextareaPaste,
    onDrop: onHeroTextareaDrop,
    showBottomFade: heroTextareaShowFade,
    onScroll: onHeroTextareaScroll,
    contentLineCount: heroContentLineCount,
    heightTier: heroTextareaHeightTier,
  } = useAutoResizeTextarea(intakeRef, heroInput, {
    minRows: 3,
    maxPx: heroTextareaMaxPx,
    viewportWidth: heroViewportWidth,
    bottomFadeOverlayEnabled: heroBottomFadeOverlayEnabled,
  });
  const heroLargeAgreementHint =
    heroContentLineCount > HOMEPAGE_TEXTAREA_LARGE_LINE_THRESHOLD;
  const heroDictationEnabled = useMemo(
    () => String(import.meta.env.VITE_CLAW_HERO_DICTATION ?? "1") !== "0",
    [],
  );

  const appendHeroTranscript = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    setHeroInput((prev) => {
      const p = prev.trim();
      return p ? `${p} ${t}` : t;
    });
  }, []);

  const dictation = useHeroMediaDictation({
    enabled: heroDictationEnabled,
    onTranscript: appendHeroTranscript,
  });

  const inputEngaged =
    heroInput.trim().length > 0 ||
    dictation.phase === "recording" ||
    dictation.phase === "processing";
  const confidenceHint = useInputConfidenceHint(inputEngaged && !handoffBusy);
  const [reEngageBanner, setReEngageBanner] = useState<CreateOrHomeBanner | null>(null);
  const firstSessionHome = isFirstLawdogSession();
  const entryStored = getLawdogEntryContextStored();
  const allowNavigateWithoutInput = entryStored === "returning" || entryStored === "drafting";

  const openCleanCreateIntake = useCallback(() => {
    initializeNewAgreementSession();
    prepareFreshMarketingEntry();
    setLawdogEntryContext("new");
    clearCreateComplexityResume();
    clearPaidDashboardCreateContext();
    setLawdogFocusCreateIntakeAfterNavigation();
    logProductEvent("homepage_cta_open_create_fresh", { surface: "seo_home" });
    navigate("/app/create");
  }, [navigate]);

  const scrollToHowItWorks = useCallback(() => {
    document.getElementById("claw-what-next-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    setReEngageBanner(peekCreateOrHomeBanner("home"));
  }, []);

  useEffect(() => {
    markLawdogFunnelStep("homepage");
    prepareFreshMarketingEntry();
    logProductEvent("homepage_loaded", { surface: "seo_home" });
    if (typeof window === "undefined") return;
    const ref = new URLSearchParams(window.location.search).get("ref");
    recordInboundRefLanding(ref);
    rememberAffiliateCodeFromSearch(window.location.search);
  }, []);

  async function startDrafting() {
    if (handoffBusy) return;
    const typedBefore = resolveHomeHeroSubmitText(heroInput, intakeRef.current?.value);
    let merged = typedBefore;
    let voiceFinalize = false;

    if (dictation.phase === "recording" || dictation.phase === "processing") {
      setHandoffBusy(true);
      try {
        const fin = await dictation.finalizeRecordingAndGetTranscript();
        const out = mergeHomeHeroDraftForHandoff(typedBefore, fin);
        merged = out.merged;
        voiceFinalize = out.voiceFinalize;
        setHeroInput(merged);
      } finally {
        setHandoffBusy(false);
      }
    }

    if (voiceFinalize) {
      logProductEvent("mic_used", { surface: "seo_home" });
    }

    if (!meetsHomeDraftSubmitThreshold(merged)) {
      if (allowNavigateWithoutInput) {
        navigate("/app");
        return;
      }
      openCleanCreateIntake();
      return;
    }

    setHomeTransitionActive(true);
    setHandoffBusy(true);
    try {
      await bootstrapWorkspaceOrg();
      initializeNewAgreementSession();
      prepareFreshMarketingEntry();
      clearPaidDashboardCreateContext("home_create_submit");
      clearCreateComplexityResume();
      setLawdogEntryContext("drafting");
      logHomeCreateSubmit(merged);
      stashHeroIntakePrefill(merged, { fromHomeSubmit: true, autoGenerate: true });
      navigate("/app/create", {
        heroIntake: merged,
        heroFromHome: true,
        heroAutoGenerate: true,
        heroVoiceFinalize: voiceFinalize,
      });
    } finally {
      setHandoffBusy(false);
    }
  }

  const primaryLabel = HOMEPAGE_CTA_CREATE_FREE_DRAFT;
  const homepageTrustCards = HOMEPAGE_TRUST_CARDS.slice(0, 2);

  return (
    <div className="claw-seo-root">
      <HomeCreateTransitionOverlay active={homeTransitionActive} />
      <LawdogMarketingPixels surface="homepage" />
      <div className="claw-marketing-page mx-auto w-full max-w-5xl px-4 pb-12 pt-6 sm:px-6 sm:pt-8 md:px-8 lg:pb-20 lg:pt-8">
        {reEngageBanner ? (
          <ReEngagementBanner
            surface="home"
            theme="marketing"
            banner={reEngageBanner}
            onDismiss={() => setReEngageBanner(peekCreateOrHomeBanner("home"))}
            navigate={(path) => navigate(path)}
          />
        ) : null}

        <header id="claw-hero-entry" className="mx-auto max-w-3xl lg:max-w-4xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-transparent p-0.5 transition hover:border-slate-200 hover:bg-slate-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600/40"
              onClick={() => navigate("/app")}
              aria-label="LawDog — open app"
            >
              <LawdogBrand variant="wordmark" size="md" surface="light" />
            </button>
            <button
              type="button"
              className="shrink-0 text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600/50"
              onClick={() => {
                logProductEvent("dashboard_sign_in_initiated", { surface: "homepage" });
                navigate("/app/sign-in");
              }}
            >
              Sign in
            </button>
          </div>

          <h1 className="text-center text-balance text-[2rem] font-bold tracking-tight text-slate-900 sm:text-left sm:text-[2.35rem] lg:text-[2.55rem] lg:leading-[1.08]">
            {HOMEPAGE_HERO_TITLE}
          </h1>
          <p className="mt-2 text-center text-lg font-medium leading-relaxed text-slate-800 sm:text-left sm:text-xl">
            {HOMEPAGE_HERO_SUBHEAD}
          </p>
          <p className="mt-2 text-center text-sm leading-snug text-slate-600 sm:text-left">
            {HOMEPAGE_HERO_MICRO_TRUST}
          </p>

          <form
            className="claw-seo-card mt-4 w-full min-w-0 p-3.5 sm:mt-5 sm:p-5 lg:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (handoffBusy) return;
              void startDrafting();
            }}
          >
            <label htmlFor="claw-hero-intake" className="sr-only">
              Describe your agreement
            </label>
            <div className="claw-seo-hero-intake-wrap relative min-h-0 overflow-x-hidden">
              <textarea
                ref={intakeRef}
                id="claw-hero-intake"
                name="agreement_intake"
                autoComplete="off"
                rows={3}
                value={heroInput}
                onChange={(e) => {
                  setHeroInput(e.target.value);
                  requestAnimationFrame(() => syncHeroTextarea());
                }}
                onPaste={() => onHeroTextareaPaste()}
                onDrop={() => onHeroTextareaDrop()}
                onInput={() => syncHeroTextarea()}
                onScroll={onHeroTextareaScroll}
                onClick={() => requestAnimationFrame(() => syncHeroTextarea())}
                onKeyUp={() => requestAnimationFrame(() => syncHeroTextarea())}
                placeholder={HOMEPAGE_HERO_PLACEHOLDER || home.heroPlaceholder}
                disabled={handoffBusy || homeTransitionActive}
                aria-describedby={
                  heroLargeAgreementHint ? "claw-hero-intake-large-hint" : undefined
                }
                data-height-tier={heroTextareaHeightTier}
                className="claw-seo-input claw-seo-input--hero block w-full max-w-full resize-none px-3.5 py-3 pb-16 pr-16 text-[15px] leading-[1.5] placeholder:text-[15px] sm:px-4 sm:py-3.5 sm:pb-16 sm:pr-16 sm:text-base sm:leading-relaxed sm:placeholder:text-base lg:text-[17px] lg:leading-normal lg:placeholder:text-[17px]"
              />
              {heroTextareaShowFade ? (
                <div
                  className="claw-seo-hero-intake-fade claw-seo-hero-intake-fade--gutter pointer-events-none absolute"
                  data-testid="hero-intake-bottom-fade"
                  aria-hidden
                />
              ) : null}
              <HeroVoiceInputBar
                surface="light"
                enabled={heroDictationEnabled && !handoffBusy}
                isSupported={dictation.isSupported}
                phase={dictation.phase}
                onToggle={dictation.toggleRecording}
                recordingTimerLabel={dictation.recordingTimerLabel}
                maxRecordingLabel={dictation.maxRecordingLabel}
                idleAttract
                micTooltip="Speak your agreement — same as typing"
              />
            </div>

            {heroLargeAgreementHint ? (
              <p
                id="claw-hero-intake-large-hint"
                className="mt-2 text-xs font-medium text-slate-600 sm:text-sm"
              >
                Large agreement detected ✓
              </p>
            ) : null}


            <p
              className={`mt-3 text-sm leading-relaxed sm:text-base ${confidenceHint ? "font-medium text-slate-700" : "text-slate-500"}`}
              aria-live="polite"
            >
              {homeTransitionActive
                ? ""
                : confidenceHint
                  ? confidenceHint
                  : dictation.phase === "recording"
                    ? "Listening… describe your agreement"
                    : dictation.phase === "processing"
                      ? "Transcribing…"
                      : "Paste your deal in plain language — we structure a draft you review first."}
            </p>

            {dictation.banner ? (
              <p className="mt-2 text-sm leading-relaxed text-amber-800" role="status">
                {dictation.banner}{" "}
                <button
                  type="button"
                  onClick={dictation.dismissBanner}
                  className="font-medium text-teal-800 underline-offset-2 hover:underline"
                >
                  Dismiss
                </button>
              </p>
            ) : null}

            <div
              className="claw-seo-hero-cta-grid mt-4 grid w-full min-w-0 grid-cols-1 gap-2.5 sm:mt-5 sm:grid-cols-2 sm:gap-3"
              data-testid="hero-cta-row"
            >
              <button
                type="submit"
                disabled={handoffBusy || homeTransitionActive}
                aria-busy={handoffBusy || homeTransitionActive}
                className="claw-seo-btn-primary claw-seo-hero-cta-primary min-h-12 w-full min-w-0 px-6 py-3.5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-[3.25rem] sm:text-lg"
              >
                {primaryLabel}
              </button>
              <button
                type="button"
                className="claw-seo-btn-secondary claw-seo-btn-secondary--quiet claw-seo-hero-cta-secondary min-h-11 w-full min-w-0 px-5 py-2.5 text-sm font-medium sm:min-h-[3.25rem] sm:px-6 sm:py-3 sm:text-base"
                onClick={scrollToHowItWorks}
              >
                {HOMEPAGE_CTA_VIEW_EXAMPLE}
              </button>
            </div>

            <p className="claw-seo-cta-legal mt-2.5 text-center text-[11px] leading-snug text-slate-500 sm:mt-3 sm:text-left sm:text-xs">
              {NOTHING_SENT_UNTIL_CONFIRM} {NOT_LEGAL_ADVICE}
            </p>

            <div
              className="mt-3 flex flex-wrap justify-center gap-1.5 sm:mt-4 sm:justify-start sm:gap-2"
              aria-label="Example prompts"
            >
              {HOME_EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex.key}
                  type="button"
                  disabled={handoffBusy}
                  className="claw-seo-example-chip min-h-8 rounded-full px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 sm:min-h-9 sm:px-3.5 sm:py-2 sm:text-sm"
                  onClick={() => {
                    setHeroInput(ex.text);
                    logHomeExampleSelected(ex.key, ex.text.length);
                    intakeRef.current?.focus();
                    requestAnimationFrame(() => syncHeroTextarea());
                  }}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </form>

          {!firstSessionHome ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
                onClick={() => navigate("/app")}
              >
                Open workspace
              </button>
              <button
                type="button"
                className="text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
                onClick={() => {
                  prepareFreshMarketingEntry();
                  setLawdogEntryContext("new");
                  navigate("/app/quick");
                }}
              >
                Quick start — upload or describe
              </button>
            </div>
          ) : null}
        </header>

        <PricingGuaranteePanel
          variant="light"
          className="mx-auto mt-6 max-w-3xl !border-slate-200/90 !bg-slate-50/90 !shadow-none ring-1 ring-slate-200/70 sm:mt-8 lg:max-w-4xl"
        />

        <section
          id="claw-what-next"
          className="mx-auto mt-8 max-w-3xl scroll-mt-6 lg:max-w-4xl"
          aria-labelledby="claw-what-next-heading"
        >
          <h2
            id="claw-what-next-heading"
            className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl"
          >
            {HOMEPAGE_WHAT_HAPPENS_NEXT_TITLE}
          </h2>
          <ol className="mt-3 list-none space-y-2 text-base leading-relaxed text-slate-700">
            {HOMEPAGE_WHAT_HAPPENS_NEXT_BULLETS.map((b, i) => (
              <li key={b} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-900">
                  {i + 1}
                </span>
                <span className="pt-0.5">{b}</span>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="mx-auto mt-10 max-w-3xl lg:max-w-4xl"
          aria-labelledby="claw-trust-layer-heading"
        >
          <h2 id="claw-trust-layer-heading" className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            {HOMEPAGE_TRUST_SECTION_TITLE}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {homepageTrustCards.map((card) => (
              <article key={card.title} className="claw-seo-card px-4 py-4 sm:px-5 sm:py-5">
                <h3 className="text-base font-semibold text-slate-900">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-[0.9375rem]">{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="claw-seo-page-footer mx-auto mt-10 max-w-3xl border-t border-slate-200 pt-6 sm:mt-12 sm:pt-8 lg:max-w-4xl">
          <JoySocialFooter className="mb-4 hidden p-2 text-sm leading-snug text-slate-600 sm:block sm:mb-5" />
          <DisclosureFooter
            tone="light"
            slim
            dense
            className="claw-seo-footer-disclosure border-0 text-slate-500 !space-y-2 !pt-0 !text-xs !leading-snug sm:!text-sm"
          />
        </footer>
      </div>
    </div>
  );
}
