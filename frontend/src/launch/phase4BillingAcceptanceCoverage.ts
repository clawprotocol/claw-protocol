/**
 * Billing customer-acceptance contracts for /app/billing.
 * Fail closed if portal accepts caller customer ids, if query/portal return
 * can declare payment success, or if display invents dates/cadence.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchAppRoute, routeRequiresAuthenticatedSession } from "./routes";
import { BILLING_DISPLAY_STATES } from "./billingStatusApi";
import { shouldOfferProCheckout } from "./billingAccountDisplay";

const here = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

export const PHASE4_BILLING_PATH = "/app/billing";
export const PHASE4_BILLING_RETURN_AGREEMENT = "/app/send/ag-billing-orion?phase=send";

export function assertPhase4BillingAcceptanceContracts(): void {
  const billingRoute = matchAppRoute(PHASE4_BILLING_PATH);
  if (billingRoute?.routeId !== "billing" || !routeRequiresAuthenticatedSession(billingRoute.access)) {
    throw new Error("/app/billing is no longer an authenticated customer surface");
  }

  const required = [
    "no_subscription",
    "active",
    "scheduled_cancellation",
    "expired_canceled",
    "payment_problem",
    "unavailable",
  ];
  for (const state of required) {
    if (!BILLING_DISPLAY_STATES.includes(state as (typeof BILLING_DISPLAY_STATES)[number])) {
      throw new Error(`billing display lost required state ${state}`);
    }
  }

  const page = src("./BillingPage.tsx");
  if (page.includes("applySimpleSendUnlockFromReturnPath")) {
    throw new Error("Billing page still grants send unlock from returnTo without checkout");
  }
  if (!page.includes("fetchBillingStatus")) {
    throw new Error("Billing page no longer loads server-authoritative status");
  }
  if (!page.includes("createBillingPortalSession")) {
    throw new Error("Billing page no longer opens a server-created portal session");
  }
  if (!page.includes("requestSeq") || !page.includes("contextOrg") || !page.includes("contextUser")) {
    throw new Error("Billing page lost late-response / org-switch rejection");
  }
  if (!page.includes("billing-checkout-recovery") || !page.includes("createBillingCheckoutSession")) {
    throw new Error("Billing page no longer consults the server or paints checkout recovery");
  }
  const checkoutPage = src("./simpleProduct/SimpleCheckoutPage.tsx");
  if (!checkoutPage.includes("checkout-recovery-alert") || !checkoutPage.includes("purchase_unresolved")) {
    throw new Error("checkout page no longer paints an honest unresolved-purchase recovery");
  }
  const api = src("./billingStatusApi.ts");
  const portalFn = api.slice(api.indexOf("export async function createBillingPortalSession"));
  if (portalFn.includes("customer_id") || portalFn.includes("stripe_customer_id")) {
    throw new Error("portal client still sends a caller-supplied customer identity");
  }

  const router = src("../../../backend/routers/billing_checkout_api.py");
  if (!router.includes("caller_customer_rejected")) {
    throw new Error("portal handler no longer rejects caller-supplied customer identity");
  }
  if (!router.includes("stripe_portal_not_configured")) {
    throw new Error("missing Stripe portal config is no longer an explicit staging blocker");
  }
  if (!router.includes("already_subscribed")) {
    throw new Error("checkout no longer rejects an existing entitled subscriber");
  }
  if (!router.includes("payment_processing")) {
    throw new Error("checkout no longer reports an honest payment-processing state");
  }
  if (!router.includes("purchase_unresolved")) {
    throw new Error("checkout no longer reports an honest unresolved previous purchase");
  }
  if (!router.includes("require_verified_org_id(request)")) {
    throw new Error("billing status/portal no longer derive org from the verified principal");
  }

  const origin = src("../../../backend/billing/checkout_app_origin.py");
  if (!origin.includes("build_portal_return_url") || !origin.includes("premiumcompletion")) {
    throw new Error("portal return no longer strips payment-success query keys");
  }

  const entitlement = src("../../../backend/billing/subscription_authority.py");
  if (!entitlement.includes('_ENTITLED_STATUSES = frozenset({"active"})')) {
    throw new Error("billing work changed the entitled-status set");
  }
  const invoiceFnStart = entitlement.indexOf("def apply_invoice_paid_subscription_renewal");
  const invoiceFnNext = entitlement.indexOf("\ndef ", invoiceFnStart + 1);
  const invoiceFn = entitlement.slice(invoiceFnStart, invoiceFnNext === -1 ? undefined : invoiceFnNext);
  if (invoiceFn.includes("cancel_at_period_end=False")) {
    throw new Error("invoice renewal still clears cancel_at_period_end without subscription authority");
  }

  const attempts = src("../../../backend/billing/checkout_attempts.py");
  if (!attempts.includes("claim_or_reuse_checkout_attempt") || !attempts.includes("idempotency_key")) {
    throw new Error("checkout no longer reuses an org-scoped attempt with a durable idempotency key");
  }
  if (!attempts.includes("canonical_checkout_request") || !attempts.includes("persist_checkout_attempt_request")) {
    throw new Error("checkout no longer persists the canonical provider request for an idempotency key");
  }
  if (!attempts.includes("_retire_unpaid_attempt") || !attempts.includes("_confirmed_session_status")) {
    throw new Error("checkout no longer requires provider confirmation before retiring an unpaid attempt");
  }
  if (!attempts.includes("purchase_unresolved") && !attempts.includes('"unresolved"')) {
    throw new Error("checkout no longer preserves an unresolved previous purchase");
  }
  const stripe = src("../../../backend/billing/stripe_client.py");
  if (!stripe.includes("Idempotency-Key")) {
    throw new Error("Stripe checkout no longer sends Idempotency-Key");
  }
  if (!stripe.includes("expire_checkout_session")) {
    throw new Error("checkout no longer expires an unpaid session before a legitimate purchase change");
  }
  const ready = src("../../../backend/billing/schema_ready.py");
  if (!ready.includes("ensure_billing_schema_ready")) {
    throw new Error("production billing schema startup hook is missing");
  }

  if (shouldOfferProCheckout({ entitled: true } as never, "active")) {
    throw new Error("entitled subscribers can still start a Pro checkout from display helpers");
  }
}
