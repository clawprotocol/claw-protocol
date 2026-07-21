import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReEngagementBanner } from "../ReEngagementBanner";
import { peekCreateOrHomeBanner, type CreateOrHomeBanner } from "../reEngagementStore";
import { useAccess } from "../../access/AccessContext";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import AgreementBuilderIntake, {
  readAgreementCreatorIntakeStorage,
} from "../../components/agreements/AgreementBuilderIntake";
import {
  clearCreateReviewAgreementResumeId,
  readCreateReviewAgreementResumeId,
  writeCreateReviewAgreementResumeId,
} from "../../components/agreements/agreementIntakeStorage";
import { readCreateComplexityResume } from "../../components/agreements/agreementCreateComplexityResume";
import {
  hasCheckoutBackRestoreSnapshot,
  isCheckoutBackRestoreRequested,
  readCheckoutBackRestoreSnapshot,
} from "../../components/agreements/checkoutBackRestore";
import { shouldSkipHomeAutoGenerateForStoredReview } from "../../components/agreements/createReviewRefreshRestore";
import { setJoyFlash, emitActionCompleted } from "../../joy/joyTelemetry";
import {
  clearHeroIntakeHandoffAfterApply,
  readHeroIntakeHandoffForCreate,
} from "../heroIntakePrefill";
import { SimpleFlowShell } from "./SimpleFlowShell";
import { recordAgreementCreatedForInboundRef } from "../affiliate/clawOpportunityStore";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import { useLaunchNav } from "../LaunchNavContext";
import { EXAMPLE_INTAKE_PROMPTS } from "../useInputConfidenceHint";
import { AGREEMENT_LIFECYCLE_PROGRESS_LABELS, lifecycleStepForStage } from "../../agreement/agreementLifecycleRail";
import {
  resolveWorkspaceCreateAccess,
  resolveAuthenticationState,
  resolveEntitlementStateFromTier,
} from "../../access/authenticatedWorkspaceAccessPolicy";
import { hasCurrentSessionFreeStarterIntent } from "../../components/agreements/paidProSessionEligibility";
import { getLawdogTrustNudges } from "../../tracking/lawdogSession";
import { UpgradeToProModal } from "../../monetization/UpgradeToProModal";
import { readLawDogUserMonetizationState } from "../../monetization/lawDogMonetization";
import {
  NO_ATTORNEY_CLIENT,
  PRODUCT_NOT_LAW_FIRM,
  STRUCTURED_DRAFT_ASSIST_SHORT,
} from "../../compliance/disclosureCopy";
import {
  FIRST_RUN_INTAKE_REASSURANCE,
  FIRST_SESSION_CREATE_INTAKE_PLACEHOLDER,
  SIMPLE_CREATE_INTAKE_PLACEHOLDER,
} from "../pricingContent";
import { useFirstSessionHint } from "../../conversion/firstExposureHints";
import { clearLawdogEntryContext, consumeLawdogFocusCreateIntake } from "../lawdogEntryContext";
import { isFirstLawdogSession, markLawdogDraftCreated } from "../lawdogFirstDraftSession";
import { isFreshSimpleCreateStart as computeFreshSimpleCreateStart } from "./freshSimpleCreateStart";
import { buildSimpleSendHandoff } from "./simpleSendHandoff";
import {
  clearPaidProStarterSignatureSendFromCreateFlow,
  type PremiumSendIntent,
} from "./premiumSendIntent";
import {
  executePaidProPostRecipientSetupHandoff,
  shouldSkipPaidProPrepareReviewLinkInterstitial,
  type PaidProPostRecipientSetupFailure,
} from "./paidProPostRecipientSetupHandoff";
import { peekReviewFirstHandoffSource } from "./reviewFirstSendSurface";
import { logReviewFirstLegacySendBlocked } from "../../components/agreements/guidedDealCompletion/guidedFinalReviewToSigning";
import { shouldSuppressReviewPipelineTelemetry } from "../../vs01/vs01SignatureDashboardFlow";
import { getOrgId, bootstrapWorkspaceOrg } from "../orgContext";
import { ensureAffiliateAttributionForOrg } from "../affiliate/affiliateAttributionContext";
import { fetchWorkspaceProEntitlement } from "../../agreement/agreementProFunnelGate";
import {
  PREMIUM_PRO_REVIEW_SCROLL_ANCHOR_ID,
  SIMPLE_CREATE_PAID_PRO_REVIEW_SUBTITLE,
  SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE,
  SIMPLE_CREATE_STARTER_CONTROL_LINE,
  SIMPLE_CREATE_STARTER_HERO_SUBHEAD,
  SIMPLE_CREATE_STARTER_HERO_TITLE,
} from "./simpleCreatePaidProReviewShell";
import { HomeCreateTransitionOverlay } from "./HomeCreateTransitionOverlay";
import { DRAFT_LOADING_PREPARING } from "./guidedWorkflowCopy";

const STARTER_TEMPLATE =
  "Services Agreement between [Your Company] and [Client]. Scope: [describe work]. Payment: [amount] due [terms]. Governing law: [state].";

export function SimpleCreatePage() {
  const access = useAccess();
  const { navigate, search } = useLaunchNav();
  const showFirstHints = useFirstSessionHint("create");
  const firstSessionLive = useMemo(() => isFirstLawdogSession(), []);
  const [starterSeed, setStarterSeed] = useState<string | undefined>(undefined);
  const [otherWaysOpen, setOtherWaysOpen] = useState(false);
  const [heroHandoff] = useState(() => readHeroIntakeHandoffForCreate());
  const handoffFromHome = heroHandoff?.fromHome ?? false;
  const premiumCompletionReturn = useMemo(() => {
    try {
      return new URLSearchParams(search).get("premiumCompletion") === "1";
    } catch {
      return false;
    }
  }, [search]);
  const checkoutBackRestoreActive = useMemo(
    () =>
      !premiumCompletionReturn &&
      (isCheckoutBackRestoreRequested(search) || hasCheckoutBackRestoreSnapshot()),
    [search, premiumCompletionReturn],
  );
  const homeHeroAutoGenerate =
    heroHandoff?.autoGenerate === true &&
    Boolean((heroHandoff?.text || "").trim()) &&
    !shouldSkipHomeAutoGenerateForStoredReview({ freshHomeHeroHandoff: handoffFromHome }) &&
    !checkoutBackRestoreActive;
  const quickSendTypedArrival =
    heroHandoff?.quickSendTypedHandoff === true && Boolean((heroHandoff?.text || "").trim());
  const hadBrowserPromptDraft = useMemo(() => {
    if (handoffFromHome) return false;
    if (heroHandoff?.text?.trim()) return false;
    return readAgreementCreatorIntakeStorage().trim().length > 0;
  }, [handoffFromHome, heroHandoff?.text]);

  const usingTemplate = starterSeed === STARTER_TEMPLATE;
  const pasteOnly = starterSeed === "";

  /** True when persisted draft hydrates the intake (undefined initial + storage). */
  const persistedIntakeWillApply = useMemo(() => {
    if (usingTemplate) return false;
    if (pasteOnly) return false;
    if (handoffFromHome) return false;
    if (Boolean(heroHandoff?.text?.trim())) return false;
    return readAgreementCreatorIntakeStorage().trim().length > 0;
  }, [usingTemplate, pasteOnly, handoffFromHome, heroHandoff?.text]);

  const isFreshSimpleCreateStart = useMemo(
    () =>
      computeFreshSimpleCreateStart({
        quickSendTypedArrival,
        handoffFromHome,
        heroPrefillText: heroHandoff?.text,
        usingTemplate,
        persistedIntakeWillApply,
        resumeNotice: null,
      }),
    [
      quickSendTypedArrival,
      handoffFromHome,
      heroHandoff?.text,
      usingTemplate,
      persistedIntakeWillApply,
    ],
  );

  const monetizationUser = useMemo(
    () => readLawDogUserMonetizationState(access.tier, access.usage),
    [access.tier, access.usage],
  );
  const [workspaceProEntitled, setWorkspaceProEntitled] = useState(false);
  const createAccessVerdict = useMemo(
    () =>
      resolveWorkspaceCreateAccess({
        authentication: resolveAuthenticationState({
          isAuthenticated: monetizationUser.isAuthenticated,
        }),
        entitlement: resolveEntitlementStateFromTier(access.tier),
        isStarterAnonymousSession: hasCurrentSessionFreeStarterIntent(),
        isResumingOwnedAgreement: Boolean(readCreateReviewAgreementResumeId()),
        hasCheckoutPendingMarker: Boolean(readCreateComplexityResume()?.awaitingProCheckout),
        workspaceProEntitledProbe: workspaceProEntitled,
      }),
    [access.tier, monetizationUser.isAuthenticated, workspaceProEntitled],
  );
  const creationBlockedForUi =
    !createAccessVerdict.allowed && createAccessVerdict.showUpgradeModal;
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [postRecipientHandoffFailure, setPostRecipientHandoffFailure] =
    useState<PaidProPostRecipientSetupFailure | null>(null);
  const [postRecipientHandoffRetrying, setPostRecipientHandoffRetrying] = useState(false);
  const [reEngageBanner, setReEngageBanner] = useState<CreateOrHomeBanner | null>(null);
  const [intakeActive, setIntakeActive] = useState(false);
  const trustNudge = getLawdogTrustNudges();
  const intakeChangeBootRef = useRef(true);
  const primedDraftForHandoffRetryRef = useRef<AgreementDraft | null>(null);

  useEffect(() => {
    void bootstrapWorkspaceOrg();
    setReEngageBanner(peekCreateOrHomeBanner("create"));
  }, []);

  useEffect(() => {
    void ensureAffiliateAttributionForOrg(getOrgId());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchWorkspaceProEntitlement().then((ok) => {
      if (!cancelled) setWorkspaceProEntitled(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!consumeLawdogFocusCreateIntake()) return;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const el = document.querySelector<HTMLTextAreaElement>(".vs01-agreement-intake textarea");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus();
        try {
          const len = el?.value?.length ?? 0;
          el?.setSelectionRange(len, len);
        } catch {
          /* selection may be unsupported in some modes */
        }
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!creationBlockedForUi) return;
    logProductEvent("paywall_triggered", {
      surface: "simple_create",
      reason: createAccessVerdict.reason,
    });
    setUpgradeModalOpen(true);
  }, [creationBlockedForUi]);

  const intakeKey = usingTemplate
    ? "tmpl"
    : pasteOnly
      ? "paste"
      : heroHandoff
        ? `free-hp-${heroHandoff.text.length}-${heroHandoff.voiceFinalize ? "v" : "t"}`
        : "free";
  const checkoutRestoreSnapshot = useMemo(
    () => (checkoutBackRestoreActive ? readCheckoutBackRestoreSnapshot() : null),
    [checkoutBackRestoreActive],
  );
  const initialFromHeroOrStorage = usingTemplate
    ? STARTER_TEMPLATE
    : pasteOnly
      ? ""
      : checkoutRestoreSnapshot?.intakeText?.trim()
        ? checkoutRestoreSnapshot.intakeText
        : heroHandoff
          ? heroHandoff.text
          : undefined;

  useEffect(() => {
    const seed =
      (initialFromHeroOrStorage ?? "").trim() ||
      readAgreementCreatorIntakeStorage().trim() ||
      "";
    if (seed.length > 0) setIntakeActive(true);
  }, [initialFromHeroOrStorage]);

  const prevIntakeKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (checkoutBackRestoreActive) {
      prevIntakeKeyRef.current = intakeKey;
      return;
    }
    if (prevIntakeKeyRef.current != null && prevIntakeKeyRef.current !== intakeKey) {
      clearCreateReviewAgreementResumeId();
    }
    prevIntakeKeyRef.current = intakeKey;
  }, [intakeKey, checkoutBackRestoreActive]);

  const simplifyFirstSession = firstSessionLive;

  const [paidProReviewReadyShell, setPaidProReviewReadyShell] = useState(false);
  const [freeStarterReviewShellActive, setFreeStarterReviewShellActive] = useState(false);
  const [shellLifecycleStage, setShellLifecycleStage] = useState<
    import("../../agreement/agreementLifecycleRail").AgreementLifecycleStageId
  >("draft");
  const [homeTransitionVisible, setHomeTransitionVisible] = useState(
    homeHeroAutoGenerate && !checkoutBackRestoreActive,
  );
  const onSimpleCreateShellChrome = useCallback(
    (state: {
      paidProReviewReady: boolean;
      freeStarterReviewShellActive: boolean;
      lifecycleStage: import("../../agreement/agreementLifecycleRail").AgreementLifecycleStageId;
    }) => {
      setPaidProReviewReadyShell(state.paidProReviewReady);
      setFreeStarterReviewShellActive(state.freeStarterReviewShellActive);
      setShellLifecycleStage(state.lifecycleStage);
    },
    [],
  );
  const onHomeGuidedTransitionPhase = useCallback((phase: "preparing" | "review_ready") => {
    if (phase === "review_ready") setHomeTransitionVisible(false);
    else if (homeHeroAutoGenerate) setHomeTransitionVisible(true);
  }, [homeHeroAutoGenerate]);

  // Anonymous GTM Starter review: omit owner lifecycle rail; intake owns review chrome.
  const anonymousStarterReviewChrome =
    freeStarterReviewShellActive && !paidProReviewReadyShell;
  const shellStep = paidProReviewReadyShell
    ? lifecycleStepForStage(shellLifecycleStage)
    : anonymousStarterReviewChrome
      ? undefined
      : lifecycleStepForStage("draft");
  const shellProgressLabels = AGREEMENT_LIFECYCLE_PROGRESS_LABELS;
  const shellTitle = paidProReviewReadyShell
    ? SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE
    : quickSendTypedArrival
      ? "Shape your draft"
      : isFreshSimpleCreateStart
        ? SIMPLE_CREATE_STARTER_HERO_TITLE
        : "Describe your deal";
  const shellSubtitle = paidProReviewReadyShell
    ? SIMPLE_CREATE_PAID_PRO_REVIEW_SUBTITLE
    : quickSendTypedArrival
      ? "We turned your input into a structured draft for the same send/sign/proof workflow."
      : isFreshSimpleCreateStart
        ? SIMPLE_CREATE_STARTER_HERO_SUBHEAD
        : "Start typing or speaking — LawDog auto-structures parties, term, scope, and obligations as you go (edit inline in preview). Review, share, or prepare for signing when you're ready.";
  const hideIntakeMarketingChrome =
    paidProReviewReadyShell || homeTransitionVisible || anonymousStarterReviewChrome;

  return (
    <SimpleFlowShell
      step={shellStep}
      progressLabels={shellProgressLabels}
      hideHeader={anonymousStarterReviewChrome}
      logoHomeHref={anonymousStarterReviewChrome ? "/" : "/app"}
      hideAffiliateNav={anonymousStarterReviewChrome}
      kicker={
        paidProReviewReadyShell
          ? undefined
          : quickSendTypedArrival
            ? "Starting from your typed agreement"
            : undefined
      }
      title={shellTitle}
      subtitle={shellSubtitle}
      titleHeadingId={paidProReviewReadyShell ? PREMIUM_PRO_REVIEW_SCROLL_ANCHOR_ID : undefined}
      compactReviewHeader={paidProReviewReadyShell}
    >
      <HomeCreateTransitionOverlay active={homeTransitionVisible} />
      <div
        className={
          isFreshSimpleCreateStart || paidProReviewReadyShell || anonymousStarterReviewChrome
            ? "pb-36 sm:pb-32"
            : undefined
        }
      >
        {isFreshSimpleCreateStart && simplifyFirstSession && !quickSendTypedArrival && !hideIntakeMarketingChrome ? (
          <p className="mb-2 text-center text-[11px] font-medium leading-snug text-slate-500 sm:text-left sm:text-xs">
            {SIMPLE_CREATE_STARTER_CONTROL_LINE}
          </p>
        ) : null}
        {reEngageBanner && !simplifyFirstSession ? (
          <ReEngagementBanner
            surface="create"
            banner={reEngageBanner}
            onDismiss={() => setReEngageBanner(peekCreateOrHomeBanner("create"))}
            navigate={(path) => navigate(path)}
          />
        ) : null}
        {quickSendTypedArrival && !hideIntakeMarketingChrome ? (
          <p className="mb-4 text-center text-sm leading-snug text-slate-400 sm:mb-5 sm:text-left sm:text-base md:text-[1.0625rem] lg:text-[1.125rem] lg:leading-relaxed lg:text-slate-300">
            This draft continues to send, sign, and proof.
          </p>
        ) : null}
        {!quickSendTypedArrival && showFirstHints && !simplifyFirstSession && !hideIntakeMarketingChrome ? (
          <p className="mb-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px] text-slate-500 sm:justify-start sm:text-xs md:text-sm md:text-slate-400">
            <span>Takes ~30 seconds.</span>
            <span className="hidden text-slate-700 sm:inline" aria-hidden>
              ·
            </span>
            <span>No account needed.</span>
          </p>
        ) : null}
        {!quickSendTypedArrival && !isFreshSimpleCreateStart && !hideIntakeMarketingChrome ? (
          <p className="mb-3 text-center text-base font-medium leading-relaxed text-slate-300 sm:text-left sm:text-[1.0625rem] md:text-[1.125rem] lg:text-[1.1875rem] lg:leading-[1.55] lg:text-slate-200/95">
            Describe your agreement. We&apos;ll turn it into something you can send.
          </p>
        ) : null}
        {intakeActive && !isFreshSimpleCreateStart && !hideIntakeMarketingChrome ? (
          <p
            className="mb-4 rounded-lg border border-emerald-900/35 bg-emerald-950/20 px-3 py-2.5 text-center text-sm leading-snug text-emerald-100/95 sm:text-left sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem] lg:leading-relaxed"
            role="status"
          >
            {FIRST_RUN_INTAKE_REASSURANCE}
          </p>
        ) : null}
        {!quickSendTypedArrival && !isFreshSimpleCreateStart && !hideIntakeMarketingChrome ? (
          <div className="mb-5 flex flex-wrap justify-center gap-2 sm:justify-start" aria-label="Example prompts">
            {EXAMPLE_INTAKE_PROMPTS.map((text) => (
              <button
                key={text}
                type="button"
                className="rounded-full border border-slate-700/80 bg-slate-900/40 px-3 py-2 text-left text-xs font-medium text-slate-300 transition-colors hover:border-emerald-500/45 hover:text-emerald-100 active:scale-[0.99] sm:text-[0.8125rem] md:text-sm lg:px-3.5 lg:py-2.5 lg:text-[0.9375rem] lg:leading-snug motion-safe:transition-transform motion-safe:duration-100"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("claw-prefill-intake", { detail: { text } }));
                }}
              >
                {text}
              </button>
            ))}
          </div>
        ) : null}
        {!quickSendTypedArrival && !simplifyFirstSession && !hideIntakeMarketingChrome ? (
          <p className="mb-5 text-center text-sm leading-relaxed text-slate-600 sm:text-left sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem] lg:leading-[1.55] lg:text-slate-400">
            This is a draft workspace — refine with no pressure.{" "}
            <span className="text-slate-500 lg:text-slate-400">Nothing is sent until you review, unlock send, and confirm.</span>
          </p>
        ) : null}

        {trustNudge.suggestEmailForTrust && !simplifyFirstSession && !hideIntakeMarketingChrome ? (
          <div
            className="mb-4 rounded-lg border border-slate-700/80 bg-slate-950/40 px-3 py-2.5 text-sm leading-relaxed text-slate-400 sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem] lg:leading-[1.55] lg:text-slate-300/90"
            role="status"
          >
            <strong className="text-slate-200">Help keep free access fair.</strong> Use real recipient emails on the send
            step — we never log message bodies, and we do not treat party emails as your account identity. No device
            fingerprinting.
          </div>
        ) : null}

        {usingTemplate ? (
          <div
            className="mb-4 rounded-lg border border-amber-700/45 bg-amber-950/25 px-3 py-2.5 text-sm leading-snug text-amber-100/95 sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem] lg:leading-relaxed"
            role="status"
          >
            <strong className="text-amber-50">Example prompt loaded.</strong> Replace every placeholder with your real
            parties, scope, and terms — this is sample text, not your deal.
          </div>
        ) : null}

        {!usingTemplate && !pasteOnly && !handoffFromHome && hadBrowserPromptDraft && !simplifyFirstSession ? (
          <div className="mb-4 rounded-lg border border-sky-800/40 bg-sky-950/20 px-3 py-2.5 text-sm text-sky-100/90 sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem] lg:leading-relaxed">
            <strong className="text-sky-50">Draft prompt restored</strong> from this browser. Edit or clear it before you
            continue.
          </div>
        ) : null}

        {!quickSendTypedArrival && !simplifyFirstSession && !hideIntakeMarketingChrome ? (
          <div className="mb-6 border-b border-slate-800/70 pb-5">
            <button
              type="button"
              className="text-sm font-semibold text-slate-500 underline-offset-4 transition-colors hover:text-emerald-400/90 hover:underline sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem]"
              aria-expanded={otherWaysOpen}
              onClick={() => setOtherWaysOpen((v) => !v)}
            >
              Other ways to start
            </button>
            {otherWaysOpen ? (
              <div className="mt-4 rounded-xl border border-slate-800/90 bg-slate-950/40 p-4">
                <p className="text-xs leading-relaxed text-slate-500 sm:text-[0.8125rem] md:text-sm lg:text-[0.9375rem] lg:leading-relaxed lg:text-slate-400">
                  Optional shortcuts — refine wording here, then review and send when you&apos;re ready.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    className={`vs01-btn vs01-btn--compact flex-1 sm:flex-none sm:min-w-[8.5rem] ${
                      usingTemplate ? "vs01-btn--primary" : "vs01-btn--secondary"
                    }`}
                    onClick={() => {
                      setStarterSeed(STARTER_TEMPLATE);
                      setOtherWaysOpen(false);
                    }}
                  >
                    Start from example structure
                  </button>
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary vs01-btn--compact flex-1 sm:flex-none sm:min-w-[8.5rem]"
                    onClick={() => {
                      setStarterSeed(undefined);
                      navigate("/app/quick");
                    }}
                  >
                    Upload document
                  </button>
                  <button
                    type="button"
                    className={`vs01-btn vs01-btn--compact flex-1 sm:flex-none sm:min-w-[8.5rem] ${
                      pasteOnly ? "vs01-btn--primary" : "vs01-btn--secondary"
                    }`}
                    onClick={() => {
                      setStarterSeed("");
                      setOtherWaysOpen(false);
                    }}
                  >
                    Paste only
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {postRecipientHandoffFailure ? (
          <div
            className="mb-4 rounded-lg border border-rose-800/45 bg-rose-950/25 px-4 py-4 text-sm text-rose-50/95"
            role="alert"
          >
            <p className="font-medium text-rose-100">{postRecipientHandoffFailure.userMessage}</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                className="vs01-btn vs01-btn--primary min-h-[2.65rem]"
                disabled={postRecipientHandoffRetrying || !primedDraftForHandoffRetryRef.current}
                onClick={() => {
                  const failure = postRecipientHandoffFailure;
                  const draft = primedDraftForHandoffRetryRef.current;
                  const id = failure.agreementId.trim();
                  if (!id || !draft) return;
                  setPostRecipientHandoffRetrying(true);
                  void (async () => {
                    try {
                      const result = await executePaidProPostRecipientSetupHandoff({
                        navigate: (to) => void navigate(to),
                        agreementId: id,
                        draft,
                        premiumSendIntent: failure.premiumSendIntent,
                        logSource: "create_flow_post_recipient_retry",
                      });
                      if (result.ok) {
                        setPostRecipientHandoffFailure(null);
                        clearPaidProStarterSignatureSendFromCreateFlow();
                      } else {
                        setPostRecipientHandoffFailure(result.failure);
                      }
                    } finally {
                      setPostRecipientHandoffRetrying(false);
                    }
                  })();
                }}
              >
                {postRecipientHandoffRetrying ? "Preparing…" : "Retry prepare signing"}
              </button>
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary min-h-[2.65rem]"
                disabled={postRecipientHandoffRetrying}
                onClick={() => {
                  const id = postRecipientHandoffFailure.agreementId.trim();
                  setPostRecipientHandoffFailure(null);
                  if (id) {
                    writeCreateReviewAgreementResumeId(id);
                    void navigate("/app/create");
                  }
                }}
              >
                Back to agreement
              </button>
            </div>
          </div>
        ) : null}

        {creationBlockedForUi ? (
          <div
            className="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-100/95"
            role="status"
          >
            <p className="font-medium text-amber-50">You&apos;ve used your free agreement.</p>
            <p className="mt-1 text-xs text-amber-100/85">
              Upgrade to Pro to continue shaping agreements in this workspace.
            </p>
            <button
              type="button"
              className="vs01-btn vs01-btn--primary vs01-btn--compact mt-3"
              onClick={() => {
                logProductEvent("paywall_clicked_upgrade", { surface: "simple_create", variant: "inline_strip" });
                navigate("/app/billing");
              }}
            >
              Upgrade to Pro
            </button>
            <p className="mt-3 text-[11px] text-amber-200/75">
              Quick send stays open —{" "}
              <button
                type="button"
                className="font-medium text-amber-100 underline-offset-2 hover:underline"
                onClick={() => navigate("/app/quick")}
              >
                send a document instead
              </button>
              .
            </p>
          </div>
        ) : null}

        <div className={creationBlockedForUi ? "pointer-events-none select-none opacity-60" : undefined}>
          <AgreementBuilderIntake
            key={intakeKey}
            className="vs01-agreement-intake rounded-xl border border-slate-800/90 bg-slate-950/35 p-4 sm:p-5"
            workspaceUi
            simpleProductFlow
            simpleProductTextareaPlaceholder={
              isFreshSimpleCreateStart ? FIRST_SESSION_CREATE_INTAKE_PLACEHOLDER : SIMPLE_CREATE_INTAKE_PLACEHOLDER
            }
            simpleProductFlowSubmitLabel={
              isFreshSimpleCreateStart ? "Create draft" : quickSendTypedArrival ? "Review" : "Review"
            }
            simpleProductFollowUpSubmitLabel="Next"
            simpleProductFlowGeneratingLabel={
              quickSendTypedArrival || homeHeroAutoGenerate ? DRAFT_LOADING_PREPARING : undefined
            }
            homeHeroAutoGenerate={homeHeroAutoGenerate}
            checkoutBackRestoreActive={checkoutBackRestoreActive}
            onHomeGuidedTransitionPhase={homeHeroAutoGenerate ? onHomeGuidedTransitionPhase : undefined}
            continuitySourcePanel={
              quickSendTypedArrival && heroHandoff?.text
                ? { label: "Your starting text", text: heroHandoff.text }
                : undefined
            }
            hideWorkspaceComplianceFootnote
            liveWorkspaceTwoPane
            initialIntakeText={initialFromHeroOrStorage}
            freshSimpleCreateStart={isFreshSimpleCreateStart}
            firstLawdogSession={firstSessionLive}
            onSimpleCreateShellChrome={onSimpleCreateShellChrome}
            onIntakeTextChange={(t) => {
              setIntakeActive(t.trim().length > 0);
              if (intakeChangeBootRef.current) {
                intakeChangeBootRef.current = false;
                return;
              }
              clearLawdogEntryContext();
            }}
            onCreated={(
              agreementId: string,
              primed: AgreementDraft,
              handoff?: { premiumSendIntent?: PremiumSendIntent | null; openFlowPhase?: "review" | "send" },
            ) => {
              clearCreateReviewAgreementResumeId();
              clearLawdogEntryContext();
              markLawdogDraftCreated();
              access.recordUsage("agreements_created");
              logProductEvent("agreement_started", { agreementId });
              logProductEvent("agreement_created", { agreementId });
              logProductEvent("draft_created", { agreementId });
              recordAgreementCreatedForInboundRef(agreementId);
              clearHeroIntakeHandoffAfterApply();
              setJoyFlash("draft_ready");
              emitActionCompleted("draft", { agreementId });
              if (
                (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV &&
                !shouldSuppressReviewPipelineTelemetry()
              ) {
                console.debug("[SimpleCreate] navigate to review with agreement id", agreementId);
              }
              void (async () => {
                if (peekReviewFirstHandoffSource(agreementId)) {
                  logReviewFirstLegacySendBlocked({
                    agreementId,
                    path: "simple_create_onCreated",
                    premiumSendIntent: handoff?.premiumSendIntent ?? null,
                  });
                  return;
                }
                const resolvedIntent: PremiumSendIntent | null =
                  handoff?.premiumSendIntent === "signature" || handoff?.premiumSendIntent === "review"
                    ? handoff.premiumSendIntent
                    : null;
                primedDraftForHandoffRetryRef.current = primed;
                if (
                  resolvedIntent &&
                  shouldSkipPaidProPrepareReviewLinkInterstitial({
                    draft: primed,
                    agreementId,
                    premiumSendIntent: resolvedIntent,
                  })
                ) {
                  const result = await executePaidProPostRecipientSetupHandoff({
                    navigate: (to) => void navigate(to),
                    agreementId,
                    draft: primed,
                    premiumSendIntent: resolvedIntent,
                    recipientSetup: {
                      recipientPartyEmails: (primed.parties ?? []).map((p) =>
                        String((p as { email?: string }).email ?? "").trim(),
                      ),
                      recipientPartySignerNames: (primed.parties ?? []).map((p) =>
                        String((p as { signerName?: string }).signerName ?? "").trim(),
                      ),
                      recipientPartySignerTitles: (primed.parties ?? []).map((p) =>
                        String((p as { signerTitle?: string }).signerTitle ?? "").trim(),
                      ),
                    },
                    logSource: "create_flow_post_recipient_setup",
                  });
                  if (result.ok) {
                    clearPaidProStarterSignatureSendFromCreateFlow();
                    return;
                  }
                  setPostRecipientHandoffFailure(result.failure);
                  return;
                }
                navigate(`/app/send/${encodeURIComponent(agreementId)}`, {
                  simpleSendHandoff: buildSimpleSendHandoff({
                    agreementId,
                    primedDraft: primed,
                    streamlinedSimpleFlow: isFreshSimpleCreateStart,
                    premiumSendIntent: handoff?.premiumSendIntent ?? null,
                    ...(handoff?.openFlowPhase === "send" || handoff?.openFlowPhase === "review"
                      ? { openFlowPhase: handoff.openFlowPhase }
                      : {}),
                  }),
                });
              })();
            }}
          />
        </div>

        <UpgradeToProModal
          open={upgradeModalOpen}
          onClose={() => setUpgradeModalOpen(false)}
          surface="simple_create"
        />

        {!(firstSessionLive && isFreshSimpleCreateStart) ? (
          <p className="mx-auto mt-4 max-w-xl text-center text-xs leading-relaxed text-slate-500 sm:text-[0.8125rem] md:text-sm lg:text-[0.9375rem] lg:leading-[1.55] lg:text-slate-400">
            Editable at every step. {STRUCTURED_DRAFT_ASSIST_SHORT} {PRODUCT_NOT_LAW_FIRM} {NO_ATTORNEY_CLIENT}
          </p>
        ) : null}
      </div>
    </SimpleFlowShell>
  );
}
