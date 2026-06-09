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
import { SimpleCheckoutPage } from "./launch/simpleProduct/SimpleCheckoutPage";
import { SimpleReadyToSendPage } from "./launch/simpleProduct/SimpleReadyToSendPage";
import { SimpleSendPage } from "./launch/simpleProduct/SimpleSendPage";
import { SimpleVerificationPage } from "./launch/simpleProduct/SimpleVerificationPage";
import { AdvancedWorkProductPage } from "./launch/AdvancedWorkProductPage";
import { AffiliateLandingPage } from "./launch/affiliate/AffiliateLandingPage";
import { parseAffiliateLandingPath } from "./launch/affiliate/affiliateLandingRoutes";
import { ClawOpportunityPage } from "./launch/affiliate/ClawOpportunityPage";
import { LawdogAffiliatePage } from "./launch/LawdogAffiliatePage";
import { LawdogSettingsPage } from "./launch/LawdogSettingsPage";
import { LawdogSignaturesPage } from "./launch/LawdogSignaturesPage";
import { LawdogReferralRedirect, parseLawdogReferralPath } from "./launch/LawdogReferralRedirect";
import { AffiliatePayoutOpsPage } from "./launch/affiliate/AffiliatePayoutOpsPage";
import { GenesisAffiliateDashboardPage } from "./launch/genesisReferral/GenesisAffiliateDashboardPage";
import { GenesisReferralOpsPage } from "./launch/genesisReferral/GenesisReferralOpsPage";
import { AdminConsolePage } from "./launch/AdminConsolePage";
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
  loadRecipientMagicLinkSession,
  saveRecipientMagicLinkSession,
} from "./agreement/recipientMagicLinkSession";
import {
  loadAnyRecipientMagicLinkSessionForAgreement,
  logReviewerTokenDetected,
  logReviewerTokenMissing,
  logReviewerTokenPersisted,
  reviewerTokenHashShort,
} from "./agreement/reviewerTokenPersistence";
import { recipientLinkTokenFingerprint } from "./agreement/recipientLinkTokenFingerprint";
import { stripRecipientAccessTokenQueryFromLocation } from "./agreement/recipientLinkUrlHygiene";
import { logRecipientReviewTokenResolved } from "./components/agreements/reviewFlowDebugLog";
import { Vs01Layout, type Vs01LayoutHero } from "./vs01/Vs01Layout";
import { Vs01Wizard } from "./vs01/Vs01Wizard";
import { getVs01UrlBootstrap } from "./vs01/vs01UrlBootstrap";
import { readAgreementVs01BridgeSession } from "./launch/simpleProduct/agreementToVs01SigningBridge";
import { logVs01CopyContext, resolveVs01EsignShellCopy } from "./vs01/vs01EsignShellCopy";
import { ClawPublicFeedView } from "./feed/ClawPublicFeedView";
import { parseClawPublicFeedPath } from "./feed/clawPublicFeed";
import { TermsPage } from "./launch/legal/TermsPage";
import { PrivacyPage } from "./launch/legal/PrivacyPage";
import { AffiliateTermsPage } from "./launch/legal/AffiliateTermsPage";
import { PaidProReviewUxVisualPage } from "./qa/PaidProReviewUxVisualPage";

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
      <p className="px-4 py-8 text-center text-sm text-rose-300">
        {badMessage?.trim() ||
          "This link is invalid or expired. Request a new link from the sender."}
      </p>
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

function AgreementReviewGate(props: {
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
  const [resolvedRole, setResolvedRole] = useState<RecipientLinkRole | undefined>(undefined);
  const [resolvedPartyId, setResolvedPartyId] = useState<string | undefined>(undefined);
  const [inviterName, setInviterName] = useState<string | undefined>(undefined);
  const [badMessage, setBadMessage] = useState<string | null>(null);
  const [validatedAccessToken, setValidatedAccessToken] = useState("");

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const policy = await fetchRecipientAccessPolicy();
      const urlTok = (token || "").trim();
      const sessionForAgreement = urlTok
        ? loadRecipientMagicLinkSession(agreementId, urlTok)
        : loadAnyRecipientMagicLinkSessionForAgreement(agreementId);
      const effectiveToken =
        urlTok || sessionForAgreement?.token?.trim() || "";
      const tokenSource = urlTok ? "url" : sessionForAgreement?.token ? "session" : "none";

      if (effectiveToken) {
        logReviewerTokenDetected({
          agreementId,
          source: tokenSource,
          tokenHashShort: reviewerTokenHashShort(effectiveToken),
          participantPartyIdFromSession: sessionForAgreement?.recipientPartyId ?? null,
        });
        const vr = await validateRecipientAccessToken(effectiveToken, agreementId);
        if (cancel) return;
        if (vr.ok && vr.data.mode === "review" && vr.data.agreement_id === agreementId) {
          setBadMessage(null);
          const lv = (vr.data.locked_version_id || "").trim();
          setGateVid(lv || undefined);
          setTokenValidated(true);
          const mr = mapApiRoleToRecipientLinkRole(
            typeof vr.data.role === "string" ? vr.data.role : undefined
          );
          setResolvedRole(mr);
          const pid = (vr.data.recipient_party_id || sessionForAgreement?.recipientPartyId || participantPartyId || "").trim();
          setResolvedPartyId(pid || undefined);
          const inv = (vr.data.inviter_display_name || "").trim();
          setInviterName(inv || undefined);
          saveRecipientMagicLinkSession({
            agreementId,
            token: effectiveToken,
            recipientPartyId: pid || undefined,
            recipientLinkRole: mr,
            inviterDisplayName: inv || undefined,
          });
          setValidatedAccessToken(effectiveToken);
          if (urlTok) {
            stripRecipientAccessTokenQueryFromLocation();
          }
          logReviewerTokenPersisted({
            agreementId,
            tokenHashShort: reviewerTokenHashShort(effectiveToken),
            participantPartyId: pid || null,
            tokenSource,
          });
          const aid = agreementId.trim();
          const agreementIdShort = aid.length <= 12 ? aid : `${aid.slice(0, 8)}…`;
          logRecipientReviewTokenResolved({
            agreementIdShort,
            reviewerRecipientId: pid || null,
            partyIndex: null,
            reviewerStatus: "validated",
            tokenScopeValid: true,
            tokenHashShort: recipientLinkTokenFingerprint(effectiveToken),
          });
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
      if (policy?.recipient_link_token_required) {
        if (!cancel) {
          setBadMessage(
            "This link is invalid or expired. Request a new link from the sender."
          );
          setPhase("bad");
        }
        return;
      }
      setBadMessage(null);
      setGateVid(undefined);
      setTokenValidated(false);
      setResolvedRole(undefined);
      setResolvedPartyId(undefined);
      setInviterName(undefined);
      if (!cancel) setPhase("ready");
    })();
    return () => {
      cancel = true;
    };
  }, [agreementId, token]);

  if (phase === "loading") {
    return <p className="px-4 py-8 text-center text-sm text-slate-400">Validating link…</p>;
  }
  if (phase === "bad") {
    return (
      <p className="px-4 py-8 text-center text-sm text-rose-300">
        {badMessage?.trim() ||
          "This link is invalid or expired. Request a new link from the sender."}
      </p>
    );
  }
  const entry =
    gateVid && tokenValidated
      ? { kind: "review" as const, accessGate: { lockedVersionId: gateVid } }
      : { kind: "review" as const };
  const roleOut = resolvedRole ?? recipientLinkRole ?? "reviewer";
  const sessionParty =
    loadAnyRecipientMagicLinkSessionForAgreement(agreementId)?.recipientPartyId?.trim() || "";
  const partyOut = (resolvedPartyId || participantPartyId || sessionParty || "").trim();
  const urlTokPass = (token || "").trim();
  const accessTokOut =
    validatedAccessToken ||
    urlTokPass ||
    loadAnyRecipientMagicLinkSessionForAgreement(agreementId)?.token?.trim() ||
    "";
  return (
    <AgreementRecipientReview
      agreementId={agreementId}
      entry={entry}
      recipientLinkRole={roleOut}
      participantPartyId={partyOut}
      inviterDisplayNameOverride={inviterName || ""}
      recipientAccessToken={accessTokOut}
      recipientViewerContext={recipientViewerContext ?? "public_recipient"}
      qaOwnerReturnPath={qaOwnerReturnPath ?? null}
      onRecipientPostApprovalPresentationChange={onRecipientPostApprovalPresentationChange}
      onClose={onClose}
    />
  );
}

/** `/app/esign/:id` — supports `?agreement_bridge=1` paid Pro VS01 handoff (see resolveVs01EsignShellCopy). */
function AppEsignDocumentShell(props: { seed: string; search: string }) {
  const { seed, search } = props;
  const [vs01Step, setVs01Step] = useState(0);
  const bridge = typeof window !== "undefined" ? readAgreementVs01BridgeSession() : null;
  const shellCopy = resolveVs01EsignShellCopy({ search, seedDocumentId: seed, bridge, vs01Step });

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
      navMode={shellCopy.navVariant === "esign_bridge_focused" ? "esign_bridge_focused" : "default"}
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
      return <LaunchHomePage />;
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

  if (appMatch?.kind === "adminConsole" && !featureFlags.adminConsoleUi) {
    return (
      <AppShell
        title="Unavailable"
        subtitle="Internal admin is not enabled in this deployment."
      >
        <p className="max-w-md text-sm text-slate-400">
          This page is for operator tools only. Customer builds leave it off; use an internal build with admin
          console enabled if you need it.
        </p>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary mt-6"
          onClick={() => navigate("/app")}
        >
          Back to dashboard
        </button>
      </AppShell>
    );
  }

  if (appMatch?.kind === "affiliatePayoutOps" && !featureFlags.affiliateAdminUi) {
    return (
      <AppShell
        title="Unavailable"
        subtitle="Affiliate operator tools are not enabled in this deployment."
      >
        <p className="max-w-md text-sm text-slate-400">
          This page is for payout / ops work only. Enable <code className="text-slate-300">VITE_CLAW_FEATURE_AFFILIATE_ADMIN</code> in
          internal or staging test builds if you need it.
        </p>
        <button type="button" className="vs01-btn vs01-btn--secondary mt-6" onClick={() => navigate("/app")}>
          Back to dashboard
        </button>
      </AppShell>
    );
  }

  if (
    (appMatch?.kind === "opsGrowth" ||
      appMatch?.kind === "opsPaidFunnel" ||
      appMatch?.kind === "opsStarterProRefine") &&
    !canAccessOperatorGrowthDashboard()
  ) {
    return (
      <AppShell
        title="Unavailable"
        subtitle="Operator analytics routes are not enabled in this deployment."
      >
        <p className="max-w-md text-sm text-slate-400">
          These dashboards use local browser analytics. Enable <code className="text-slate-300">VITE_CLAW_FEATURE_OPS_GROWTH</code> for
          internal test builds, or use localhost in development.
        </p>
        <button type="button" className="vs01-btn vs01-btn--secondary mt-6" onClick={() => navigate("/app")}>
          Back to dashboard
        </button>
      </AppShell>
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
      case "simpleVerification":
        return <SimpleVerificationPage agreementId={appMatch.agreementId} />;
      case "quickSend":
        return <QuickSendPage />;
      case "dashboard":
        return <AppDashboard />;
      case "billing":
        return <BillingPage />;
      case "affiliate":
        return <LawdogAffiliatePage />;
      case "settings":
        return <LawdogSettingsPage />;
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
        return <AdminConsolePage />;
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
        return <AppEsignDocumentShell seed={seed} search={search || ""} />;
      }
      default:
        break;
    }
  }

  if (pathNorm === "/") {
    return <LaunchHomePage />;
  }

  return <LaunchHomePage />;
}
