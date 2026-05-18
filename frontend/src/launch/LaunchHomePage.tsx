import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./clawSeoHome.css";
import "./launch.css";
import { useLaunchNav } from "./LaunchNavContext";
import { DisclosureFooter } from "../compliance/DisclosureFooter";
import { JoySocialFooter } from "../joy/JoySocialFooter";
import { mergeHomeHeroDraftForHandoff, stashHeroIntakePrefill } from "./heroIntakePrefill";
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
import { useAutoResizeTextarea } from "./useAutoResizeTextarea";

export function LaunchHomePage() {
  const { navigate } = useLaunchNav();
  const dc = useDynamicConfig();
  const home = dc.home;
  const [heroInput, setHeroInput] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [homeTransitionActive, setHomeTransitionActive] = useState(false);
  const intakeRef = useRef<HTMLTextAreaElement | null>(null);
  useAutoResizeTextarea(intakeRef, heroInput, { minRows: 4, maxPx: 320 });
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
    prepareFreshMarketingEntry();
    setLawdogEntryContext("new");
    clearCreateComplexityResume();
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
    const typedBefore = heroInput.trim();
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
      prepareFreshMarketingEntry();
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
          <div className="mb-4 flex justify-center sm:justify-start">
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-transparent p-0.5 transition hover:border-slate-200 hover:bg-slate-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600/40"
              onClick={() => navigate("/app")}
              aria-label="LawDog — open app"
            >
              <LawdogBrand variant="wordmark" size="md" surface="light" />
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
            className="claw-seo-card mt-5 w-full p-4 sm:p-5 lg:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (handoffBusy) return;
              void startDrafting();
            }}
          >
            <label htmlFor="claw-hero-intake" className="sr-only">
              Describe your agreement
            </label>
            <div className="relative">
              <textarea
                ref={intakeRef}
                id="claw-hero-intake"
                name="agreement_intake"
                autoComplete="off"
                rows={4}
                value={heroInput}
                onChange={(e) => setHeroInput(e.target.value)}
                placeholder={HOMEPAGE_HERO_PLACEHOLDER || home.heroPlaceholder}
                disabled={handoffBusy || homeTransitionActive}
                className="claw-seo-input min-h-[6.5rem] w-full resize-none overflow-hidden px-4 py-4 pb-12 pr-14 text-base leading-relaxed placeholder:text-base transition-[height] duration-150 ease-out sm:min-h-[7rem] lg:text-lg lg:placeholder:text-lg"
              />
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

            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start" aria-label="Example prompts">
              {HOME_EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex.key}
                  type="button"
                  disabled={handoffBusy}
                  className="min-h-9 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-emerald-500/55 hover:text-emerald-900 disabled:opacity-50"
                  onClick={() => {
                    setHeroInput(ex.text);
                    logHomeExampleSelected(ex.key, ex.text.length);
                    intakeRef.current?.focus();
                  }}
                >
                  {ex.label}
                </button>
              ))}
            </div>

            <p
              className={`mt-3 text-sm leading-relaxed sm:text-base ${confidenceHint ? "font-medium text-emerald-800" : "text-slate-500"}`}
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

            <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={handoffBusy || homeTransitionActive}
                aria-busy={handoffBusy || homeTransitionActive}
                className="claw-seo-btn-primary min-h-12 flex-1 px-6 py-3.5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-[3.25rem] sm:text-lg"
              >
                {primaryLabel}
              </button>
              <button
                type="button"
                className="claw-seo-btn-secondary min-h-12 px-6 py-3 text-base font-medium text-slate-600 sm:min-h-[3.25rem]"
                onClick={scrollToHowItWorks}
              >
                {HOMEPAGE_CTA_VIEW_EXAMPLE}
              </button>
            </div>

            <p className="mt-3 text-center text-xs leading-snug text-slate-500 sm:text-left">
              {NOTHING_SENT_UNTIL_CONFIRM} {NOT_LEGAL_ADVICE}
            </p>
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
          className="mx-auto mt-8 max-w-3xl !border-slate-200/90 !bg-slate-50/90 !shadow-none ring-1 ring-slate-200/70 lg:max-w-4xl"
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

        <footer className="mx-auto mt-12 max-w-3xl border-t border-slate-200 pt-8 lg:max-w-4xl">
          <JoySocialFooter className="mb-5 p-2 text-sm leading-snug text-slate-600" />
          <DisclosureFooter tone="light" className="border-0 text-slate-600 !space-y-2 !pt-3 !text-sm !leading-snug" />
        </footer>
      </div>
    </div>
  );
}
