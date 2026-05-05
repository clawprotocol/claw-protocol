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
import { AffiliatePayoutOpsPage } from "./launch/affiliate/AffiliatePayoutOpsPage";
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
import { AgreementWizardShell } from "./agreement/AgreementWizardShell";
import {
  fetchRecipientAccessPolicy,
  validateRecipientAccessToken,
} from "./agreement/recipientAccessApi";
import {
  loadRecipientMagicLinkSession,
  saveRecipientMagicLinkSession,
} from "./agreement/recipientMagicLinkSession";
import { AccessAccountPanel } from "./components/access/AccessAccountPanel";
import { Vs01Layout, type Vs01LayoutHero } from "./vs01/Vs01Layout";
import { Vs01Wizard } from "./vs01/Vs01Wizard";
import { getVs01UrlBootstrap } from "./vs01/vs01UrlBootstrap";
import { ClawPublicFeedView } from "./feed/ClawPublicFeedView";
import { parseClawPublicFeedPath } from "./feed/clawPublicFeed";
import { TermsPage } from "./launch/legal/TermsPage";
import { PrivacyPage } from "./launch/legal/PrivacyPage";
import { AffiliateTermsPage } from "./launch/legal/AffiliateTermsPage";

const ACCESS_HEADER_ASIDE = (
  <details className="vs01-access-disclosure text-left">
    <summary className="cursor-pointer list-none text-center text-sm text-slate-400 marker:content-none">
      <span className="inline-flex min-h-9 items-center rounded-full border border-slate-700/80 bg-slate-900/50 px-3 py-1.5 hover:border-slate-600">
        Account
      </span>
    </summary>
    <div className="mt-2">
      <AccessAccountPanel />
    </div>
  </details>
);

const SIGN_HERO: Vs01LayoutHero = {
  eyebrow: "CLAW",
  title: "Sign a document",
  subtitle: "Send a file, collect signatures, and get a record you can trust later.",
  tagline: "Simple sending — with verification when you need it.",
};

const AGREEMENT_HERO: Vs01LayoutHero = {
  eyebrow: "CLAW",
  title: "Agreement workspace",
  subtitle:
    "Describe terms in plain language, review versions with counterparties, then export or send to signing.",
  tagline: "Version history and redlines stay with each agreement before it hits the signing flow.",
};

/** Public recipient agreement review (`/agreements/.../review`) — LawDog-only chrome, no CLAW eyebrow. */
const RECIPIENT_REVIEW_HERO: Vs01LayoutHero = {
  title: "Review workspace",
  subtitle: "Read the agreement, suggest changes, or continue when it looks good.",
};

const LAWDOG_FOOTER_EVIDENCE_SENTENCE =
  "LawDog produces verifiable evidence records; verification is cryptographic and file-based.";

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
  onClose: () => void;
}) {
  const { agreementId, token, recipientLinkRole, participantPartyId, onClose } = props;
  const [phase, setPhase] = useState<"loading" | "ready" | "bad">("loading");
  const [gateVid, setGateVid] = useState<string | undefined>(undefined);
  const [tokenValidated, setTokenValidated] = useState(false);
  const [resolvedRole, setResolvedRole] = useState<RecipientLinkRole | undefined>(undefined);
  const [resolvedPartyId, setResolvedPartyId] = useState<string | undefined>(undefined);
  const [inviterName, setInviterName] = useState<string | undefined>(undefined);
  const [badMessage, setBadMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const policy = await fetchRecipientAccessPolicy();
      const fromSession = loadRecipientMagicLinkSession(agreementId);
      const effectiveToken = (token || "").trim() || fromSession?.token?.trim() || "";

      if (effectiveToken) {
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
          const pid = (vr.data.recipient_party_id || "").trim();
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
  const partyOut = (resolvedPartyId || participantPartyId || "").trim();
  return (
    <AgreementRecipientReview
      agreementId={agreementId}
      entry={entry}
      recipientLinkRole={roleOut}
      participantPartyId={partyOut}
      inviterDisplayNameOverride={inviterName || ""}
      recipientAccessToken={(token || "").trim()}
      onClose={onClose}
    />
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
        hero={SIGN_HERO}
        headerAside={ACCESS_HEADER_ASIDE}
        productNav={{ label: "← Home", onClick: () => navigate("/") }}
      >
        <Vs01Wizard />
      </Vs01Layout>
    );
  }

  if (agreementSignInfo) {
    return (
      <Vs01Layout
        hero={AGREEMENT_HERO}
        headerAside={ACCESS_HEADER_ASIDE}
        productNav={{ label: "← Home", onClick: () => navigate("/") }}
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
    return (
      <Vs01Layout
        hero={RECIPIENT_REVIEW_HERO}
        headerAside={ACCESS_HEADER_ASIDE}
        productNav={{ label: "← Home", onClick: () => navigate("/") }}
        footerEvidenceSentence={LAWDOG_FOOTER_EVIDENCE_SENTENCE}
      >
        <div className="vs01-card vs01-card--envelope">
          <AgreementReviewGate
            agreementId={reviewInfo.agreementId}
            token={reviewInfo.token}
            recipientLinkRole={reviewInfo.role}
            participantPartyId={reviewInfo.participantPartyId}
            onClose={() => navigate("/")}
          />
        </div>
      </Vs01Layout>
    );
  }

  if (verifyInfo) {
    return (
      <Vs01Layout
        hero={VERIFY_HERO}
        headerAside={ACCESS_HEADER_ASIDE}
        productNav={{ label: "← Home", onClick: () => navigate("/") }}
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
        headerAside={ACCESS_HEADER_ASIDE}
        productNav={{ label: "← Home", onClick: () => navigate("/") }}
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
        const shellKey = `esign-${sub.id}`;
        const seed = sub.id;
        const rawSearch = search?.startsWith("?") ? search.slice(1) : search || "";
        const agreementBridgeEntry = new URLSearchParams(rawSearch).get("agreement_bridge") === "1";
        return (
          <AppShell
            title={agreementBridgeEntry ? "Sign your document" : "Continue your document"}
            subtitle={
              agreementBridgeEntry
                ? "Place signature fields and sign — signer details were confirmed on the prior step."
                : "Same path as Quick — you confirm before anything goes out."
            }
          >
            <Vs01Wizard key={shellKey} seedDocumentId={seed} hideStepper />
          </AppShell>
        );
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
