/**
 * Phase 1 focused access-contract gate — 96 tests.
 *
 * 14 files from Phase 1 commits 19a43277 / 98fd5208 / 67c396d7 (76 tests)
 * plus the four pre-existing route/auth/owner-data/session files that
 * complete the recorded 96-test focused check.
 *
 * Phase 2 must include this entire list. Do not remove entries to
 * shrink a later gate.
 */
export const PHASE1_ACCESS_CONTRACT_INCLUDE = [
  "src/account/currentUser.test.ts",
  "src/auth/RequireAuthenticatedDashboard.test.tsx",
  "src/launch/routeAccessManifest.test.ts",
  "src/launch/documentLayout/documentLayoutApi.test.ts",
  "src/launch/receiptApi.test.ts",
  "src/lib/ownerApiClient.test.ts",
  "src/vs01/vs01Api.authHeaders.test.ts",
  "src/vs01/vs01EsignBridgeColdOpen.test.ts",
  "src/access/AccessContext.sessionLifecycle.test.tsx",
  "src/access/accessResolver.sessionScope.test.ts",
  "src/access/subscriptionEntitlementCache.lifecycle.test.ts",
  "src/auth/userSessionState.test.ts",
  "src/launch/BillingPage.workspacePolicy.test.ts",
  "src/launch/orgContext.lifecycle.test.ts",
  "src/access/authenticatedWorkspaceAccessPolicy.test.ts",
  "src/access/commercialEntitlement.test.ts",
  "src/access/accessResolver.prodSafety.test.ts",
  "src/launch/billingCheckoutApi.auth.test.ts",
] as const;
