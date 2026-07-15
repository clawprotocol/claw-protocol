/** Decision telemetry at the free-starter → checkout upgrade boundary (not repeated render logs). */

export type StarterUpgradeTransitionNextStep =
  | "checkout"
  | "auth_claim"
  | "blocked_paid_authority";

export function logStarterUpgradeTransition(args: {
  source: string;
  component: string;
  nextStep: StarterUpgradeTransitionNextStep;
  paymentRequired: boolean;
  entitlementPresent: boolean;
  anonymous: boolean;
  orgId?: string | null;
}): void {
  // eslint-disable-next-line no-console
  console.info("[starter-upgrade-transition]", {
    source: args.source,
    component: args.component,
    nextStep: args.nextStep,
    paymentRequired: args.paymentRequired,
    entitlementPresent: args.entitlementPresent,
    anonymous: args.anonymous,
    orgId: args.orgId ?? null,
  });
}
