import { parseAgreementVerifyPath } from "../agreement/agreementPublicVerify";
import {
  parseAgreementReviewPath,
  parseAgreementSignPath,
} from "../agreement/AgreementRecipientReview";
import { parseClawPublicFeedPath } from "../feed/clawPublicFeed";
import { isVs01EmailLinkBootstrapSurface } from "../vs01/vs01FragmentBootstrapToken";
import { parseAffiliateLandingPath } from "./affiliate/affiliateLandingRoutes";
import { parseLawdogReferralPath } from "./LawdogReferralRedirect";
import { matchAppPath } from "./routes";

/** Strip trailing slash and query for stable SPA route matching. */
export function normalizeProductPath(pathname: string): string {
  return (pathname.replace(/\/$/, "") || "/").split("?")[0];
}

/** GTM canonical agreement creation entry. */
export const CANONICAL_AGREEMENT_CREATE_PATH = "/app/create";

/** Legacy wizard create route — redirect to canonical create. */
export function isLegacyAgreementCreateRoute(pathname: string): boolean {
  return normalizeProductPath(pathname) === "/app/agreements/new";
}

/** Preserve query string when redirecting legacy create bookmarks. */
export function resolveLegacyAgreementCreateRedirect(search: string): string {
  const raw = search?.startsWith("?") ? search : search ? `?${search}` : "";
  return raw ? `${CANONICAL_AGREEMENT_CREATE_PATH}${raw}` : CANONICAL_AGREEMENT_CREATE_PATH;
}

const PUBLIC_LEGAL_PATHS = new Set(["/terms", "/privacy", "/affiliate-terms"]);

function isVs01RecipientEmailBootstrapRoute(pathname: string, search: string): boolean {
  if (!isVs01EmailLinkBootstrapSurface(pathname, search)) return false;
  const seed = pathname.match(/\/app\/esign\/([^/?#]+)/)?.[1]?.trim();
  return Boolean(seed);
}

/**
 * Returns true when the SPA router recognizes the pathname (and optional search)
 * as a product route that should not fall through to the global not-found page.
 */
export function isKnownProductRoute(pathname: string, search = ""): boolean {
  const pathNorm = normalizeProductPath(pathname);

  if (pathNorm === "/" || PUBLIC_LEGAL_PATHS.has(pathNorm)) return true;

  if (parseAgreementSignPath(pathname, search)) return true;
  if (parseAgreementReviewPath(pathname, search)) return true;
  if (parseAgreementVerifyPath(pathname)) return true;
  if (parseClawPublicFeedPath(pathname)) return true;
  if (parseAffiliateLandingPath(pathNorm)) return true;
  if (parseLawdogReferralPath(pathNorm)) return true;
  if (isVs01RecipientEmailBootstrapRoute(pathname, search)) return true;
  if (matchAppPath(pathname)) return true;

  return false;
}

/** Paths that should receive an index.html shell in static hosting (deep-link safe). */
export function isSpaDeepLinkPath(pathname: string, search = ""): boolean {
  return isKnownProductRoute(pathname, search);
}
