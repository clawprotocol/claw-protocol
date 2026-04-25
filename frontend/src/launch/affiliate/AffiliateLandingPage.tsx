import { useCallback, useEffect, useMemo, useState } from "react";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import { useLaunchNav } from "../LaunchNavContext";
import { resolveDoginalPfpUrl } from "./affiliateDoginalPfp";
import type { AffiliateLandingMode } from "./affiliateLandingTypes";
import { resolveAffiliateLandingView } from "./resolveAffiliateLandingView";
import { rememberAffiliateCode } from "./affiliateAttributionContext";
import { recordAffiliateTrustClick } from "./trustLedgerApi";
import { DisclosureFooter } from "../../compliance/DisclosureFooter";
import { AffiliateProgramLegalLinks } from "./AffiliateProgramLegalLinks";
import { getAffiliateAccentStyle } from "../../design/tokens";

type Props = {
  mode: AffiliateLandingMode;
  usernameSlug: string;
};

const CLAIMS_EMAIL = String(import.meta.env.VITE_LAWDOG_DOGINAL_CLAIMS_EMAIL ?? "").trim();

function buildClaimMailto(usernameSlug: string): string | null {
  if (!CLAIMS_EMAIL) return null;
  const subject = encodeURIComponent(`Doginal holder review — @${usernameSlug}`);
  const body = encodeURIComponent(
    `Handle: @${usernameSlug}\n\n(Optional: inscription id or marketplace link)\n`
  );
  return `mailto:${CLAIMS_EMAIL}?subject=${subject}&body=${body}`;
}

function DoginalPfpFallback() {
  return (
    <svg
      width="160"
      height="160"
      viewBox="0 0 16 16"
      className="h-32 w-32 [image-rendering:pixelated] sm:h-40 sm:w-40"
      aria-hidden
    >
      <rect width="16" height="16" fill="#1e293b" />
      <rect x="4" y="5" width="8" height="7" fill="#94a3b8" />
      <rect x="3" y="4" width="3" height="3" fill="#94a3b8" />
      <rect x="10" y="4" width="3" height="3" fill="#94a3b8" />
      <rect x="5" y="7" width="2" height="2" fill="#0f172a" />
      <rect x="9" y="7" width="2" height="2" fill="#0f172a" />
      <rect x="6" y="10" width="4" height="1" fill="#0f172a" />
    </svg>
  );
}

function setOrCreateMeta(attrName: "property" | "name", key: string, content: string) {
  if (typeof document === "undefined") return;
  const sel = `meta[${attrName}="${key}"]`;
  let el = document.querySelector(sel) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attrName, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function AffiliateLandingPage({ mode, usernameSlug }: Props) {
  const { navigate, search } = useLaunchNav();
  const resolved = useMemo(
    () => resolveAffiliateLandingView({ pathMode: mode, usernameSlug, search }),
    [mode, usernameSlug, search]
  );
  const origin = useMemo(() => (typeof window !== "undefined" ? window.location.origin : ""), []);
  const [imgFailed, setImgFailed] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  const defaultDoginalPfp = useMemo(() => resolveDoginalPfpUrl(usernameSlug), [usernameSlug]);
  const imgSrc =
    resolved.pfpImageOverrideUrl?.trim() ||
    (resolved.effectiveTheme === "doginal" ? defaultDoginalPfp : null);

  const accentStyles = getAffiliateAccentStyle(resolved.colorKey, {
    doginalIdentityProminence: resolved.effectiveTheme === "doginal",
  });

  useEffect(() => {
    setImgFailed(false);
  }, [imgSrc]);

  useEffect(() => {
    void recordAffiliateTrustClick(resolved.usernameSlug);
    rememberAffiliateCode(resolved.usernameSlug);
  }, [resolved.usernameSlug]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") return;
    if (resolved.pathMode !== "doginal") return;
    const slug = resolved.usernameSlug;

    const k = `lawdog_dcv_${slug}`;
    if (!window.sessionStorage.getItem(k)) {
      window.sessionStorage.setItem(k, "1");
      logProductEvent("doginal_claim_viewed", {
        username_slug: slug,
        doginal_tier: resolved.analyticsDoginalStatus,
        effective_theme: resolved.effectiveTheme,
      });
    }

    if (resolved.wasDoginalPathDowngraded) {
      const kr = `lawdog_dsr_${slug}`;
      if (!window.sessionStorage.getItem(kr)) {
        window.sessionStorage.setItem(kr, "1");
        logProductEvent("doginal_status_removed", { username_slug: slug });
      }
    } else if (resolved.doginalUxTier === "verified") {
      const kv = `lawdog_dsv_${slug}`;
      if (!window.sessionStorage.getItem(kv)) {
        window.sessionStorage.setItem(kv, "1");
        logProductEvent("doginal_status_verified", { username_slug: slug });
      }
    }
  }, [resolved]);

  const displayHandle = `@${usernameSlug}`;
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareTitle = `${displayHandle} · LawDog`;
  const shareText = `LawDog — ${displayHandle}`;

  useEffect(() => {
    if (resolved.effectiveTheme !== "doginal") return;
    const prevTitle = document.title;
    document.title = shareTitle;
    setOrCreateMeta("property", "og:title", shareTitle);
    setOrCreateMeta("property", "og:description", shareText);
    setOrCreateMeta("property", "og:url", pageUrl);
    setOrCreateMeta("name", "twitter:card", "summary_large_image");
    if (imgSrc) {
      setOrCreateMeta("property", "og:image", imgSrc);
    }
    return () => {
      document.title = prevTitle;
    };
  }, [resolved.effectiveTheme, shareTitle, shareText, pageUrl, imgSrc]);

  const quickHref = `/app/quick?src=${encodeURIComponent(resolved.trafficSourceForCta)}&aff=${encodeURIComponent(resolved.usernameSlug)}`;
  const mailtoHref = buildClaimMailto(usernameSlug);
  const showClaimHelpLink =
    Boolean(mailtoHref) &&
    resolved.effectiveTheme === "doginal" &&
    resolved.doginalUxTier !== "verified";

  const isDoginal = resolved.effectiveTheme === "doginal";

  const onCopyReferral = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
      logProductEvent("doginal_page_link_copied", { username_slug: usernameSlug, surface: "referral_link" });
    } catch {
      setCopyDone(false);
    }
  }, [pageUrl, usernameSlug]);

  const onSharePage = useCallback(async () => {
    logProductEvent("doginal_share_clicked", { username_slug: usernameSlug });
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text: shareText, url: pageUrl });
        return;
      }
    } catch {
      /* user cancel or unsupported */
    }
    void onCopyReferral();
  }, [onCopyReferral, pageUrl, shareText, shareTitle, usernameSlug]);

  const secondaryBtnClass =
    "min-h-12 w-full min-w-0 rounded-xl border-2 border-white/10 bg-slate-950/50 px-5 text-sm font-semibold text-slate-200 shadow-sm transition hover:border-white/20 hover:bg-slate-900/60 sm:min-h-[2.75rem] sm:w-auto sm:px-6";

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100"
      style={accentStyles.pageWashStyle}
    >
      <div className="mx-auto max-w-5xl px-5 pb-10 pt-10 sm:px-8 sm:pb-16 sm:pt-14 lg:pt-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center lg:gap-14">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <div
              className="mb-5 flex h-36 w-36 shrink-0 items-center justify-center rounded-3xl border-2 border-white/10 shadow-xl sm:h-44 sm:w-44 lg:h-48 lg:w-48"
              style={accentStyles.avatarFrameStyle}
            >
              {imgSrc && !imgFailed ? (
                <img
                  src={imgSrc}
                  alt={`Profile for ${displayHandle}`}
                  width={176}
                  height={176}
                  className="h-full w-full max-h-[10.5rem] rounded-[1.35rem] object-cover [image-rendering:pixelated] sm:max-h-44"
                  onError={() => setImgFailed(true)}
                />
              ) : imgSrc && imgFailed && isDoginal ? (
                <DoginalPfpFallback />
              ) : (
                <span className="text-5xl font-bold tracking-tight text-slate-300" aria-hidden>
                  {(usernameSlug[0] || "?").toUpperCase()}
                </span>
              )}
            </div>
            {isDoginal && resolved.doginalUxTier === "verified" ? (
              <span
                className="mb-3 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  borderColor: `${accentStyles.accentHex}55`,
                  backgroundColor: `${accentStyles.accentHex}12`,
                  color: accentStyles.accentHex,
                }}
              >
                Verified holder page
              </span>
            ) : null}
            <p className="text-sm font-medium text-slate-400">Shared by {displayHandle}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{displayHandle}</p>
            {isDoginal && resolved.doginalUxTier === "claimed" ? (
              <p className="mt-3 max-w-sm text-left text-xs leading-relaxed text-slate-500">
                This page is for verified Doginal holders. Claimed pages may be reviewed.
              </p>
            ) : null}
            {showClaimHelpLink ? (
              <a
                href={mailtoHref!}
                className="mt-4 text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                onClick={() =>
                  logProductEvent("doginal_claim_submitted", {
                    username_slug: usernameSlug,
                    surface: "affiliate_landing_mailto",
                  })
                }
              >
                Request holder review
              </a>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-col justify-center text-center lg:text-left">
            <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.4rem] lg:leading-[1.12]">
              Create and send an agreement in minutes.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-400 lg:mx-0">
              LawDog helps you draft, send, and sign — without a wall of legalese to start.
            </p>
            <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                className="min-h-12 w-full min-w-0 rounded-xl px-8 text-base font-semibold shadow-lg transition hover:brightness-105 active:brightness-95 sm:min-w-[12rem] sm:max-w-xs"
                style={accentStyles.ctaStyle}
                onClick={() => navigate(quickHref)}
              >
                Try LawDog
              </button>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <button type="button" className={secondaryBtnClass} onClick={() => void onCopyReferral()}>
                  {copyDone ? "Copied" : "Copy referral link"}
                </button>
                {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
                  <button type="button" className={secondaryBtnClass} onClick={() => void onSharePage()}>
                    Share
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {origin ? (
          <div className="mt-16 border-t border-slate-800/60 pt-8">
            <details className="group rounded-lg border border-slate-800/50 bg-slate-950/40">
              <summary className="cursor-pointer list-none px-4 py-3 text-left text-xs font-medium text-slate-500 marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="text-slate-500 group-open:text-slate-400">Disclosures &amp; program links</span>
                <span className="ml-2 text-slate-600">(tap to expand)</span>
              </summary>
              <div className="border-t border-slate-800/50 px-4 pb-4 pt-1">
                <div className="max-w-3xl opacity-90">
                  <AffiliateProgramLegalLinks origin={origin} />
                </div>
                <div className="mt-4 max-w-3xl text-slate-500 opacity-80">
                  <DisclosureFooter slim dense />
                </div>
              </div>
            </details>
          </div>
        ) : null}
      </div>
    </div>
  );
}
