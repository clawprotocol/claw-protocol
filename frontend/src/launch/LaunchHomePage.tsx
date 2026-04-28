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
  FIRST_SESSION_CREATE_INTAKE_PLACEHOLDER,
  HOMEPAGE_PRODUCT_TRUST_MICRO,
  HOMEPAGE_WHAT_HAPPENS_NEXT_BULLETS,
  HOMEPAGE_WHAT_HAPPENS_NEXT_TITLE,
  NOTHING_SENT_UNTIL_CONFIRM,
} from "./pricingContent";
import { SampleArtifactsPreview } from "./SampleArtifactsPreview";
import { LawdogBrand } from "../components/ui/LawdogBrand";
import { LawdogValueBulletsList, PricingGuaranteePanel } from "./LaunchOfferBlocks";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { markLawdogFunnelStep } from "../tracking/lawdogSession";
import { prepareFreshMarketingEntry } from "./marketingSession";
import {
  getLawdogEntryContextStored,
  getLawdogHomepagePrimaryCtaLabel,
  setLawdogEntryContext,
  setLawdogFocusCreateIntakeAfterNavigation,
} from "./lawdogEntryContext";
import { clearCreateComplexityResume } from "../components/agreements/agreementCreateComplexityResume";
import { isFirstLawdogSession } from "./lawdogFirstDraftSession";
import { ReEngagementBanner } from "./ReEngagementBanner";
import { peekCreateOrHomeBanner, type CreateOrHomeBanner } from "./reEngagementStore";
import { EXAMPLE_INTAKE_PROMPTS, useInputConfidenceHint } from "./useInputConfidenceHint";

export function LaunchHomePage() {
  const { navigate } = useLaunchNav();
  const dc = useDynamicConfig();
  const home = dc.home;
  const [heroInput, setHeroInput] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);
  const intakeRef = useRef<HTMLTextAreaElement | null>(null);
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
  const heroPrimaryBusy = handoffBusy;
  const primaryHeroLabel = handoffBusy
    ? "Creating your agreement…"
    : inputEngaged
      ? "Create draft"
      : allowNavigateWithoutInput
        ? getLawdogHomepagePrimaryCtaLabel()
        : "Start your agreement";

  /** Passive entry to `/app/create` — no hero `fromHome` handoff flags (avoids complexity / upgrade-on-mount). */
  const openCleanCreateIntake = useCallback(() => {
    prepareFreshMarketingEntry();
    setLawdogEntryContext("new");
    clearCreateComplexityResume();
    setLawdogFocusCreateIntakeAfterNavigation();
    logProductEvent("homepage_cta_open_create_fresh", { surface: "seo_home" });
    navigate("/app/create");
  }, [navigate]);

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

    prepareFreshMarketingEntry();
    clearCreateComplexityResume();
    setLawdogEntryContext(merged.trim() ? "drafting" : "new");
    stashHeroIntakePrefill(merged, { fromHomeSubmit: true });
    navigate("/app/create", {
      heroIntake: merged,
      heroFromHome: true,
      heroVoiceFinalize: voiceFinalize,
    });
  }

  return (
    <div className="claw-seo-root">
      <LawdogMarketingPixels surface="homepage" />
      <div className="claw-marketing-page mx-auto w-full max-w-6xl px-4 pb-14 pt-8 sm:px-6 sm:pt-10 md:px-8 lg:px-10 lg:pb-24 lg:pt-10 xl:max-w-7xl xl:px-12">
        {reEngageBanner ? (
          <ReEngagementBanner
            surface="home"
            theme="marketing"
            banner={reEngageBanner}
            onDismiss={() => setReEngageBanner(peekCreateOrHomeBanner("home"))}
            navigate={(path) => navigate(path)}
          />
        ) : null}
        <header id="claw-hero-entry">
          <div className="mb-3 flex justify-center sm:justify-start">
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-transparent p-0.5 transition hover:border-slate-200 hover:bg-slate-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600/40"
              onClick={() => navigate("/app")}
              aria-label="LawDog — open app"
            >
              <LawdogBrand variant="wordmark" size="md" surface="light" />
            </button>
          </div>
          <h1 className="mx-auto mb-3 max-w-3xl text-center text-balance text-[1.95rem] font-bold tracking-tight text-slate-900 sm:mb-2.5 sm:text-[2.35rem] lg:mb-3 lg:max-w-5xl lg:text-[2.55rem] lg:leading-[1.08]">
            {home.heroTitle}
          </h1>
          <p className="mx-auto max-w-3xl text-center text-xl font-medium leading-relaxed text-slate-900 sm:text-[1.45rem] lg:max-w-5xl lg:text-[1.5rem]">
            {home.heroSupportLine}
          </p>
          <p className="mx-auto mt-2 max-w-3xl text-center text-sm leading-snug text-slate-600 sm:text-[0.95rem] lg:max-w-5xl">
            {home.heroMicroTrust}
          </p>

          <LawdogValueBulletsList
            variant="light"
            className="mx-auto mt-4 max-w-3xl space-y-2.5 text-center sm:text-left lg:max-w-5xl"
            itemClassName="justify-center sm:justify-start sm:!text-[1.125rem] lg:!text-[1.15rem]"
          />

          <div className="mx-auto mt-4 w-full max-w-lg lg:max-w-2xl">
            <button
              type="button"
              disabled={heroPrimaryBusy}
              className="claw-seo-btn-primary min-h-12 w-full px-8 py-4 text-[1.08rem] shadow-lg ring-2 ring-teal-900/10 disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-[3.25rem] sm:text-[1.1rem]"
              onClick={() => {
                void (async () => {
                  prepareFreshMarketingEntry();
                  const engaged =
                    heroInput.trim().length > 0 ||
                    dictation.phase === "recording" ||
                    dictation.phase === "processing";
                  if (engaged) {
                    await startDrafting();
                    return;
                  }
                  if (allowNavigateWithoutInput) {
                    navigate("/app");
                    return;
                  }
                  openCleanCreateIntake();
                })();
              }}
            >
              {primaryHeroLabel}
            </button>
            {firstSessionHome ? (
              <p className="mt-2 text-center text-sm font-medium leading-snug text-slate-600 sm:text-[0.95rem]">
                Takes ~30 seconds. No setup needed. {NOTHING_SENT_UNTIL_CONFIRM}
              </p>
            ) : (
              <p className="mt-2 text-center text-sm leading-snug text-slate-600 sm:text-[0.95rem]">
                {NOTHING_SENT_UNTIL_CONFIRM}
              </p>
            )}
            {!firstSessionHome ? (
              <button
                type="button"
                className="claw-seo-btn-secondary mt-2 min-h-12 w-full px-8 py-3.5 text-[1.02rem] !border !border-slate-200/90 !bg-white !font-normal !text-slate-500 !shadow-none hover:!bg-slate-50 sm:min-h-[3.25rem] sm:text-[1.05rem]"
                onClick={() => {
                  prepareFreshMarketingEntry();
                  setLawdogEntryContext("new");
                  navigate("/app/quick");
                }}
              >
                Quick start — upload or describe
              </button>
            ) : null}
            {!firstSessionHome ? (
              <p className="mt-2.5 text-center text-[1rem] font-medium leading-snug text-slate-600 sm:text-[1.02rem]">
                Plain language · Export anytime · Your records stay yours
              </p>
            ) : null}
            <p className="mt-1 text-center text-[0.95rem] leading-snug text-slate-500 sm:text-[0.98rem]">
              {NOT_LEGAL_ADVICE} For informational and documentation purposes only.
            </p>
          </div>

          <PricingGuaranteePanel
            variant="light"
            className="mx-auto mt-6 max-w-4xl !border-slate-200/90 !bg-slate-50/90 !shadow-none ring-1 ring-slate-200/70 lg:max-w-5xl [&>h2]:!text-[1.35rem] sm:[&>h2]:!text-[1.5rem] lg:[&>h2]:!text-[1.65rem] [&>p]:!text-[1.0625rem] sm:[&>p]:!text-[1.125rem] [&>p:last-of-type]:!text-[0.875rem] sm:[&>p:last-of-type]:!text-[0.9rem]"
          />

          <section className="mx-auto mt-8 w-full max-w-5xl xl:max-w-6xl" aria-labelledby="claw-what-next-heading">
            <h2
              id="claw-what-next-heading"
              className="text-center text-xl font-semibold tracking-tight text-slate-900 sm:text-left sm:text-2xl lg:text-[1.5625rem]"
            >
              {HOMEPAGE_WHAT_HAPPENS_NEXT_TITLE}
            </h2>
            <ul className="mt-3 list-none space-y-2.5 text-base leading-relaxed text-slate-700 sm:text-left lg:text-[1.0625rem] lg:leading-relaxed">
              {HOMEPAGE_WHAT_HAPPENS_NEXT_BULLETS.map((b) => (
                <li key={b} className="flex gap-2.5">
                  <span className="text-emerald-700" aria-hidden>
                    ·
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-center text-[0.875rem] leading-snug text-slate-600 sm:text-left lg:text-[0.9rem]">
              {HOMEPAGE_PRODUCT_TRUST_MICRO.join(" · ")}
            </p>
            <div className="mt-4">
              <SampleArtifactsPreview variant="marketing" comfortableMarketing />
            </div>
          </section>

          <form
            className="claw-seo-card mx-auto mt-8 w-full max-w-5xl p-5 sm:mt-6 sm:p-6 xl:max-w-6xl lg:p-7"
            onSubmit={(e) => {
              e.preventDefault();
              if (handoffBusy) return;
              const engaged =
                heroInput.trim().length > 0 ||
                dictation.phase === "recording" ||
                dictation.phase === "processing";
              if (!engaged && !allowNavigateWithoutInput) {
                openCleanCreateIntake();
                return;
              }
              void startDrafting();
            }}
          >
            <p className="text-center text-lg font-semibold leading-snug text-slate-900 sm:text-left sm:text-xl lg:text-[1.35rem]">
              Create your draft
            </p>
            <p className="mt-2 text-center text-base font-medium leading-relaxed text-slate-600 sm:text-left sm:text-lg lg:text-[1.0625rem]">
              Type or tap the mic — we structure it into a draft you review before anything is sent.
            </p>

            <label
              htmlFor="claw-hero-intake"
              className="mt-4 block text-center text-[1.08rem] font-medium text-slate-700 sm:text-left lg:text-[1.125rem]"
            >
              Your agreement — start here
            </label>
            <div className="relative mt-3">
              <textarea
                ref={intakeRef}
                id="claw-hero-intake"
                name="agreement_intake"
                autoComplete="off"
                rows={5}
                value={heroInput}
                onChange={(e) => setHeroInput(e.target.value)}
                placeholder={
                  firstSessionHome && !heroInput.trim()
                    ? FIRST_SESSION_CREATE_INTAKE_PLACEHOLDER
                    : home.heroPlaceholder
                }
                className="claw-seo-input min-h-[10rem] w-full resize-y px-4 py-4 pb-12 pr-14 text-[1.08rem] leading-relaxed placeholder:text-[1.08rem] sm:min-h-[11rem] sm:px-5 sm:py-4 sm:pb-12 sm:pr-14 lg:text-[1.125rem] lg:placeholder:text-[1.125rem]"
              />
              <HeroVoiceInputBar
                surface="light"
                enabled={heroDictationEnabled}
                isSupported={dictation.isSupported}
                phase={dictation.phase}
                onToggle={dictation.toggleRecording}
                recordingTimerLabel={dictation.recordingTimerLabel}
                maxRecordingLabel={dictation.maxRecordingLabel}
                idleAttract
                micTooltip="Speak your agreement — same as typing"
              />
            </div>
            <p className="mt-4 text-center text-base leading-relaxed text-slate-600 sm:text-left lg:text-[1.0625rem]">
              {NOTHING_SENT_UNTIL_CONFIRM} Tap generate when you&apos;re ready — we&apos;ll open your draft for review.
            </p>
            <div
              className="mt-5 flex flex-wrap justify-center gap-2.5 sm:justify-start"
              aria-label="Example prompts"
            >
              {EXAMPLE_INTAKE_PROMPTS.map((text) => (
                <button
                  key={text}
                  type="button"
                  className="min-h-10 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-left text-[0.98rem] font-medium leading-snug text-slate-700 shadow-sm transition-colors hover:border-emerald-500/55 hover:text-emerald-900 sm:min-h-11 lg:px-5 lg:py-3 lg:text-[1.02rem]"
                  onClick={() => {
                    setHeroInput(text);
                    intakeRef.current?.focus();
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
            <p
              className={`mt-5 text-center text-base leading-relaxed sm:text-left lg:text-[1.0625rem] ${confidenceHint ? "font-medium text-emerald-800" : "text-slate-500"}`}
              aria-live="polite"
            >
              {confidenceHint
                ? confidenceHint
                : dictation.phase === "recording"
                  ? "Listening… describe your agreement"
                  : dictation.phase === "processing"
                    ? "Transcribing…"
                    : "Start in the field above, then generate your draft when ready."}
            </p>
            {dictation.banner ? (
              <p
                className="mx-auto mt-3 max-w-2xl text-center text-base leading-relaxed text-amber-800 lg:max-w-3xl lg:text-[1.0625rem]"
                role="status"
              >
                {dictation.banner}{" "}
                <button
                  type="button"
                  onClick={dictation.dismissBanner}
                  className="inline-flex min-h-9 items-center font-medium text-teal-800 underline-offset-2 hover:underline"
                >
                  Dismiss
                </button>
              </p>
            ) : null}

            {handoffBusy ? (
              <div
                className="mt-6 rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-left shadow-sm sm:mt-5"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <p className="text-sm font-semibold text-emerald-950 sm:text-base">Creating your agreement…</p>
                <ul className="mt-2 space-y-1.5 text-sm leading-snug text-emerald-900/95 sm:text-[0.98rem]">
                  <li>✓ Structured draft being prepared</li>
                  <li>✓ Nothing is being sent</li>
                  <li>✓ You can edit everything next</li>
                </ul>
              </div>
            ) : null}
            <div className="mt-6 flex flex-col items-center gap-2 sm:mt-8">
              <button
                type="submit"
                disabled={heroPrimaryBusy}
                aria-busy={handoffBusy}
                className="claw-seo-btn-secondary min-h-12 w-full px-10 py-3.5 text-[1.08rem] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto sm:min-h-[3.25rem] sm:min-w-[17rem] sm:text-[1.1rem]"
              >
                {handoffBusy ? "Creating your agreement…" : primaryHeroLabel}
              </button>
              {!handoffBusy ? (
                <p className="text-center text-[0.8125rem] leading-snug text-slate-500 sm:text-xs">{NOTHING_SENT_UNTIL_CONFIRM}</p>
              ) : null}
            </div>
          </form>

          <section
            className="mx-auto mt-8 w-full max-w-5xl xl:max-w-6xl"
            aria-labelledby="claw-trust-layer-heading"
          >
            <h2
              id="claw-trust-layer-heading"
              className="text-center text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.85rem] lg:text-3xl"
            >
              Built for trust, not lock-in.
            </h2>
            <p className="mx-auto mt-4 max-w-3xl text-center text-[1.1rem] leading-7 text-slate-600 lg:max-w-5xl lg:text-[1.15rem] lg:leading-8">
              LawDog creates structured records with timestamps, verification data, and exportable proof — so people, teams,
              and counterparties are not forced to rely on blind trust.
            </p>
            <p className="mx-auto mt-3 max-w-3xl text-center text-sm leading-snug text-slate-500 lg:max-w-5xl lg:text-[0.95rem]">
              Proof you can verify independently.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
              <article className="claw-seo-card px-5 py-5 sm:px-6 sm:py-6">
                <h3 className="text-xl font-semibold text-slate-900 lg:text-[1.35rem]">Timestamped actions</h3>
                <p className="mt-3 text-[1.05rem] leading-relaxed text-slate-600 lg:text-[1.125rem]">
                  Every key action is recorded with a clear timestamp and structured event trail.
                </p>
              </article>
              <article className="claw-seo-card px-5 py-5 sm:px-6 sm:py-6">
                <h3 className="text-xl font-semibold text-slate-900 lg:text-[1.35rem]">Verifiable integrity</h3>
                <p className="mt-3 text-[1.05rem] leading-relaxed text-slate-600 lg:text-[1.125rem]">
                  Records are designed so their integrity can be checked, not merely assumed.
                </p>
              </article>
              <article className="claw-seo-card px-5 py-5 sm:px-6 sm:py-6">
                <h3 className="text-xl font-semibold text-slate-900 lg:text-[1.35rem]">Independent proof</h3>
                <p className="mt-3 text-[1.05rem] leading-relaxed text-slate-600 lg:text-[1.125rem]">
                  Verification should not depend on trusting a single company or dashboard.
                </p>
              </article>
              <article className="claw-seo-card px-5 py-5 sm:px-6 sm:py-6">
                <h3 className="text-xl font-semibold text-slate-900 lg:text-[1.35rem]">Portable by default</h3>
                <p className="mt-3 text-[1.05rem] leading-relaxed text-slate-600 lg:text-[1.125rem]">
                  Export your record and proof data anytime for your own files, workflows, or review.
                </p>
              </article>
            </div>

            <div className="mt-8 border-t border-slate-100 pt-8">
              <p className="text-center text-[0.73rem] font-semibold uppercase tracking-[0.12em] text-slate-400 lg:text-[0.75rem]">
                Useful for
              </p>
              <div className="mt-5 grid grid-cols-1 gap-6 text-center sm:grid-cols-3 sm:gap-5 sm:text-left">
                <div>
                  <p className="text-lg font-semibold text-slate-800 lg:text-xl">Individuals</p>
                  <p className="mt-2 text-base leading-snug text-slate-600 lg:text-[1.0625rem]">
                    Clear records without unnecessary friction.
                  </p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-800 lg:text-xl">Teams</p>
                  <p className="mt-2 text-base leading-snug text-slate-600 lg:text-[1.0625rem]">
                    Shared actions with a stronger audit trail.
                  </p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-800 lg:text-xl">Compliance-minded workflows</p>
                  <p className="mt-2 text-base leading-snug text-slate-600 lg:text-[1.0625rem]">
                    More structured documentation and easier review.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <div
            id="micro-flow"
            className="mx-auto mt-10 flex w-full max-w-5xl flex-wrap items-center justify-center gap-2 text-base font-medium leading-snug text-slate-700 sm:gap-3 xl:max-w-6xl lg:text-[1.0625rem]"
            role="list"
            aria-label="How it works"
          >
            {home.microSteps.map((label, i) => (
              <span key={`${label}-${i}`} className="flex flex-wrap items-center gap-2 sm:gap-3" role="listitem">
                {i > 0 ? (
                  <span className="text-slate-400" aria-hidden>
                    →
                  </span>
                ) : null}
                <span className="min-h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center shadow-sm sm:min-h-11 sm:px-4 lg:px-5 lg:py-3 lg:text-[1.05rem]">
                  {label}
                </span>
              </span>
            ))}
          </div>

          <p className="mx-auto mt-6 max-w-5xl px-1 text-center text-[1.08rem] leading-relaxed text-slate-600 sm:mt-8 xl:max-w-6xl lg:text-[1.125rem]">
            <strong className="font-semibold text-slate-800">Free</strong> to try.{" "}
            <strong className="font-semibold text-slate-800">Plus</strong> for real sends and a searchable library.{" "}
            <strong className="font-semibold text-slate-800">Pro</strong> for team memory and structured memos from your
            workspace.{" "}
            <button
              type="button"
              className="ml-0 inline-flex min-h-9 items-center font-semibold text-teal-800 underline-offset-2 hover:text-teal-950 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 sm:ml-1"
              onClick={() => navigate("/app/billing")}
            >
              See plans
            </button>
          </p>
        </header>

        <section className="mx-auto mt-10 w-full max-w-5xl space-y-8 border-t border-slate-200 pt-10 xl:max-w-6xl" aria-label="Product overview">
          <article className="claw-seo-seo-block claw-seo-card p-5 sm:p-6 lg:p-7">
            <h2 className="mb-3 text-[1.45rem] font-bold leading-tight text-slate-900 lg:text-[1.5rem]">
              Free online agreement &amp; signature tool
            </h2>
            <p className="mx-auto max-w-[34rem] text-[1.08rem] leading-relaxed text-slate-600 lg:text-[1.125rem]">
              Upload a PDF or describe terms in plain language. LawDog helps you structure a draft, preview it, and move
              toward send when you are ready — so you capture intent before paperwork. Paid plans unlock saved workspaces,
              search across deals you have stored, and (on eligible tiers) assistive memos built from your own materials.
            </p>
          </article>
          <article className="claw-seo-seo-block claw-seo-card p-5 sm:p-6 lg:p-7">
            <h2 className="mb-3 text-[1.45rem] font-bold leading-tight text-slate-900 lg:text-[1.5rem]">
              Structured drafts from plain language
            </h2>
            <p className="mx-auto max-w-[34rem] text-[1.08rem] leading-relaxed text-slate-600 lg:text-[1.125rem]">
              Freelance and lightweight commercial terms are natural fits: one prompt, one review surface, clearer next steps
              than a long blank form — refine the structured draft, then continue to send or sign when ready. When your plan
              includes it, you compound speed by reusing language that already worked.
            </p>
          </article>
          <article className="claw-seo-seo-block claw-seo-card p-5 sm:p-6 lg:p-7">
            <h2 className="mb-3 text-[1.45rem] font-bold leading-tight text-slate-900 lg:text-[1.5rem]">Signing tied to a proof record</h2>
            <p className="mx-auto max-w-[34rem] text-[1.08rem] leading-relaxed text-slate-600 lg:text-[1.125rem]">
              Signing stays tied to what recipients saw. When you’re done, you can share a public status link to show
              what was recorded — the public page does not show your full agreement text.
            </p>
          </article>
        </section>

        <footer className="mx-auto mt-10 w-full max-w-5xl border-t border-slate-200 pt-8 xl:max-w-6xl">
          <button
            type="button"
            className="mx-auto mb-6 flex min-h-12 w-full max-w-xs items-center justify-center rounded-lg text-center text-base font-medium text-slate-700 underline-offset-2 hover:bg-slate-50 hover:text-slate-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 sm:w-auto"
            onClick={() => navigate("/app")}
          >
            Open workspace
          </button>
          <JoySocialFooter className="mb-5 p-2 text-base leading-snug text-slate-600 lg:text-[1.0625rem]" />
          <DisclosureFooter
            tone="light"
            className="border-0 text-slate-600 !space-y-2 !pt-3 !text-sm !leading-snug"
          />
        </footer>
      </div>
    </div>
  );
}
