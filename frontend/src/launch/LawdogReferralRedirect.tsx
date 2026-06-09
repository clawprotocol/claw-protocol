import { useEffect } from "react";
import { useLaunchNav } from "./LaunchNavContext";
import { rememberAffiliateCode } from "./affiliate/affiliateAttributionContext";

/** Public /r/{userSlug} referral entry — stores attribution and sends visitors to home. */
export function LawdogReferralRedirect(props: { userSlug: string }) {
  const { navigate } = useLaunchNav();

  useEffect(() => {
    rememberAffiliateCode(props.userSlug);
    navigate("/");
  }, [navigate, props.userSlug]);

  return (
    <div className="vs01-root flex min-h-[40vh] items-center justify-center px-4">
      <p className="text-sm text-slate-400">Redirecting…</p>
    </div>
  );
}

export function parseLawdogReferralPath(pathname: string): string | null {
  const p = (pathname || "").replace(/\/$/, "") || "/";
  const m = /^\/r\/([^/]+)$/.exec(p);
  if (!m) return null;
  const slug = decodeURIComponent(m[1] || "").trim();
  return slug || null;
}
