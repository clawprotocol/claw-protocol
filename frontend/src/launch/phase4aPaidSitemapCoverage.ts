/**
 * Phase 4A paid-owner sitemap coverage — derived from APP_ROUTE_MANIFEST.
 * Do not maintain a second sitemap. A new authenticated/paid route without a
 * browser scenario fails the named Phase 4A gate.
 */
import { APP_ROUTE_MANIFEST, type AppRouteAccess, type AppRouteDefinition } from "./routes";

export const PHASE4A_ACCESS = ["authenticated", "paid"] as const satisfies readonly AppRouteAccess[];
export const PHASE4B_ACCESS = ["public", "guest_workflow", "recipient_token", "admin"] as const satisfies readonly AppRouteAccess[];

export type Phase4aFixtureState =
  | "workspace"
  | "draft"
  | "pending_review"
  | "accepted_frozen"
  | "sent"
  | "partially_signed"
  | "executed"
  | "receipt"
  | "field_review";

export type Phase4aRouteScenario = {
  routeId: string;
  heading: RegExp;
  primaryAction: RegExp;
  fixtureState: Phase4aFixtureState;
};

export const PHASE4A_ROUTE_SCENARIOS: readonly Phase4aRouteScenario[] = [
  { routeId: "dashboard", heading: /Dashboard/i, primaryAction: /Create|New agreement/i, fixtureState: "workspace" },
  { routeId: "billing", heading: /Create and send agreements|Billing|Pricing/i, primaryAction: /Pro|Power|Continue|Billing/i, fixtureState: "workspace" },
  { routeId: "affiliate", heading: /Affiliate|Unavailable|Referral|Dashboard/i, primaryAction: /Dashboard|Sign in|Continue|Copy|New agreement/i, fixtureState: "workspace" },
  { routeId: "settings", heading: /Settings/i, primaryAction: /Save|Dashboard|Sign out|Account/i, fixtureState: "workspace" },
  { routeId: "signatures", heading: /Signatures/i, primaryAction: /Dashboard|Prepare|Open|View/i, fixtureState: "partially_signed" },
  { routeId: "opportunity", heading: /Affiliate|Unavailable|Referral|Redirecting|Dashboard/i, primaryAction: /Dashboard|Sign in|Continue|New agreement/i, fixtureState: "workspace" },
  { routeId: "agreement-memory", heading: /Agreement Memory/i, primaryAction: /Search|Sync|Upgrade|Dashboard/i, fixtureState: "workspace" },
  { routeId: "integrations", heading: /Integration/i, primaryAction: /Add|Save|Webhook|Dashboard/i, fixtureState: "workspace" },
  { routeId: "genesis-referral", heading: /Affiliate|Unavailable|Referral|Genesis|Dashboard/i, primaryAction: /Dashboard|Copy|Continue|New agreement/i, fixtureState: "workspace" },
  { routeId: "work-product", heading: /Work Product Studio/i, primaryAction: /Template|Upgrade|Dashboard|Continue/i, fixtureState: "workspace" },
  { routeId: "simple-create", heading: /Draft it fast|Review your agreement|Create agreement/i, primaryAction: /Create agreement|Create draft|Review|Continue|Describe your agreement/i, fixtureState: "draft" },
  { routeId: "simple-ready", heading: /Send this as|Your agreement|Complete signer|Ready|Review/i, primaryAction: /Continue|Send|Checkout|Pro|Create|Complete|Describe|Copy|Dashboard|Home|New agreement/i, fixtureState: "draft" },
  { routeId: "simple-checkout", heading: /Checkout|Sign in to continue|plan|Pro/i, primaryAction: /Continue|Pay|Sign in|Pro/i, fixtureState: "draft" },
  { routeId: "simple-send", heading: /Your agreement|Complete signer|Send|Review|Recipient/i, primaryAction: /Send|Continue|Review|Copy|Complete|Create|Describe|Dashboard/i, fixtureState: "sent" },
  { routeId: "simple-done", heading: /Next step|Done|Sent|Complete|agreement/i, primaryAction: /Dashboard|View|Copy|Continue|Create/i, fixtureState: "sent" },
  { routeId: "owner-proposal-review", heading: /Review|Proposal|Changes/i, primaryAction: /Accept|Reject|Continue|Dashboard/i, fixtureState: "pending_review" },
  { routeId: "owner-verification", heading: /Verif|Receipt|agreement/i, primaryAction: /Verify|Dashboard|Continue/i, fixtureState: "executed" },
  { routeId: "agreements-list", heading: /Agreements/i, primaryAction: /Create|New|Open|Dashboard/i, fixtureState: "workspace" },
  { routeId: "agreements-new", heading: /New agreement/i, primaryAction: /Create|Continue|Describe/i, fixtureState: "draft" },
  { routeId: "owner-agreement-view", heading: /Agreement|Read-only|Review/i, primaryAction: /Dashboard|Copy|Download|Continue/i, fixtureState: "accepted_frozen" },
  { routeId: "owner-signed-agreement-view", heading: /Signed|Executed|Agreement/i, primaryAction: /Dashboard|Download|Copy/i, fixtureState: "executed" },
  { routeId: "owner-signing-status", heading: /Signing status/i, primaryAction: /Dashboard|Remind|Copy|Continue/i, fixtureState: "partially_signed" },
  { routeId: "agreement-detail", heading: /Agreement/i, primaryAction: /Continue|Create|Review|Dashboard/i, fixtureState: "accepted_frozen" },
  { routeId: "usage-receipt", heading: /Usage receipt/i, primaryAction: /Verify|Billing|Copy|Dashboard/i, fixtureState: "receipt" },
  { routeId: "field-review", heading: /Review detected fields/i, primaryAction: /Save|Continue|Dashboard|Signature/i, fixtureState: "field_review" },
];

export function listManifestRoutesByAccess(access: readonly AppRouteAccess[]): AppRouteDefinition[] {
  return APP_ROUTE_MANIFEST.filter((route) => (access as readonly string[]).includes(route.access));
}

export function listPhase4aManifestRoutes(): AppRouteDefinition[] {
  return listManifestRoutesByAccess(PHASE4A_ACCESS);
}

export function listPhase4aPaidOnlyRoutes(): AppRouteDefinition[] {
  return APP_ROUTE_MANIFEST.filter((route) => route.access === "paid");
}

export function listPhase4bManifestRoutes(): AppRouteDefinition[] {
  return listManifestRoutesByAccess(PHASE4B_ACCESS);
}

export function listPhase4aExamplePaths(): { routeId: string; path: string }[] {
  return listPhase4aManifestRoutes().flatMap((route) =>
    route.examplePaths.map((path) => ({ routeId: route.id, path })),
  );
}

export function phase4aScenarioForRoute(routeId: string): Phase4aRouteScenario | undefined {
  return PHASE4A_ROUTE_SCENARIOS.find((row) => row.routeId === routeId);
}

export function assertPhase4aCoverageComplete(): void {
  const missing = listPhase4aManifestRoutes().filter((route) => !phase4aScenarioForRoute(route.id));
  if (missing.length) {
    throw new Error(
      `Phase 4A sitemap is missing browser scenarios for: ${missing.map((r) => r.id).join(", ")}`,
    );
  }
  const extra = PHASE4A_ROUTE_SCENARIOS.filter(
    (row) => !listPhase4aManifestRoutes().some((route) => route.id === row.routeId),
  );
  if (extra.length) {
    throw new Error(
      `Phase 4A scenarios are not derived from the manifest: ${extra.map((r) => r.routeId).join(", ")}`,
    );
  }
}
