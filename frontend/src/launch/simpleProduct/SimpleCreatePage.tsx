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
import {
  armCreatorDashboardSignerSetupResume,
  parseResumeSignerSetupAgreementIdFromSearch,
} from "../creatorDashboardReviewLinkRouting";
import { readCreateComplexityResume } from "../../components/agreements/agreementCreateComplexityResume";
import {
  hasCheckoutBackRestoreSnapshot,
  isCheckoutBackRestoreRequested,
  readCheckoutBackRestoreSnapshot,
} from "../../components/agreements/checkoutBackRestore";
import {
  pinAfterPayRestoreAgreementId,
  readAfterPayRestoreAgreementIdFromSearch,
} from "../checkoutParams";
import { shouldSkipHomeAutoGenerateForStoredReview } from "../../components/agreements/createReviewRefreshRestore";
import { setJoyFlash, emitActionCompleted } from "../../joy/joyTelemetry";
import {
  clearHeroIntakeHandoffAfterApply,
  readHeroIntakeHandoffForCreate,
} from "../heroIntakePrefill";
import { SimpleFlowShell } from "./SimpleFlowShell";
import { recordAgreementCreatedForInboundRef } from "../affiliate/clawOpportunityStore";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import { resolveApiBase } from "../../lib/clawApi";
import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import { useLaunchNav } from "../LaunchNavContext";
import { EXAMPLE_INTAKE_PROMPTS } from "../useInputConfidenceHint";
import { AGREEMENT_LIFECYCLE_PROGRESS_LABELS, lifecycleStepForStage } from "../../agreement/agreementLifecycleRail";
import {
  resolveWorkspaceCreateAccess,
  resolveAuthenticationState,
  resolveEntitlementStateFromTier,
} from "../../access/authenticatedWorkspaceAccessPolicy";
import {
  fetchCommercialEntitlement,
  type CommercialEntitlementDecision,
} from "../../access/commercialEntitlement";
import { fetchWorkspaceIndex } from "../../agreement/agreementWorkspaceApi";
import { hasCurrentSessionFreeStarterIntent } from "../../components/agreements/paidProSessionEligibility";
import { getLawdogTrustNudges } from "../../tracking/lawdogSession";
import { UpgradeToProModal } from "../../monetization/UpgradeToProModal";
import { useAuth } from "../../auth/AuthProvider";
import { setCachedAccessToken } from "../../auth/authAccessTokenCache";
import { bindAuthenticatedUserToWorkspace } from "../../auth/workspaceBindingApi";
import { displayNameFromUser } from "../../auth/postAuthFinalizer";
import {
  prepareColdReferralCreateRedirect,
  referralCodeFromCreateSearch,
  resolveColdReferralCreateRedirect,
} from "../genesisReferral/genesisReferralColdCreateGate";
import {
  isUserWorkspaceOrgId,
  resolveCreateWorkspaceProbeReadiness,
} from "./createWorkspaceProbeReadiness";
import {
  NO_ATTORNEY_CLIENT,
  PRODUCT_NOT_LAW_FIRM,
  STRUCTURED_DRAFT_ASSIST_SHORT,
} from "../../compliance/disclosureCopy";
import {
  CREATE_FIRST_AGREEMENT_FREE_INLINE,
  FIRST_RUN_INTAKE_REASSURANCE,
  FIRST_SESSION_CREATE_INTAKE_PLACEHOLDER,
  SIMPLE_CREATE_INTAKE_PLACEHOLDER,
} from "../pricingContent";
import { CreateAccessChoicePanel } from "./CreateAccessChoicePanel";
import {
  CREATE_ACCESS_CHOICE_HEADING,
  formatGenesisAllowanceStatusCopy,
  formatProAllowanceStatusCopy,
  shouldGateCreateEditorUntilEntitlementReady,
  shouldShowCreateAccessChoiceScreen,
} from "./createEntitlementUi";
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
  SIMPLE_CREATE_SIGNER_SETUP_RESUME_SUBTITLE,
  SIMPLE_CREATE_SIGNER_SETUP_RESUME_TITLE,
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
  const { navigate, search, pathname } = useLaunchNav();
  const { user: authUser, loading: authLoading, session: authSession } = useAuth();
  const isReallyAuthenticated = Boolean(authUser);
  const showFirstHints = useFirstSessionHint("create");
  const firstSessionLive = useMemo(() => isFirstLawdogSession(), []);
  const [workspaceOrgId, setWorkspaceOrgId] = useState(() => getOrgId());
  const hasColdReferralInSearch = Boolean(referralCodeFromCreateSearch(search));

  // Cold GTM referral links must not run entitlement probes (mock-auth 401).
  // Capture ?ref= then send signed-out visitors to sign-in with return destination.
  const coldReferralRedirect = useMemo(
    () =>
      resolveColdReferralCreateRedirect({
        authLoading,
        isAuthenticated: isReallyAuthenticated,
        search,
      }),
    [authLoading, isReallyAuthenticated, search],
  );
  useEffect(() => {
    const gate = prepareColdReferralCreateRedirect({
      authLoading,
      isAuthenticated: isReallyAuthenticated,
      search,
      pathname,
    });
    if (!gate) return;
    navigate(gate.redirectTo);
  }, [authLoading, isReallyAuthenticated, search, pathname, navigate]);

  const probeReadiness = useMemo(
    () =>
      resolveCreateWorkspaceProbeReadiness({
        authLoading,
        isAuthenticated: isReallyAuthenticated,
        orgId: workspaceOrgId,
        coldReferralRedirect: Boolean(coldReferralRedirect),
        hasColdReferralInSearch,
      }),
    [
      authLoading,
      isReallyAuthenticated,
      workspaceOrgId,
      coldReferralRedirect,
      hasColdReferralInSearch,
    ],
  );
  const probesReady = probeReadiness.ready;
  const awaitingAuthWorkspace =
    !probesReady &&
    (probeReadiness.reason === "awaiting_user_org" ||
      probeReadiness.reason === "auth_loading" ||
      probeReadiness.reason === "cold_referral_auth_pending");

  // After OAuth return, bind until claw_org_id is user-* — never probe with anon-*.
  useEffect(() => {
    if (!isReallyAuthenticated || !authUser) return;
    if (isUserWorkspaceOrgId(getOrgId())) {
      setWorkspaceOrgId(getOrgId());
      return;
    }
    let cancelled = false;
    void bindAuthenticatedUserToWorkspace({
      userId: authUser.id,
      email: authUser.email,
      displayName: displayNameFromUser(authUser),
      claimMethod: "session_restore",
      accessToken: authSession?.access_token,
    })
      .then((bind) => {
        if (cancelled) return;
        setWorkspaceOrgId(bind.org_id || getOrgId());
      })
      .catch(() => {
        if (!cancelled) setWorkspaceOrgId(getOrgId());
      });
    return () => {
      cancelled = true;
    };
  }, [isReallyAuthenticated, authUser, authSession?.access_token]);

  // If bind cannot settle, leave create rather than probing anon-* forever.
  useEffect(() => {
    if (probeReadiness.ready || probeReadiness.reason !== "awaiting_user_org") return;
    const timer = window.setTimeout(() => {
      if (!isUserWorkspaceOrgId(getOrgId())) {
        navigate("/app");
      }
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [probeReadiness, navigate]);
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
  const afterPayRestoreAgreementId = useMemo(
    () => readAfterPayRestoreAgreementIdFromSearch(search),
    [search],
  );
  useState(() => pinAfterPayRestoreAgreementId(afterPayRestoreAgreementId));
  // Sticky for this create-page mount: must survive URL strip after intake arms signer setup.
  // Only honor the session arm when URL explicitly requests resume_signer_setup — leftover
  // arms from a prior Complete-signer-details visit must not auto-open an old agreement on
  // Dashboard → Create new (initializeNewAgreementSession also clears the arm).
  const [resumeSignerSetupAgreementId] = useState(() => {
    const fromSearch = parseResumeSignerSetupAgreementIdFromSearch(
      typeof window !== "undefined" ? window.location.search : search,
    );
    if (fromSearch) return fromSearch;
    return "";
  });
  const openSignerSetupOnResume = Boolean(resumeSignerSetupAgreementId);

  useEffect(() => {
    const id = resumeSignerSetupAgreementId;
    if (!id) return;
    // Keep resume_signer_setup in the URL until intake mounts signer setup (do not strip here).
    writeCreateReviewAgreementResumeId(id);
    armCreatorDashboardSignerSetupResume(id);
  }, [resumeSignerSetupAgreementId]);
  const checkoutBackRestoreActive = useMemo(
    () =>
      !premiumCompletionReturn &&
      !afterPayRestoreAgreementId &&
      (isCheckoutBackRestoreRequested(search) || hasCheckoutBackRestoreSnapshot()),
    [search, premiumCompletionReturn, afterPayRestoreAgreementId],
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

  // Create entitlement gating must use real Supabase auth — never the monetization mock default.
  const createAuthAuthenticated = isReallyAuthenticated;
  const [workspaceProEntitled, setWorkspaceProEntitled] = useState(false);
  const [commercialEntitlement, setCommercialEntitlement] =
    useState<CommercialEntitlementDecision | null>(null);
  const [commercialEntitlementReady, setCommercialEntitlementReady] = useState(false);
  const createAccessVerdict = useMemo(
    () =>
      resolveWorkspaceCreateAccess({
        authentication: resolveAuthenticationState({
          isAuthenticated: createAuthAuthenticated,
        }),
        entitlement: resolveEntitlementStateFromTier(access.tier),
        isStarterAnonymousSession: hasCurrentSessionFreeStarterIntent(),
        isResumingOwnedAgreement: Boolean(readCreateReviewAgreementResumeId()),
        hasCheckoutPendingMarker: Boolean(readCreateComplexityResume()?.awaitingProCheckout),
        workspaceProEntitledProbe: workspaceProEntitled,
        commercialEntitlement: commercialEntitlement
          ? {
              entitlement: commercialEntitlement.entitlement,
              state: commercialEntitlement.state,
              createAllowed: commercialEntitlement.createAllowed,
              canCreatePersistedAgreement: commercialEntitlement.canCreatePersistedAgreement,
              canSaveGuestDraft: commercialEntitlement.canSaveGuestDraft,
              agreementAllowance: commercialEntitlement.agreementAllowance,
              agreementsRemaining: commercialEntitlement.agreementsRemaining,
              periodEndsAt: commercialEntitlement.periodEndsAt,
              authFailure: commercialEntitlement.authFailure,
              probeFailure: commercialEntitlement.probeFailure,
              reason: commercialEntitlement.reason,
            }
          : null,
      }),
    [access.tier, createAuthAuthenticated, workspaceProEntitled, commercialEntitlement],
  );
  const isResumingOwnedAgreement = Boolean(readCreateReviewAgreementResumeId());
  const hasCheckoutPendingMarker = Boolean(readCreateComplexityResume()?.awaitingProCheckout);
  const editorGatedUntilEntitlement = shouldGateCreateEditorUntilEntitlementReady({
    isAuthenticated: createAuthAuthenticated,
    commercialEntitlementReady,
    isResumingOwnedAgreement,
    hasCheckoutPendingMarker,
  });
  const showAccessChoiceScreen =
    commercialEntitlementReady && shouldShowCreateAccessChoiceScreen(createAccessVerdict);
  // Modal only for post-value conversion (guest ready) or allowance exhaustion — not for unentitled signed-in.
  const creationBlockedForUi =
    commercialEntitlementReady &&
    !showAccessChoiceScreen &&
    ((!createAccessVerdict.allowed && createAccessVerdict.showUpgradeModal) ||
      createAccessVerdict.showGenesisAllowanceExhausted);
  const entitlementProbeBlocked =
    probesReady &&
    commercialEntitlementReady &&
    createAccessVerdict.showEntitlementProbeError;
  const hideAgreementEditor =
    editorGatedUntilEntitlement ||
    showAccessChoiceScreen ||
    entitlementProbeBlocked ||
    awaitingAuthWorkspace;
  const intakeInteractionBlocked =
    creationBlockedForUi || entitlementProbeBlocked || awaitingAuthWorkspace;
  const genesisWithinAllowance =
    commercialEntitlementReady &&
    createAccessVerdict.allowed &&
    createAccessVerdict.reason === "genesis_allowance";
  const proWithinAllowance =
    commercialEntitlementReady &&
    createAccessVerdict.allowed &&
    createAccessVerdict.reason === "entitled_owner" &&
    commercialEntitlement?.state === "pro";
  const guestDraftAvailable =
    commercialEntitlementReady &&
    createAccessVerdict.allowed &&
    (createAccessVerdict.reason === "guest_draft" ||
      createAccessVerdict.reason === "anonymous_starter");
  const freeAllowanceAvailable = guestDraftAvailable;
  const genesisAllowanceCopy =
    genesisWithinAllowance && commercialEntitlement
      ? formatGenesisAllowanceStatusCopy({
          agreementsRemaining: commercialEntitlement.agreementsRemaining,
          agreementAllowance: commercialEntitlement.agreementAllowance,
          periodEndsAt: commercialEntitlement.periodEndsAt,
        })
      : null;
  const proAllowanceCopy =
    proWithinAllowance && commercialEntitlement
      ? formatProAllowanceStatusCopy({
          agreementsRemaining: commercialEntitlement.agreementsRemaining,
          agreementAllowance: commercialEntitlement.agreementAllowance,
          periodEndsAt: commercialEntitlement.periodEndsAt,
        })
      : null;
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [hasAccessibleAgreement, setHasAccessibleAgreement] = useState(false);
  const [genesisRequestBusy, setGenesisRequestBusy] = useState(false);
  const [postRecipientHandoffFailure, setPostRecipientHandoffFailure] =
    useState<PaidProPostRecipientSetupFailure | null>(null);
  const [postRecipientHandoffRetrying, setPostRecipientHandoffRetrying] = useState(false);
  const [reEngageBanner, setReEngageBanner] = useState<CreateOrHomeBanner | null>(null);
  const [intakeActive, setIntakeActive] = useState(false);
  const draftPreservedForUpgrade =
    readAgreementCreatorIntakeStorage().trim().length > 0 || intakeActive;
  const trustNudge = getLawdogTrustNudges();
  const intakeChangeBootRef = useRef(true);
  const primedDraftForHandoffRetryRef = useRef<AgreementDraft | null>(null);

  useEffect(() => {
    if (!probesReady) return;
    // Authenticated create must keep user-* org — never mint/refresh anon session here.
    if (!isReallyAuthenticated) {
      void bootstrapWorkspaceOrg().then((oid) => setWorkspaceOrgId(oid || getOrgId()));
    } else {
      setWorkspaceOrgId(getOrgId());
    }
    setReEngageBanner(peekCreateOrHomeBanner("create"));
  }, [probesReady, isReallyAuthenticated]);

  useEffect(() => {
    if (!probesReady) return;
    if (isReallyAuthenticated && !isUserWorkspaceOrgId(getOrgId())) return;
    void ensureAffiliateAttributionForOrg(getOrgId());
  }, [probesReady, isReallyAuthenticated, workspaceOrgId]);

  useEffect(() => {
    if (!probesReady) return;
    if (isReallyAuthenticated && !isUserWorkspaceOrgId(getOrgId())) return;
    if (authSession?.access_token) setCachedAccessToken(authSession.access_token);
    let cancelled = false;
    setCommercialEntitlementReady(false);
    void fetchWorkspaceProEntitlement().then((ok) => {
      if (!cancelled) setWorkspaceProEntitled(ok);
    });
    void fetchCommercialEntitlement().then((decision) => {
      if (cancelled) return;
      setCommercialEntitlement(decision);
      setCommercialEntitlementReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [probesReady, isReallyAuthenticated, workspaceOrgId, authSession?.access_token]);

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
  }, [creationBlockedForUi, createAccessVerdict.reason]);

  useEffect(() => {
    if (!showAccessChoiceScreen) return;
    logProductEvent("paywall_triggered", {
      surface: "simple_create",
      reason: createAccessVerdict.reason,
      variant: "access_choice_screen",
    });
  }, [showAccessChoiceScreen, createAccessVerdict.reason]);

  useEffect(() => {
    if (!showAccessChoiceScreen) {
      setHasAccessibleAgreement(false);
      return;
    }
    let cancelled = false;
    void fetchWorkspaceIndex().then((result) => {
      if (cancelled) return;
      setHasAccessibleAgreement(!result.error && result.agreements.length > 0);
    });
    return () => {
      cancelled = true;
    };
  }, [showAccessChoiceScreen]);

  useEffect(() => {
    if (!entitlementProbeBlocked) return;
    logProductEvent("paywall_triggered", {
      surface: "simple_create",
      reason: createAccessVerdict.reason,
      variant: "entitlement_probe_failed",
    });
  }, [entitlementProbeBlocked, createAccessVerdict.reason]);

  const requestGenesisAccess = useCallback(() => {
    setGenesisRequestBusy(true);
    void fetch(`${resolveApiBase().replace(/\/$/, "")}/v1/workspace/genesis-access-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...clawAgreementHeaders() },
      credentials: "include",
      body: JSON.stringify({ reason: "create_access_choice_request" }),
    })
      .then(() =>
        fetchCommercialEntitlement().then((decision) => {
          setCommercialEntitlement(decision);
          setCommercialEntitlementReady(true);
        }),
      )
      .finally(() => setGenesisRequestBusy(false));
  }, []);

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
    // Preserve create-review resume during paid checkout return (prepare/GET paint authority).
    try {
      const params = typeof window !== "undefined" ? new URL(window.location.href).searchParams : null;
      if (
        params?.get("premiumCompletion") === "1" ||
        readAfterPayRestoreAgreementIdFromSearch(params ? `?${params.toString()}` : search)
      ) {
        prevIntakeKeyRef.current = intakeKey;
        return;
      }
    } catch {
      /* ignore */
    }
    try {
      const grant = sessionStorage.getItem("claw_advanced_full_draft_checkout_ok_v1");
      const resume = sessionStorage.getItem("claw_create_complexity_resume_v1");
      if (grant && resume && /"awaitingProCheckout"\s*:\s*true/.test(resume)) {
        prevIntakeKeyRef.current = intakeKey;
        return;
      }
      const snapRaw = sessionStorage.getItem("claw_premium_completion_snapshot_v1");
      if (snapRaw && /"premiumAccepted"\s*:\s*true/.test(snapRaw)) {
        prevIntakeKeyRef.current = intakeKey;
        return;
      }
    } catch {
      /* ignore */
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
  const [dashboardSignerSetupResumeShell, setDashboardSignerSetupResumeShell] = useState(() =>
    Boolean(resumeSignerSetupAgreementId),
  );
  const onSimpleCreateShellChrome = useCallback(
    (state: {
      paidProReviewReady: boolean;
      freeStarterReviewShellActive: boolean;
      lifecycleStage: import("../../agreement/agreementLifecycleRail").AgreementLifecycleStageId;
      dashboardSignerSetupResumeActive?: boolean;
    }) => {
      setPaidProReviewReadyShell(state.paidProReviewReady);
      setFreeStarterReviewShellActive(state.freeStarterReviewShellActive);
      setShellLifecycleStage(state.lifecycleStage);
      setDashboardSignerSetupResumeShell(Boolean(state.dashboardSignerSetupResumeActive));
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
  const shellTitle = dashboardSignerSetupResumeShell
    ? SIMPLE_CREATE_SIGNER_SETUP_RESUME_TITLE
    : paidProReviewReadyShell
      ? SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE
      : quickSendTypedArrival
        ? "Shape your draft"
        : isFreshSimpleCreateStart
          ? SIMPLE_CREATE_STARTER_HERO_TITLE
          : "Describe your deal";
  const shellSubtitle = dashboardSignerSetupResumeShell
    ? SIMPLE_CREATE_SIGNER_SETUP_RESUME_SUBTITLE
    : paidProReviewReadyShell
      ? SIMPLE_CREATE_PAID_PRO_REVIEW_SUBTITLE
      : quickSendTypedArrival
        ? "We turned your input into a structured draft for the same send/sign/proof workflow."
        : isFreshSimpleCreateStart
          ? SIMPLE_CREATE_STARTER_HERO_SUBHEAD
          : "Start typing or speaking — LawDog auto-structures parties, term, scope, and obligations as you go (edit inline in preview). Review, share, or prepare for signing when you're ready.";
  const hideIntakeMarketingChrome =
    paidProReviewReadyShell ||
    homeTransitionVisible ||
    anonymousStarterReviewChrome ||
    hideAgreementEditor;
  const accessChoiceShell = showAccessChoiceScreen || editorGatedUntilEntitlement;

  if (coldReferralRedirect || (!isReallyAuthenticated && hasColdReferralInSearch)) {
    return (
      <SimpleFlowShell
        title="Continue with your invite"
        subtitle="Taking you to sign-in so we can apply your referral…"
        logoHomeHref="/"
        hideAffiliateNav
      >
        <p className="text-sm text-slate-400" data-testid="cold-referral-signin-redirect">
          Redirecting to sign-in…
        </p>
      </SimpleFlowShell>
    );
  }

  if (awaitingAuthWorkspace) {
    // Already-signed-in create/resume must not flash OAuth "Finishing sign-in".
    // When signer-setup resume is armed, keep that chrome so the settle does not
    // look like a create-prompt hop before the agreement preview mounts.
    const resumeSettling = dashboardSignerSetupResumeShell || Boolean(resumeSignerSetupAgreementId);
    const settlingSignedIn = isReallyAuthenticated;
    return (
      <SimpleFlowShell
        title={
          resumeSettling
            ? SIMPLE_CREATE_SIGNER_SETUP_RESUME_TITLE
            : settlingSignedIn
              ? "Opening create"
              : "Finishing sign-in"
        }
        subtitle={
          resumeSettling
            ? SIMPLE_CREATE_SIGNER_SETUP_RESUME_SUBTITLE
            : settlingSignedIn
              ? "Restoring your workspace…"
              : "Restoring your workspace before create…"
        }
        logoHomeHref="/app"
        hideAffiliateNav
      >
        <p className="text-sm text-slate-400" data-testid="create-auth-workspace-settling">
          {resumeSettling
            ? "Loading your agreement preview…"
            : settlingSignedIn
              ? "Confirming your workspace…"
              : "Confirming your signed-in workspace…"}
        </p>
      </SimpleFlowShell>
    );
  }

  return (
    <SimpleFlowShell
      step={accessChoiceShell ? undefined : shellStep}
      progressLabels={shellProgressLabels}
      hideHeader={anonymousStarterReviewChrome}
      logoHomeHref={anonymousStarterReviewChrome ? "/" : "/app"}
      hideAffiliateNav={anonymousStarterReviewChrome}
      kicker={
        paidProReviewReadyShell || accessChoiceShell
          ? undefined
          : quickSendTypedArrival
            ? "Starting from your typed agreement"
            : undefined
      }
      title={
        showAccessChoiceScreen
          ? CREATE_ACCESS_CHOICE_HEADING
          : editorGatedUntilEntitlement
            ? "Checking access"
            : shellTitle
      }
      subtitle={
        showAccessChoiceScreen || editorGatedUntilEntitlement ? undefined : shellSubtitle
      }
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
        {editorGatedUntilEntitlement ? (
          <div
            className="mx-auto max-w-lg py-10 text-center text-sm text-slate-400"
            data-testid="create-entitlement-loading"
            role="status"
          >
            Confirming your workspace access…
          </div>
        ) : null}

        {showAccessChoiceScreen ? (
          <CreateAccessChoicePanel
            showHeading={false}
            pendingGenesis={createAccessVerdict.reason === "pending_genesis"}
            requestBusy={genesisRequestBusy}
            hasAccessibleAgreement={hasAccessibleAgreement}
            onRequestGenesis={() => {
              logProductEvent("paywall_clicked_upgrade", {
                surface: "simple_create",
                variant: "access_choice_screen",
                cta: "request_genesis",
              });
              requestGenesisAccess();
            }}
            onChoosePro={() => {
              logProductEvent("paywall_clicked_upgrade", {
                surface: "simple_create",
                variant: "access_choice_screen",
                cta: "choose_pro",
              });
              navigate("/app/billing");
            }}
            onViewAgreement={() => {
              logProductEvent("paywall_clicked_view_existing", {
                surface: "simple_create",
                variant: "access_choice_screen",
              });
              navigate("/app/agreements");
            }}
            onBackToDashboard={() => {
              logProductEvent("paywall_dismissed", {
                surface: "simple_create",
                variant: "access_choice_screen",
                via: "return_dashboard",
              });
              navigate("/app");
            }}
          />
        ) : null}
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

        {!hideAgreementEditor && genesisAllowanceCopy ? (
          <div
            className="mb-4 rounded-lg border border-slate-700/70 bg-slate-950/40 px-4 py-2.5 text-xs text-slate-300"
            role="status"
            data-testid="genesis-allowance-indicator"
          >
            {genesisAllowanceCopy}
          </div>
        ) : null}

        {!hideAgreementEditor && proAllowanceCopy ? (
          <div
            className="mb-4 rounded-lg border border-slate-700/70 bg-slate-950/40 px-4 py-2.5 text-xs text-slate-300"
            role="status"
            data-testid="pro-allowance-indicator"
          >
            {proAllowanceCopy}
          </div>
        ) : null}

        {!hideAgreementEditor && freeAllowanceAvailable ? (
          <div
            className="mb-4 rounded-lg border border-slate-700/70 bg-slate-950/40 px-4 py-2.5 text-xs text-slate-300"
            role="status"
            data-testid="free-allowance-indicator"
          >
            {CREATE_FIRST_AGREEMENT_FREE_INLINE}
          </div>
        ) : null}

        {entitlementProbeBlocked ? (
          <div
            className="mb-4 rounded-lg border border-slate-600/50 bg-slate-900/50 px-4 py-3 text-sm text-slate-200"
            role="alert"
            data-testid="entitlement-probe-error"
          >
            <p className="font-medium text-slate-50">Couldn&apos;t verify your workspace access</p>
            <p className="mt-1 text-xs text-slate-400">
              This is a temporary connection or authorization issue — not a free-plan limit. Retry in a
              moment, or contact support if it continues.
            </p>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3"
              onClick={() => {
                if (authSession?.access_token) setCachedAccessToken(authSession.access_token);
                setCommercialEntitlementReady(false);
                void fetchCommercialEntitlement().then((decision) => {
                  setCommercialEntitlement(decision);
                  setCommercialEntitlementReady(true);
                });
              }}
            >
              Retry access check
            </button>
          </div>
        ) : null}

        {creationBlockedForUi && createAccessVerdict.showGenesisAllowanceExhausted ? (
          <div
            className="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-100/95"
            role="status"
          >
            <p className="font-medium text-amber-50">Genesis monthly allowance used</p>
            <p className="mt-1 text-xs text-amber-100/85">
              You&apos;ve used this month&apos;s Genesis Dog agreements. Your allowance renews on{" "}
              {commercialEntitlement?.periodEndsAt
                ? new Date(commercialEntitlement.periodEndsAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })
                : "the next period"}
              . Upgrade to Pro for more capacity.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="vs01-btn vs01-btn--primary vs01-btn--compact"
                onClick={() => {
                  logProductEvent("paywall_clicked_upgrade", {
                    surface: "simple_create",
                    variant: "genesis_allowance_exhausted_inline",
                  });
                  navigate("/app/billing");
                }}
              >
                Choose Pro
              </button>
            </div>
          </div>
        ) : null}

        {!hideAgreementEditor ? (
          <div className={intakeInteractionBlocked ? "pointer-events-none select-none opacity-60" : undefined}>
            <AgreementBuilderIntake
              key={intakeKey}
              className="vs01-agreement-intake rounded-xl border border-slate-800/90 bg-slate-950/35 p-4 sm:p-5"
              workspaceUi
              simpleProductFlow
              simpleProductTextareaPlaceholder={
                isFreshSimpleCreateStart ? FIRST_SESSION_CREATE_INTAKE_PLACEHOLDER : SIMPLE_CREATE_INTAKE_PLACEHOLDER
              }
              simpleProductFlowSubmitLabel={
                isFreshSimpleCreateStart ? "Create agreement" : quickSendTypedArrival ? "Review" : "Review"
              }
              simpleProductFollowUpSubmitLabel="Next"
              simpleProductFlowGeneratingLabel={
                quickSendTypedArrival || homeHeroAutoGenerate ? DRAFT_LOADING_PREPARING : undefined
              }
              homeHeroAutoGenerate={homeHeroAutoGenerate}
              checkoutBackRestoreActive={checkoutBackRestoreActive}
              openSignerSetupOnResume={openSignerSetupOnResume}
              resumeSignerSetupAgreementId={resumeSignerSetupAgreementId || null}
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
        ) : null}

        <UpgradeToProModal
          open={upgradeModalOpen && !showAccessChoiceScreen}
          onClose={() => setUpgradeModalOpen(false)}
          surface="simple_create"
          variant={
            createAccessVerdict.showGenesisAllowanceExhausted
              ? "genesis_allowance_exhausted"
              : createAccessVerdict.reason === "guest_draft"
                ? "guest_ready"
                : "upgrade_to_pro"
          }
          viewExistingPath="/app/agreements"
          showViewExistingAgreement={hasAccessibleAgreement}
          draftPreserved={draftPreservedForUpgrade}
          agreementAllowance={commercialEntitlement?.agreementAllowance ?? null}
          agreementsRemaining={commercialEntitlement?.agreementsRemaining ?? null}
          periodEndsAt={commercialEntitlement?.periodEndsAt ?? null}
          onRequestGenesis={() => {
            logProductEvent("paywall_clicked_upgrade", {
              surface: "simple_create",
              variant: "guest_ready",
              cta: "request_genesis",
            });
            requestGenesisAccess();
          }}
        />

        {!hideAgreementEditor && !(firstSessionLive && isFreshSimpleCreateStart) ? (
          <p className="mx-auto mt-4 max-w-xl text-center text-xs leading-relaxed text-slate-500 sm:text-[0.8125rem] md:text-sm lg:text-[0.9375rem] lg:leading-[1.55] lg:text-slate-400">
            Editable at every step. {STRUCTURED_DRAFT_ASSIST_SHORT} {PRODUCT_NOT_LAW_FIRM} {NO_ATTORNEY_CLIENT}
          </p>
        ) : null}
      </div>
    </SimpleFlowShell>
  );
}
