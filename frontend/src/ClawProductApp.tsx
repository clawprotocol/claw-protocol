import { useEffect, useState } from "react";
import { featureFlags } from "./config/featureFlags";
import { AppShell } from "./launch/AppShell";
import { AppDashboard } from "./launch/AppDashboard";
import { BillingPage } from "./launch/BillingPage";
import { LaunchHomePage } from "./launch/LaunchHomePage";
import { useLaunchNav } from "./launch/LaunchNavContext";
import { matchAppPath } from "./launch/routes";
import { AgreementMemoryPage } from "./launch/AgreementMemoryPage";
import { FieldReviewPage } from "./launch/documentLayout/FieldReviewPage";
import { QuickSendPage } from "./launch/simpleProduct/QuickSendPage";
import { SimpleCreatePage } from "./launch/simpleProduct/SimpleCreatePage";
import { SimpleDonePage } from "./launch/simpleProduct/SimpleDonePage";
import { OwnerSigningStatusPage } from "./launch/OwnerSigningStatusPage";
import { OwnerAgreementReadOnlyPage } from "./launch/simpleProduct/OwnerAgreementReadOnlyPage";
import { OwnerSignedAgreementPage } from "./launch/simpleProduct/OwnerSignedAgreementPage";
import { OwnerProposalReviewPage } from "./launch/simpleProduct/OwnerProposalReviewPage";
import { SimpleCheckoutPage } from "./launch/simpleProduct/SimpleCheckoutPage";
import { SimpleReadyToSendPage } from "./launch/simpleProduct/SimpleReadyToSendPage";
import { SimpleSendPage } from "./launch/simpleProduct/SimpleSendPage";
import { SimpleVerificationPage } from "./launch/simpleProduct/SimpleVerificationPage";
import { AdvancedWorkProductPage } from "./launch/AdvancedWorkProductPage";
import { AffiliateLandingPage } from "./launch/affiliate/AffiliateLandingPage";
import { parseAffiliateLandingPath } from "./launch/affiliate/affiliateLandingRoutes";
import { ClawOpportunityPage } from "./launch/affiliate/ClawOpportunityPage";
import { LawdogSettingsPage } from "./launch/LawdogSettingsPage";
import { AuthCallbackPage } from "./launch/AuthCallbackPage";
import { SignInPage } from "./launch/SignInPage";
import { LawdogSignaturesPage } from "./launch/LawdogSignaturesPage";
import { LawdogReferralRedirect, parseLawdogReferralPath } from "./launch/LawdogReferralRedirect";
import { AffiliatePayoutOpsPage } from "./launch/affiliate/AffiliatePayoutOpsPage";
import { GenesisAffiliateDashboardPage } from "./launch/genesisReferral/GenesisAffiliateDashboardPage";
import { GenesisReferralOpsPage } from "./launch/genesisReferral/GenesisReferralOpsPage";
import { AdminConsoleAccessGate, AdminConsoleUnavailable } from "./launch/AdminConsoleAccessGate";
import { AdminConsolePage } from "./launch/AdminConsolePage";
import {
  canAccessAdminConsoleWithoutServerAuth,
  isAdminConsoleDeploymentEnabled,
  requiresAdminConsoleServerAuth,
} from "./launch/adminConsoleAccess";
import { canAccessOperatorGrowthDashboard, OperatorGrowthDashboard } from "./launch/ops/OperatorGrowthDashboard";
import { OperatorPaidFunnelDashboard } from "./launch/ops/OperatorPaidFunnelDashboard";
import { OperatorStarterProRefineDashboard } from "./launch/ops/OperatorStarterProRefineDashboard";
import { UsageReceiptPage } from "./launch/UsageReceiptPage";
import { IntegrationsPage } from "./launch/IntegrationsPage";
import { AgreementPublicVerify } from "./agreement/AgreementPublicVerifyView";
import { parseAgreementVerifyPath } from "./agreement/agreementPublicVerify";
import {
  AgreementRecipientReview,
  parseAgreementReviewPath,
  parseAgreementSignPath,
  type RecipientLinkRole,
} from "./agreement/AgreementRecipientReview";
import { RecipientPublicReviewRoute } from "./agreement/RecipientPublicReviewRoute";
import {
  parseRecipientReviewRouteFlags,
  resolveLawdogViewerContextFromReviewRoute,
} from "./agreement/lawdogViewerContext";
import { AgreementWizardShell } from "./agreement/AgreementWizardShell";
import {
  fetchRecipientAccessPolicy,
  validateRecipientAccessToken,
} from "./agreement/recipientAccessApi";
import {
  fetchNegotiationReviewSessionStatus,
} from "./agreement/negotiationReviewSessionApi";
import {
  exchangeReviewFragmentBootstrapTokenOnce,
  getReviewFragmentBootstrapExchangePromise,
} from "./agreement/reviewFragmentBootstrapExchange";
import {
  getReviewFragmentBootstrapMetadata,
  takeReviewFragmentBootstrapTokenOnce,
} from "./agreement/reviewFragmentBootstrapToken";
import {
  invalidateNegotiationReviewSessionPresentation,
  setNegotiationReviewSessionAuth,
} from "./agreement/recipientReviewAuth";
import {
  logReviewerTokenMissing,
} from "./agreement/reviewerTokenPersistence";
import { stripRecipientAccessTokenQueryFromLocation } from "./agreement/recipientLinkUrlHygiene";
import { Vs01Layout, type Vs01LayoutHero } from "./vs01/Vs01Layout";
import { Vs01Wizard } from "./vs01/Vs01Wizard";
import { RecipientBootstrapBoundary } from "./vs01/RecipientBootstrapBoundary";
import { isVs01EmailLinkBootstrapSurface } from "./vs01/vs01FragmentBootstrapToken";
import { getVs01UrlBootstrap } from "./vs01/vs01UrlBootstrap";
import { readAgreementVs01BridgeSession } from "./launch/simpleProduct/agreementToVs01SigningBridge";
import { logVs01CopyContext, resolveVs01EsignShellCopy } from "./vs01/vs01EsignShellCopy";
import { isRecipientSigningPublicSurface } from "./launch/completedAgreementViewContext";
import { ClawPublicFeedView } from "./feed/ClawPublicFeedView";
import { parseClawPublicFeedPath } from "./feed/clawPublicFeed";
import { TermsPage } from "./launch/legal/TermsPage";
import { PrivacyPage } from "./launch/legal/PrivacyPage";
import { AffiliateTermsPage } from "./launch/legal/AffiliateTermsPage";
import { PaidProReviewUxVisualPage } from "./qa/PaidProReviewUxVisualPage";
import { handleCheckoutReturnEntitlement } from "./launch/checkoutReturnEntitlement";
import { NotFoundPage } from "./launch/NotFoundPage";
import { LaunchFailureState } from "./launch/LaunchFailureState";
import { LaunchRouteRedirect } from "./launch/LaunchRouteRedirect";
import {
  isLegacyAgreementCreateRoute,
  resolveLegacyAgreementCreateRedirect,
} from "./launch/gtmLaunchRoutes";

const RECIPIENT_SIGNING_HERO: Vs01LayoutHero = {
  title: "Review and sign",
  subtitle: "Complete your assigned fields below, then finish signing.",
};

const VERIFY_HERO: Vs01LayoutHero = {
  eyebrow: "CLAW",
  title: "Public verification",
  subtitle:
    "Read-only summary, version hashes, and signature events for this agreement — no negotiation or edits from this page.",
  tagline: "Share this link for third parties to confirm status and cryptographic proof metadata.",
};

const FEED_HERO: Vs01LayoutHero = {
  eyebrow: "CLAW",
  title: "Public feed",
  subtitle:
    "Opt-in, redacted highlights of agreement milestones — anchored when the worker is configured.",
  tagline: "Trust-first summaries; open an item for the safe verify view.",
};

function AgreementSignGate(props: {
  agreementId: string;
  token?: string;
  legacyVersionId?: string;
  participantPartyId?: string;
  onClose: () => void;
}) {
  const { agreementId, token, legacyVersionId, participantPartyId, onClose } = props;
  const [phase, setPhase] = useState<"loading" | "ready" | "bad">("loading");
  const [lockedVersionId, setLockedVersionId] = useState("");
  const [resolvedPartyId, setResolvedPartyId] = useState<string | undefined>(undefined);
  const [badMessage, setBadMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const policy = await fetchRecipientAccessPolicy();
      if (token) {
        const vr = await validateRecipientAccessToken(token, agreementId);
        if (cancel) return;
        if (
          vr.ok &&
          vr.data.mode === "sign" &&
          vr.data.agreement_id === agreementId &&
          vr.data.locked_version_id
        ) {
          setBadMessage(null);
          setLockedVersionId(vr.data.locked_version_id);
          const fromTok = (vr.data.recipient_party_id || "").trim();
          const fromUrl = (participantPartyId || "").trim();
          setResolvedPartyId(fromTok || fromUrl || undefined);
          stripRecipientAccessTokenQueryFromLocation();
          setPhase("ready");
        } else {
          setBadMessage(vr.ok ? null : vr.message);
          setPhase("bad");
        }
        return;
      }
      if (policy?.recipient_link_token_required) {
        if (!cancel) {
          setBadMessage(
            "This link is invalid or expired. Request a new link from the sender."
          );
          setPhase("bad");
        }
        return;
      }
      if (!legacyVersionId) {
        if (!cancel) {
          setBadMessage(
            "This link is invalid or expired. Request a new link from the sender."
          );
          setPhase("bad");
        }
        return;
      }
      setBadMessage(null);
      setLockedVersionId(legacyVersionId);
      setResolvedPartyId((participantPartyId || "").trim() || undefined);
      if (!cancel) setPhase("ready");
    })();
    return () => {
      cancel = true;
    };
  }, [agreementId, token, legacyVersionId, participantPartyId]);

  if (phase === "loading") {
    return <p className="px-4 py-8 text-center text-sm text-slate-400">Validating link…</p>;
  }
  if (phase === "bad") {
    return (
      <LaunchFailureState
        kind="invalid_link"
        variant="envelope"
        message={
          badMessage?.trim() ||
          "This link is invalid or expired. Request a new link from the sender."
        }
        primaryAction={{ label: "Go to home", onClick: onClose }}
      />
    );
  }
  const accessGate = token ? { lockedVersionId } : undefined;
  return (
    <AgreementRecipientReview
      agreementId={agreementId}
      entry={{ kind: "sign", lockedVersionId, accessGate }}
      recipientLinkRole="signer"
      participantPartyId={resolvedPartyId || participantPartyId || ""}
      recipientAccessToken={(token || "").trim()}
      onClose={onClose}
    />
  );
}

/** Legacy `/app/esign/new` → unified Quick flow (compatibility). */
function RedirectEsignNewToQuick({ search }: { search: string }) {
  const { navigate } = useLaunchNav();
  useEffect(() => {
    const raw = search?.startsWith("?") ? search.slice(1) : search || "";
    const sp = new URLSearchParams(raw);
    if (!sp.get("start")) sp.set("start", "pdf");
    const qs = sp.toString();
    navigate(qs ? `/app/quick?${qs}` : "/app/quick?start=pdf");
  }, [navigate, search]);
  return (
    <div className="px-4 py-16 text-center text-sm text-slate-400" role="status">
      Opening Quick…
    </div>
  );
}

function mapApiRoleToRecipientLinkRole(r: string | undefined): RecipientLinkRole | undefined {
  const x = (r || "").toLowerCase();
  if (x === "signer") return "signer";
  if (x === "reviewer") return "reviewer";
  if (x === "recipient") return "reviewer";
  return undefined;
}

export function AgreementReviewGate(props: {
  agreementId: string;
  token?: string;
  recipientLinkRole?: RecipientLinkRole;
  participantPartyId?: string;
  recipientViewerContext?: import("./agreement/lawdogViewerContext").LawdogViewerContext;
  qaOwnerReturnPath?: string | null;
  onRecipientPostApprovalPresentationChange?: (
    presentation: import("./agreement/recipientApprovedWaitingPresentation").RecipientPostApprovalPresentation | null,
  ) => void;
  onClose: () => void;
}) {
  const {
    agreementId,
    token,
    recipientLinkRole,
    participantPartyId,
    recipientViewerContext,
    qaOwnerReturnPath,
    onRecipientPostApprovalPresentationChange,
    onClose,
  } = props;
  const [phase, setPhase] = useState<"loading" | "ready" | "bad">("loading");
  const [gateVid, setGateVid] = useState<string | undefined>(undefined);
  const [tokenValidated, setTokenValidated] = useState(false);
  const [sessionAuthenticated, setSessionAuthenticated] = useState(false);
  const [resolvedRole, setResolvedRole] = useState<RecipientLinkRole | undefined>(undefined);
  const [resolvedPartyId, setResolvedPartyId] = useState<string | undefined>(undefined);
  const [inviterName, setInviterName] = useState<string | undefined>(undefined);
  const [badMessage, setBadMessage] = useState<string | null>(null);
  const [validatedAccessToken, setValidatedAccessToken] = useState("");

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setNegotiationReviewSessionAuth(false);

      const applySessionStatus = (
        status: Awaited<ReturnType<typeof fetchNegotiationReviewSessionStatus>>,
      ): boolean => {
        if (!status.authenticated || status.agreement_id !== agreementId) {
          return false;
        }
        setNegotiationReviewSessionAuth(true);
        setSessionAuthenticated(true);
        setTokenValidated(true);
        setValidatedAccessToken("");
        const lv = (status.locked_version_id || "").trim();
        setGateVid(lv || undefined);
        const mr = mapApiRoleToRecipientLinkRole(
          typeof status.role === "string" ? status.role : undefined,
        );
        setResolvedRole(mr);
        const pid = (status.recipient_party_id || participantPartyId || "").trim();
        setResolvedPartyId(pid || undefined);
        setBadMessage(null);
        setPhase("ready");
        return true;
      };

      const fragmentToken = takeReviewFragmentBootstrapTokenOnce();
      if (fragmentToken) {
        let result: Awaited<ReturnType<typeof exchangeReviewFragmentBootstrapTokenOnce>>;
        try {
          result = await exchangeReviewFragmentBootstrapTokenOnce(fragmentToken, agreementId);
        } catch {
          if (cancel) return;
          invalidateNegotiationReviewSessionPresentation();
          setBadMessage(
            "This link is invalid or expired. Request a new link from the sender.",
          );
          setPhase("bad");
          return;
        }
        if (cancel) return;
        if (result.ok) {
          if (!applySessionStatus(result.status)) {
            invalidateNegotiationReviewSessionPresentation();
            setBadMessage(
              "This link is invalid or expired. Request a new link from the sender.",
            );
            setPhase("bad");
            return;
          }
          return;
        }
        setBadMessage(result.message);
        setPhase("bad");
        return;
      }

      const inFlight = getReviewFragmentBootstrapExchangePromise(agreementId);
      if (inFlight) {
        let result: Awaited<ReturnType<typeof exchangeReviewFragmentBootstrapTokenOnce>>;
        try {
          result = await inFlight;
        } catch {
          if (cancel) return;
          invalidateNegotiationReviewSessionPresentation();
          setBadMessage(
            "This link is invalid or expired. Request a new link from the sender.",
          );
          setPhase("bad");
          return;
        }
        if (cancel) return;
        if (result.ok) {
          if (!applySessionStatus(result.status)) {
            invalidateNegotiationReviewSessionPresentation();
            setBadMessage(
              "This link is invalid or expired. Request a new link from the sender.",
            );
            setPhase("bad");
            return;
          }
          return;
        }
        setBadMessage(result.message);
        setPhase("bad");
        return;
      }

      const meta = getReviewFragmentBootstrapMetadata();
      if (meta?.hadFragmentToken) {
        setBadMessage("This link is invalid or expired. Request a new link from the sender.");
        setPhase("bad");
        return;
      }

      let sessionReadiness: string | undefined;
      try {
        const sessionStatus = await fetchNegotiationReviewSessionStatus();
        sessionReadiness = sessionStatus.readiness;
        if (cancel) return;
        if (applySessionStatus(sessionStatus)) {
          return;
        }
        if (sessionReadiness === "session_invalid") {
          invalidateNegotiationReviewSessionPresentation();
          setBadMessage(
            "This review session is invalid, expired, or no longer available. Request a new link from the sender.",
          );
          setPhase("bad");
          return;
        }
      } catch {
        if (!cancel) {
          setBadMessage("We could not verify your review session. Check your connection and try again.");
          setPhase("bad");
        }
        return;
      }

      const policy = await fetchRecipientAccessPolicy();
      const urlTok = (token || "").trim();
      const authorityBoundReviewRoute = Boolean(agreementId.trim());
      const anonymousPreviewAllowed =
        policy?.review_anonymous_preview_allowed === true && !authorityBoundReviewRoute;

      if (urlTok) {
        const vr = await validateRecipientAccessToken(urlTok, agreementId);
        if (cancel) return;
        if (vr.ok && vr.data.mode === "review" && vr.data.agreement_id === agreementId) {
          setBadMessage(null);
          const lv = (vr.data.locked_version_id || "").trim();
          setGateVid(lv || undefined);
          setTokenValidated(true);
          const mr = mapApiRoleToRecipientLinkRole(
            typeof vr.data.role === "string" ? vr.data.role : undefined,
          );
          setResolvedRole(mr);
          const pid = (vr.data.recipient_party_id || participantPartyId || "").trim();
          setResolvedPartyId(pid || undefined);
          const inv = (vr.data.inviter_display_name || "").trim();
          setInviterName(inv || undefined);
          setValidatedAccessToken(urlTok);
          stripRecipientAccessTokenQueryFromLocation();
          setPhase("ready");
        } else {
          setBadMessage(vr.ok ? null : vr.message);
          setPhase("bad");
        }
        return;
      }

      logReviewerTokenMissing({
        agreementId,
        reason: policy?.recipient_link_token_required ? "token_required" : "preview_route",
      });
      setValidatedAccessToken("");
      if (!anonymousPreviewAllowed) {
        if (!cancel) {
          setBadMessage(
            "This link is invalid or expired. Request a new link from the sender.",
          );
          setPhase("bad");
        }
        return;
      }
      setBadMessage(null);
      setGateVid(undefined);
      setTokenValidated(false);
      setSessionAuthenticated(false);
      setResolvedRole(undefined);
      setResolvedPartyId(undefined);
      setInviterName(undefined);
      if (!cancel) setPhase("ready");
    })();
    return () => {
      cancel = true;
    };
  }, [agreementId, token, participantPartyId]);

  useEffect(() => {
    return () => {
      setNegotiationReviewSessionAuth(false);
    };
  }, []);

  if (phase === "loading") {
    return <p className="px-4 py-8 text-center text-sm text-slate-400">Validating link…</p>;
  }
  if (phase === "bad") {
    return (
      <LaunchFailureState
        kind="invalid_link"
        variant="envelope"
        message={
          badMessage?.trim() ||
          "This link is invalid or expired. Request a new link from the sender."
        }
        primaryAction={{ label: "Go to home", onClick: onClose }}
      />
    );
  }
  const entry =
    gateVid && tokenValidated
      ? { kind: "review" as const, accessGate: { lockedVersionId: gateVid } }
      : { kind: "review" as const };
  const roleOut = resolvedRole ?? recipientLinkRole ?? "reviewer";
  const partyOut = (resolvedPartyId || participantPartyId || "").trim();
  const accessTokOut = sessionAuthenticated ? "" : validatedAccessToken || (token || "").trim();
  return (
    <AgreementRecipientReview
      agreementId={agreementId}
      entry={entry}
      recipientLinkRole={roleOut}
      participantPartyId={partyOut}
      inviterDisplayNameOverride={inviterName || ""}
      recipientAccessToken={accessTokOut}
      negotiationReviewSessionAuth={sessionAuthenticated}
      recipientViewerContext={recipientViewerContext ?? "public_recipient"}
      qaOwnerReturnPath={qaOwnerReturnPath ?? null}
      onRecipientPostApprovalPresentationChange={onRecipientPostApprovalPresentationChange}
      onClose={onClose}
    />
  );
}

/** `/app/esign/:id` — supports `?agreement_bridge=1` paid Pro VS01 handoff (see resolveVs01EsignShellCopy). */
function AppEsignDocumentShell(props: { seed: string; search: string; pathname: string }) {
  const { seed, search, pathname } = props;
  const [vs01Step, setVs01Step] = useState(0);
  const bridge = typeof window !== "undefined" ? readAgreementVs01BridgeSession() : null;
  const shellCopy = resolveVs01EsignShellCopy({ search, seedDocumentId: seed, bridge, vs01Step });
  const recipientPublicSigning = isRecipientSigningPublicSurface(pathname, search);
  const navMode = recipientPublicSigning
    ? "public_completed"
    : shellCopy.navVariant === "esign_bridge_focused"
      ? "esign_bridge_focused"
      : "default";

  useEffect(() => {
    const b = typeof window !== "undefined" ? readAgreementVs01BridgeSession() : null;
    const sc = resolveVs01EsignShellCopy({ search, seedDocumentId: seed, bridge: b, vs01Step });
    logVs01CopyContext({
      documentId: seed,
      agreementBridge: sc.agreementBridgeEffective,
      bridgeSource: b?.source ?? null,
      signerFirst: b?.signerFirst ?? null,
      agreementBridgeMode: b?.agreementBridgeMode ?? null,
      ownerIsPreparingPacket: b?.ownerIsPreparingPacket ?? null,
      navVariant: sc.navVariant,
      titleCopy: sc.title,
      copyVariant: sc.copyVariant,
      reviewerApprovedCleanHandoff: Boolean(b?.reviewerApprovedCleanHandoff),
      vs01Step,
    });
  }, [seed, search, vs01Step]);

  return (
    <AppShell
      title={shellCopy.title}
      subtitle={shellCopy.subtitle}
      navMode={navMode}
    >
      <Vs01Wizard key={`esign-${seed}`} seedDocumentId={seed} hideStepper onStepChange={setVs01Step} />
    </AppShell>
  );
}

/**
 * v1 product shell: launch → VS01 e-sign or agreement wizard. Reuses existing flows and APIs only.
 */
export function ClawProductApp() {
  const { pathname, search, navigate } = useLaunchNav();

  useEffect(() => {
    void handleCheckoutReturnEntitlement();
  }, []);
  const recipientSignBootstrap = typeof window !== "undefined" ? getVs01UrlBootstrap() : null;
  const agreementSignInfo = !recipientSignBootstrap ? parseAgreementSignPath(pathname, search) : null;
  const reviewInfo =
    !recipientSignBootstrap && !agreementSignInfo ? parseAgreementReviewPath(pathname, search) : null;
  const verifyInfo =
    !recipientSignBootstrap && !agreementSignInfo && !reviewInfo
      ? parseAgreementVerifyPath(pathname)
      : null;
  const feedPublic =
    !recipientSignBootstrap && !agreementSignInfo && !reviewInfo && !verifyInfo
      ? parseClawPublicFeedPath(pathname)
      : false;

  const appMatch = matchAppPath(pathname);
  const pathNorm = (pathname.replace(/\/$/, "") || "/").split("?")[0];
  const affiliateLanding = parseAffiliateLandingPath(pathNorm);
  const lawdogReferralSlug = parseLawdogReferralPath(pathNorm);

  if (import.meta.env.DEV && pathNorm === "/dev/qa/paid-pro-review-ux") {
    return <PaidProReviewUxVisualPage />;
  }

  if (pathNorm === "/terms") {
    return <TermsPage />;
  }
  if (pathNorm === "/privacy") {
    return <PrivacyPage />;
  }
  if (pathNorm === "/affiliate-terms") {
    return <AffiliateTermsPage />;
  }

  if (recipientSignBootstrap) {
    return (
      <Vs01Layout
        hero={RECIPIENT_SIGNING_HERO}
        recipientPublicFooter
      >
        <Vs01Wizard />
      </Vs01Layout>
    );
  }

  const vs01EmailLinkBootstrap = isVs01EmailLinkBootstrapSurface(pathname, search || "");
  const vs01EmailLinkSeedMatch = pathname.match(/\/app\/esign\/([^/?#]+)/);
  const vs01EmailLinkSeed = (vs01EmailLinkSeedMatch?.[1] ?? "").trim();
  if (vs01EmailLinkBootstrap && vs01EmailLinkSeed) {
    return (
      <Vs01Layout hero={RECIPIENT_SIGNING_HERO} recipientPublicFooter>
        <RecipientBootstrapBoundary seedDocumentId={vs01EmailLinkSeed} />
      </Vs01Layout>
    );
  }

  if (agreementSignInfo) {
    return (
      <Vs01Layout
        hero={RECIPIENT_SIGNING_HERO}
        logoHomeHref="/"
        productNav={{ label: "← Home", onClick: () => navigate("/") }}
        recipientPublicFooter
      >
        <div className="vs01-card vs01-card--envelope">
          <AgreementSignGate
            agreementId={agreementSignInfo.agreementId}
            token={agreementSignInfo.token}
            legacyVersionId={agreementSignInfo.versionId}
            participantPartyId={agreementSignInfo.participantPartyId}
            onClose={() => navigate("/")}
          />
        </div>
      </Vs01Layout>
    );
  }

  if (reviewInfo) {
    const reviewRouteFlags = parseRecipientReviewRouteFlags(search);
    const reviewViewerContext = resolveLawdogViewerContextFromReviewRoute(search);
    return (
      <RecipientPublicReviewRoute
        agreementId={reviewInfo.agreementId}
        viewerContext={reviewViewerContext}
        ownerReturnPath={reviewRouteFlags.ownerReturnPath}
        token={reviewInfo.token}
        recipientLinkRole={reviewInfo.role}
        participantPartyId={reviewInfo.participantPartyId}
        onClose={() => navigate("/")}
        reviewGate={(gateProps) => (
          <AgreementReviewGate
            key={`${gateProps.agreementId}:${gateProps.token ?? ""}:${gateProps.participantPartyId ?? ""}`}
            agreementId={gateProps.agreementId}
            token={gateProps.token}
            recipientLinkRole={gateProps.recipientLinkRole}
            participantPartyId={gateProps.participantPartyId}
            recipientViewerContext={gateProps.viewerContext}
            qaOwnerReturnPath={gateProps.qaOwnerReturnPath}
            onRecipientPostApprovalPresentationChange={gateProps.onRecipientPostApprovalPresentationChange}
            onClose={gateProps.onClose}
          />
        )}
      />
    );
  }

  if (verifyInfo) {
    return (
      <Vs01Layout
        hero={VERIFY_HERO}
        logoHomeHref="/"
        productNav={{ label: "← Home", onClick: () => navigate("/") }}
        recipientPublicFooter
      >
        <div className="vs01-card vs01-card--envelope">
          <AgreementPublicVerify
            agreementId={verifyInfo.agreementId}
            onClose={() => navigate("/")}
          />
        </div>
      </Vs01Layout>
    );
  }

  if (feedPublic) {
    if (!featureFlags.publicFeed) {
      return (
        <LaunchFailureState
          kind="forbidden"
          message="The public feed is not enabled in this deployment."
          detail="This route is reserved for opt-in public highlights when the feature is turned on."
          primaryAction={{ label: "Go to home", onClick: () => navigate("/") }}
        />
      );
    }
    return (
      <Vs01Layout
        hero={FEED_HERO}
        logoHomeHref="/"
        productNav={{ label: "← Home", onClick: () => navigate("/") }}
        recipientPublicFooter
      >
        <div className="vs01-card vs01-card--envelope">
          <ClawPublicFeedView onClose={() => navigate("/")} />
        </div>
      </Vs01Layout>
    );
  }

  if (affiliateLanding) {
    return <AffiliateLandingPage mode={affiliateLanding.mode} usernameSlug={affiliateLanding.usernameSlug} />;
  }

  if (lawdogReferralSlug) {
    return <LawdogReferralRedirect userSlug={lawdogReferralSlug} />;
  }

  if (appMatch?.kind === "adminConsole" && !isAdminConsoleDeploymentEnabled()) {
    return <AdminConsoleUnavailable />;
  }

  if (appMatch?.kind === "affiliatePayoutOps" && !featureFlags.affiliateAdminUi) {
    return (
      <LaunchFailureState
        kind="forbidden"
        message="Affiliate operator tools are not available in this deployment."
        detail="This page is for internal payout and ops work only."
        primaryAction={{ label: "Back to dashboard", onClick: () => navigate("/app") }}
      />
    );
  }

  if (
    (appMatch?.kind === "opsGrowth" ||
      appMatch?.kind === "opsPaidFunnel" ||
      appMatch?.kind === "opsStarterProRefine") &&
    !canAccessOperatorGrowthDashboard()
  ) {
    return (
      <LaunchFailureState
        kind="forbidden"
        message="Operator analytics routes are not available in this deployment."
        detail="These dashboards are reserved for internal operator builds."
        primaryAction={{ label: "Back to dashboard", onClick: () => navigate("/app") }}
      />
    );
  }

  if (isLegacyAgreementCreateRoute(pathname)) {
    return (
      <LaunchRouteRedirect
        to={resolveLegacyAgreementCreateRedirect(search)}
        label="Opening create…"
      />
    );
  }

  if (appMatch) {
    switch (appMatch.kind) {
      case "simpleCreate":
        return <SimpleCreatePage />;
      case "simpleReady":
        return <SimpleReadyToSendPage agreementId={appMatch.agreementId} />;
      case "simpleCheckout":
        return <SimpleCheckoutPage agreementId={appMatch.agreementId} />;
      case "simpleSend":
        return <SimpleSendPage agreementId={appMatch.agreementId} />;
      case "simpleDone":
        return <SimpleDonePage agreementId={appMatch.agreementId} />;
      case "ownerProposalReview":
        return <OwnerProposalReviewPage agreementId={appMatch.agreementId} />;
      case "ownerAgreementView":
        return <OwnerAgreementReadOnlyPage agreementId={appMatch.agreementId} />;
      case "ownerSignedAgreementView":
        return <OwnerSignedAgreementPage agreementId={appMatch.agreementId} />;
      case "ownerSigningStatus":
        return <OwnerSigningStatusPage agreementId={appMatch.agreementId} />;
      case "simpleVerification":
        return <SimpleVerificationPage agreementId={appMatch.agreementId} />;
      case "quickSend":
        return <QuickSendPage />;
      case "dashboard":
        return <AppDashboard />;
      case "billing":
        return <BillingPage />;
      case "affiliate":
        return <ClawOpportunityPage />;
      case "settings":
        return <LawdogSettingsPage />;
      case "signIn":
        return <SignInPage />;
      case "authCallback":
        return <AuthCallbackPage />;
      case "signatures":
        return <LawdogSignaturesPage />;
      case "agreementMemory":
        return <AgreementMemoryPage />;
      case "integrations":
        return <IntegrationsPage />;
      case "fieldReview":
        return <FieldReviewPage analysisId={appMatch.analysisId} />;
      case "advancedWorkProduct":
        return <AdvancedWorkProductPage />;
      case "opportunity":
        return <ClawOpportunityPage />;
      case "affiliatePayoutOps":
        return <AffiliatePayoutOpsPage />;
      case "genesisReferral":
        return <GenesisAffiliateDashboardPage />;
      case "opsGenesisReferral":
        return <GenesisReferralOpsPage />;
      case "opsGrowth":
        return (
          <AppShell title="Operator — Growth" subtitle="Funnel, experiments, and share metrics (local browser data).">
            <OperatorGrowthDashboard />
          </AppShell>
        );
      case "opsPaidFunnel":
        return (
          <AppShell title="Operator — Paid funnel (Pro)" subtitle="Local rows for the LawDog Pro conversion path.">
            <OperatorPaidFunnelDashboard />
          </AppShell>
        );
      case "opsStarterProRefine":
        return (
          <AppShell
            title="Operator — Starter Pro Refine"
            subtitle="Local experiment stats (this browser; same storage as growth ops)."
          >
            <OperatorStarterProRefineDashboard />
          </AppShell>
        );
      case "adminConsole":
        if (requiresAdminConsoleServerAuth()) {
          return <AdminConsoleAccessGate />;
        }
        if (canAccessAdminConsoleWithoutServerAuth()) {
          return <AdminConsolePage />;
        }
        return <AdminConsoleUnavailable />;
      case "receipt":
        return <UsageReceiptPage usageId={appMatch.id} />;
      case "agreements": {
        const sub = appMatch.sub;
        const shellKey =
          sub === "list" ? "agreements-list" : sub === "new" ? "agreements-new" : `agreements-${sub.id}`;
        const title =
          sub === "list" ? "Agreements" : sub === "new" ? "New agreement" : "Agreement";
        const subtitle =
          sub === "list"
            ? "Open a saved draft or start a new one from the dashboard."
            : sub === "new"
              ? "Describe the deal in plain language — we’ll help structure the draft."
              : "Resume drafting, recipients, and finalize when you’re ready.";
        return (
          <AppShell title={title} subtitle={subtitle}>
            <AgreementWizardShell
              key={shellKey}
              startFreshWizard={sub === "new"}
              openAgreementId={typeof sub === "object" && "id" in sub ? sub.id : null}
            />
          </AppShell>
        );
      }
      case "esign": {
        const sub = appMatch.sub;
        if (sub === "new") {
          return <RedirectEsignNewToQuick search={search} />;
        }
        const seed = sub.id;
        return <AppEsignDocumentShell seed={seed} search={search || ""} pathname={pathname} />;
      }
      default:
        break;
    }
  }

  if (pathNorm === "/") {
    return <LaunchHomePage />;
  }

  return <NotFoundPage />;
}
