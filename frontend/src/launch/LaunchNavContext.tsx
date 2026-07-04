import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AgreementDraft } from "../agreement/agreementTypes";
import {
  getOrCreateLawdogSessionId,
  syncLawdogFlowFromPathname,
  syncLawdogReferralSourceFromAffiliateLanding,
  syncLawdogReferralSourceFromPathname,
  syncLawdogTrafficSourceFromSearch,
} from "../tracking/lawdogSession";
import { rememberAffiliateCodeFromPathname, rememberAffiliateCodeFromSearch } from "./affiliate/affiliateAttributionContext";
import {
  captureGenesisReferralFromSearch,
  getGenesisReferralCheckoutPayload,
  getOrCreateGenesisVisitorId,
} from "./genesisReferral/genesisReferralCapture";
import { postGenesisReferralCapture } from "./genesisReferral/genesisReferralApi";
import { hasCheckoutBackRestoreSnapshot } from "../components/agreements/checkoutBackRestore";
import { resetHeroHandoffForCreateNavigationWithoutPayload } from "./heroIntakePrefill";
import {
  isSimpleCheckoutPath,
  resetCheckoutEntryScroll,
} from "./simpleProduct/checkoutEntryScroll";
import type { SimpleSendHandoff } from "./simpleProduct/simpleSendHandoff";
import { buildSimpleSendHistoryState } from "./simpleProduct/simpleSendHandoff";
import {
  markAuthenticatedWorkspaceSession,
  shouldMarkWorkspaceSessionForPath,
} from "./completedAgreementViewContext";
import {
  clearPaidDashboardCreateContext,
  isWorkspaceNavOrigin,
  markPaidDashboardCreateContext,
} from "./paidDashboardCreateContext";

export type LaunchNavigateOptions = {
  heroIntake?: string;
  /** Marketing hero submit — uses intake as authoritative (including empty), not restored draft. */
  heroFromHome?: boolean;
  /** Homepage submit with text — begin starter draft generation on create mount (skip prompt-only handoff). */
  heroAutoGenerate?: boolean;
  /** `/app/quick` typed handoff — create page shows continuity copy (requires `heroFromHome`). */
  heroQuickSendTypedHandoff?: boolean;
  heroVoiceFinalize?: boolean;
  /** Session-only normalized draft from create → review handoff (`/app/send/...`). */
  reviewPrimedDraft?: AgreementDraft | null;
  /** First-run simple flow: lighter review/send chrome (no interstitial). */
  streamlinedSimpleFlow?: boolean;
  /** Canonical v1 send handoff (starter + premium fork). */
  simpleSendHandoff?: SimpleSendHandoff;
  /** Authenticated workspace Dashboard → Create — latch paid-create context before billing fetch. */
  paidDashboardCreate?: boolean;
  paidDashboardCreateSource?: string;
};

type LaunchNav = {
  pathname: string;
  search: string;
  /** URL fragment (including `#`), updated with pathname on SPA navigations and popstate. */
  hash: string;
  navigate: (to: string, options?: LaunchNavigateOptions) => void;
};

const Ctx = createContext<LaunchNav | null>(null);

export function LaunchNavProvider({ children }: { children: React.ReactNode }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onPop = () => setTick((t) => t + 1);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    getOrCreateLawdogSessionId();
    syncLawdogTrafficSourceFromSearch(window.location.search);
    syncLawdogReferralSourceFromPathname(window.location.pathname);
    syncLawdogReferralSourceFromAffiliateLanding(window.location.pathname);
    syncLawdogFlowFromPathname(window.location.pathname);
    rememberAffiliateCodeFromPathname(window.location.pathname);
    rememberAffiliateCodeFromSearch(window.location.search);
    if (shouldMarkWorkspaceSessionForPath(window.location.pathname)) {
      markAuthenticatedWorkspaceSession();
    }
    const genesisCode = captureGenesisReferralFromSearch(
      window.location.search,
      window.location.pathname,
    );
    if (genesisCode) {
      getOrCreateGenesisVisitorId();
      void postGenesisReferralCapture({
        referral_code: genesisCode,
        visitor_id: getGenesisReferralCheckoutPayload().visitor_id,
        source_path: window.location.pathname,
      });
    }
  }, [tick]);

  const navigate = useCallback((to: string, options?: LaunchNavigateOptions) => {
    const p = to.startsWith("/") ? to : `/${to}`;
    const pathOnly = p.replace(/[?#].*$/, "");
    let state: Record<string, unknown> | null = null;
    if (pathOnly === "/app/create") {
      const restoreStarterReview =
        (() => {
          try {
            const u = new URL(p, "http://localhost");
            return u.searchParams.get("restore") === "starterReview" || hasCheckoutBackRestoreSnapshot();
          } catch {
            return hasCheckoutBackRestoreSnapshot();
          }
        })();
      if (options?.heroFromHome) {
        clearPaidDashboardCreateContext();
      } else if (options?.paidDashboardCreate) {
        markPaidDashboardCreateContext(
          options.paidDashboardCreateSource?.trim() || "dashboard_nav",
        );
      } else if (isWorkspaceNavOrigin(window.location.pathname)) {
        markPaidDashboardCreateContext("workspace_nav_create");
      } else {
        clearPaidDashboardCreateContext();
      }
      if (restoreStarterReview) {
        state = null;
      } else if (options?.heroFromHome) {
        state = {
          clawHeroIntake: options.heroIntake ?? "",
          clawHeroFromHome: true,
          clawHeroVoiceFinalize: options.heroVoiceFinalize === true,
          ...(options.heroAutoGenerate === true ? { clawHeroAutoGenerate: true } : {}),
          ...(options.heroQuickSendTypedHandoff === true ? { clawHeroQuickSendTypedHandoff: true } : {}),
        };
      } else if (options?.heroIntake?.trim()) {
        state = { clawHeroIntake: options.heroIntake.trim() };
      } else {
        resetHeroHandoffForCreateNavigationWithoutPayload();
      }
    } else if (/^\/app\/send\//.test(pathOnly) && options?.simpleSendHandoff) {
      state = buildSimpleSendHistoryState(options.simpleSendHandoff);
    } else if (options?.reviewPrimedDraft != null && /^\/app\/send\//.test(pathOnly)) {
      state = {
        clawReviewPrimedDraft: options.reviewPrimedDraft,
        ...(options.streamlinedSimpleFlow ? { clawStreamlinedSimpleFlow: true } : {}),
      };
    }
    window.history.pushState(state, "", p);
    if (shouldMarkWorkspaceSessionForPath(pathOnly)) {
      markAuthenticatedWorkspaceSession();
    }
    if (isSimpleCheckoutPath(pathOnly)) {
      resetCheckoutEntryScroll();
    }
    setTick((t) => t + 1);
  }, []);

  const value = useMemo((): LaunchNav => {
    void tick;
    return {
      pathname: typeof window !== "undefined" ? window.location.pathname : "/",
      search: typeof window !== "undefined" ? window.location.search : "",
      hash: typeof window !== "undefined" ? window.location.hash : "",
      navigate,
    };
  }, [tick, navigate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLaunchNav(): LaunchNav {
  const v = useContext(Ctx);
  if (!v) {
    return {
      pathname: "/",
      search: "",
      hash: "",
      navigate: () => {
        /* no-op */
      },
    };
  }
  return v;
}
