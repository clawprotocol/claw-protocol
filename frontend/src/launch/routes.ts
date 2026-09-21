export type AppSection =
  | { kind: "dashboard" }
  | { kind: "simpleCreate" }
  | { kind: "simpleReady"; agreementId: string }
  | { kind: "simpleCheckout"; agreementId: string }
  | { kind: "simpleSend"; agreementId: string }
  | { kind: "simpleDone"; agreementId: string }
  | { kind: "ownerProposalReview"; agreementId: string }
  | { kind: "ownerAgreementView"; agreementId: string }
  | { kind: "ownerSignedAgreementView"; agreementId: string }
  | { kind: "ownerSigningStatus"; agreementId: string }
  | { kind: "simpleVerification"; agreementId: string }
  | { kind: "quickSend" }
  | { kind: "agreements"; sub: "list" | "new" | { id: string } }
  | { kind: "esign"; sub: "new" | { id: string } }
  | { kind: "billing" }
  | { kind: "affiliate" }
  | { kind: "settings" }
  | { kind: "signIn" }
  | { kind: "authCallback" }
  | { kind: "signatures" }
  | { kind: "opportunity" }
  | { kind: "agreementMemory" }
  | { kind: "integrations" }
  | { kind: "fieldReview"; analysisId: string }
  | { kind: "receipt"; id: string }
  | { kind: "advancedWorkProduct" }
  | { kind: "affiliatePayoutOps" }
  | { kind: "opsGrowth" }
  | { kind: "opsPaidFunnel" }
  | { kind: "opsStarterProRefine" }
  | { kind: "genesisReferral" }
  | { kind: "opsGenesisReferral" }
  | { kind: "adminConsole" };

export type AppRouteAccess =
  | "public"
  | "guest_workflow"
  | "authenticated"
  | "paid"
  | "recipient_token"
  | "admin";

export type AppRouteMatch = {
  routeId: string;
  access: AppRouteAccess;
  section: AppSection;
};

export type AppRouteDefinition = {
  id: string;
  pathPattern: string;
  examplePaths: readonly string[];
  access: AppRouteAccess;
  match: (pathname: string) => AppSection | null;
  resolveAccess?: (search: string) => AppRouteAccess;
};

function exactRoute(args: {
  id: string;
  paths: readonly string[];
  access: AppRouteAccess;
  section: () => AppSection;
}): AppRouteDefinition {
  return {
    id: args.id,
    pathPattern: args.paths.join(" | "),
    examplePaths: args.paths,
    access: args.access,
    match: (pathname) => (args.paths.includes(pathname) ? args.section() : null),
  };
}

function dynamicRoute(args: {
  id: string;
  pathPattern: string;
  examplePath: string;
  access: AppRouteAccess;
  pattern: RegExp;
  section: (capture: string) => AppSection;
  resolveAccess?: (search: string) => AppRouteAccess;
}): AppRouteDefinition {
  return {
    id: args.id,
    pathPattern: args.pathPattern,
    examplePaths: [args.examplePath],
    access: args.access,
    match: (pathname) => {
      const result = args.pattern.exec(pathname);
      return result ? args.section(decodeURIComponent(result[1])) : null;
    },
    resolveAccess: args.resolveAccess,
  };
}

function hasRecipientAgreementToken(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  return Boolean((params.get("token") || params.get("t") || "").trim());
}

function resolveEsignDocumentRouteAccess(search: string): AppRouteAccess {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const flagOn = (key: string) => {
    const value = (params.get(key) ?? "").trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes";
  };
  const ownerBridge = flagOn("agreement_bridge");
  const recipientSign = flagOn("vs01_recipient_sign");
  if (ownerBridge && recipientSign) return "authenticated";
  if (ownerBridge) return "authenticated";
  if (recipientSign) return "recipient_token";
  return "public";
}

/**
 * Canonical application route and access manifest.
 *
 * Route matching, sitemap examples, and authentication policy must all consume
 * this registry so a new screen cannot silently omit its access classification.
 */
export const APP_ROUTE_MANIFEST: readonly AppRouteDefinition[] = [
  exactRoute({
    id: "dashboard",
    paths: ["/app", "/dashboard"],
    access: "authenticated",
    section: () => ({ kind: "dashboard" }),
  }),
  exactRoute({
    id: "admin-console",
    paths: ["/app/admin", "/app/founder", "/founder", "/admin"],
    access: "admin",
    section: () => ({ kind: "adminConsole" }),
  }),
  exactRoute({ id: "billing", paths: ["/app/billing"], access: "authenticated", section: () => ({ kind: "billing" }) }),
  exactRoute({ id: "affiliate", paths: ["/app/affiliate"], access: "authenticated", section: () => ({ kind: "affiliate" }) }),
  exactRoute({ id: "settings", paths: ["/app/settings"], access: "authenticated", section: () => ({ kind: "settings" }) }),
  exactRoute({ id: "sign-in", paths: ["/app/sign-in"], access: "public", section: () => ({ kind: "signIn" }) }),
  exactRoute({
    id: "auth-callback",
    paths: ["/app/auth/callback"],
    access: "public",
    section: () => ({ kind: "authCallback" }),
  }),
  exactRoute({
    id: "signatures",
    paths: ["/app/signatures"],
    access: "authenticated",
    section: () => ({ kind: "signatures" }),
  }),
  exactRoute({
    id: "opportunity",
    paths: ["/app/opportunity"],
    access: "authenticated",
    section: () => ({ kind: "opportunity" }),
  }),
  exactRoute({
    id: "agreement-memory",
    paths: ["/app/agreement-memory"],
    access: "authenticated",
    section: () => ({ kind: "agreementMemory" }),
  }),
  exactRoute({
    id: "integrations",
    paths: ["/app/integrations"],
    access: "authenticated",
    section: () => ({ kind: "integrations" }),
  }),
  exactRoute({
    id: "work-product",
    paths: ["/app/work-product"],
    access: "paid",
    section: () => ({ kind: "advancedWorkProduct" }),
  }),
  exactRoute({
    id: "affiliate-payout-ops",
    paths: ["/app/ops/affiliate-payouts"],
    access: "admin",
    section: () => ({ kind: "affiliatePayoutOps" }),
  }),
  exactRoute({ id: "ops-growth", paths: ["/app/ops/growth"], access: "admin", section: () => ({ kind: "opsGrowth" }) }),
  exactRoute({
    id: "ops-paid-funnel",
    paths: ["/app/ops/paid-funnel"],
    access: "admin",
    section: () => ({ kind: "opsPaidFunnel" }),
  }),
  exactRoute({
    id: "ops-starter-pro-refine",
    paths: ["/app/ops/starter-pro-refine"],
    access: "admin",
    section: () => ({ kind: "opsStarterProRefine" }),
  }),
  exactRoute({
    id: "genesis-referral",
    paths: ["/app/genesis-referral"],
    access: "authenticated",
    section: () => ({ kind: "genesisReferral" }),
  }),
  exactRoute({
    id: "ops-genesis-referral",
    paths: ["/app/ops/genesis-referral"],
    access: "admin",
    section: () => ({ kind: "opsGenesisReferral" }),
  }),
  exactRoute({
    id: "simple-create",
    paths: ["/app/create"],
    access: "authenticated",
    section: () => ({ kind: "simpleCreate" }),
  }),
  exactRoute({
    id: "quick-send",
    paths: ["/app/quick"],
    access: "guest_workflow",
    section: () => ({ kind: "quickSend" }),
  }),
  dynamicRoute({
    id: "simple-ready",
    pathPattern: "/app/ready/:agreementId",
    examplePath: "/app/ready/example-agreement",
    access: "authenticated",
    pattern: /^\/app\/ready\/([^/]+)$/,
    section: (agreementId) => ({ kind: "simpleReady", agreementId }),
  }),
  dynamicRoute({
    id: "simple-checkout",
    pathPattern: "/app/checkout/:agreementId",
    examplePath: "/app/checkout/example-agreement",
    access: "authenticated",
    pattern: /^\/app\/checkout\/([^/]+)$/,
    section: (agreementId) => ({ kind: "simpleCheckout", agreementId }),
  }),
  dynamicRoute({
    id: "simple-send",
    pathPattern: "/app/send/:agreementId",
    examplePath: "/app/send/example-agreement",
    access: "authenticated",
    pattern: /^\/app\/send\/([^/]+)$/,
    section: (agreementId) => ({ kind: "simpleSend", agreementId }),
  }),
  dynamicRoute({
    id: "simple-done",
    pathPattern: "/app/done/:agreementId",
    examplePath: "/app/done/example-agreement",
    access: "authenticated",
    pattern: /^\/app\/done\/([^/]+)$/,
    section: (agreementId) => ({ kind: "simpleDone", agreementId }),
  }),
  dynamicRoute({
    id: "owner-proposal-review",
    pathPattern: "/app/review-changes/:agreementId",
    examplePath: "/app/review-changes/example-agreement",
    access: "authenticated",
    pattern: /^\/app\/review-changes\/([^/]+)$/,
    section: (agreementId) => ({ kind: "ownerProposalReview", agreementId }),
  }),
  dynamicRoute({
    id: "owner-verification",
    pathPattern: "/app/verification/:agreementId",
    examplePath: "/app/verification/example-agreement",
    access: "authenticated",
    pattern: /^\/app\/verification\/([^/]+)$/,
    section: (agreementId) => ({ kind: "simpleVerification", agreementId }),
  }),
  exactRoute({
    id: "agreements-list",
    paths: ["/app/agreements"],
    access: "authenticated",
    section: () => ({ kind: "agreements", sub: "list" }),
  }),
  exactRoute({
    id: "agreements-new",
    paths: ["/app/agreements/new"],
    access: "authenticated",
    section: () => ({ kind: "agreements", sub: "new" }),
  }),
  dynamicRoute({
    id: "owner-agreement-view",
    pathPattern: "/app/agreements/:agreementId/view",
    examplePath: "/app/agreements/example-agreement/view",
    access: "authenticated",
    pattern: /^\/app\/agreements\/([^/]+)\/view$/,
    section: (agreementId) => ({ kind: "ownerAgreementView", agreementId }),
  }),
  dynamicRoute({
    id: "owner-signed-agreement-view",
    pathPattern: "/app/agreements/:agreementId/view-signed",
    examplePath: "/app/agreements/example-agreement/view-signed",
    access: "authenticated",
    pattern: /^\/app\/agreements\/([^/]+)\/view-signed$/,
    section: (agreementId) => ({ kind: "ownerSignedAgreementView", agreementId }),
  }),
  dynamicRoute({
    id: "owner-signing-status",
    pathPattern: "/app/signing-status/:agreementId",
    examplePath: "/app/signing-status/example-agreement",
    access: "authenticated",
    pattern: /^\/app\/signing-status\/([^/]+)$/,
    section: (agreementId) => ({ kind: "ownerSigningStatus", agreementId }),
  }),
  dynamicRoute({
    id: "agreement-detail",
    pathPattern: "/app/agreements/:agreementId",
    examplePath: "/app/agreements/example-agreement",
    access: "authenticated",
    pattern: /^\/app\/agreements\/([^/]+)$/,
    section: (id) => ({ kind: "agreements", sub: { id } }),
    resolveAccess: (search) => (hasRecipientAgreementToken(search) ? "recipient_token" : "authenticated"),
  }),
  exactRoute({
    id: "esign-new",
    paths: ["/app/esign", "/app/esign/new"],
    access: "guest_workflow",
    section: () => ({ kind: "esign", sub: "new" }),
  }),
  dynamicRoute({
    id: "recipient-esign",
    pathPattern: "/app/esign/:documentId",
    examplePath: "/app/esign/example-document",
    access: "recipient_token",
    pattern: /^\/app\/esign\/([^/]+)$/,
    section: (id) => ({ kind: "esign", sub: { id } }),
    resolveAccess: resolveEsignDocumentRouteAccess,
  }),
  dynamicRoute({
    id: "usage-receipt",
    pathPattern: "/app/receipts/:usageId",
    examplePath: "/app/receipts/example-usage",
    access: "authenticated",
    pattern: /^\/app\/receipts\/([^/]+)$/,
    section: (id) => ({ kind: "receipt", id }),
  }),
  dynamicRoute({
    id: "field-review",
    pathPattern: "/app/field-review/:analysisId",
    examplePath: "/app/field-review/example-analysis",
    access: "paid",
    pattern: /^\/app\/field-review\/([^/]+)$/,
    section: (analysisId) => ({ kind: "fieldReview", analysisId }),
  }),
];

function normalizeLocation(pathname: string, explicitSearch?: string): { pathname: string; search: string } {
  const raw = pathname || "/";
  const queryIndex = raw.indexOf("?");
  const embeddedSearch = queryIndex >= 0 ? raw.slice(queryIndex) : "";
  const withoutSearch = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;
  return {
    pathname: withoutSearch.replace(/\/$/, "") || "/",
    search: explicitSearch === undefined ? embeddedSearch : explicitSearch,
  };
}

export function matchAppRoute(pathname: string, search?: string): AppRouteMatch | null {
  const location = normalizeLocation(pathname, search);
  for (const route of APP_ROUTE_MANIFEST) {
    const section = route.match(location.pathname);
    if (!section) continue;
    return {
      routeId: route.id,
      access: route.resolveAccess?.(location.search) ?? route.access,
      section,
    };
  }
  return null;
}

export function matchAppPath(pathname: string): AppSection | null {
  return matchAppRoute(pathname)?.section ?? null;
}

export function routeRequiresAuthenticatedSession(access: AppRouteAccess): boolean {
  return access === "authenticated" || access === "paid" || access === "admin";
}
