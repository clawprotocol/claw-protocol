/**
 * Billing account presentation helpers. Dates and cadence only from server fields.
 */

import type { BillingDisplayState, BillingStatusPayload } from "./billingStatusApi";

export type BillingUiPhase =
  | "loading"
  | "signed_out"
  | BillingDisplayState;

export function formatAuthoritativeBillingDate(iso: string | null | undefined): string | null {
  const raw = (iso || "").trim();
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

export function formatAuthoritativeCadence(interval: BillingStatusPayload["billing_interval"]): string | null {
  if (interval === "month") return "Monthly";
  if (interval === "year") return "Annual";
  return null;
}

export function billingStatusHeadline(state: BillingUiPhase, planLabel: string | null): string {
  if (state === "loading") return "Loading your subscription…";
  if (state === "signed_out") return "Sign in to see this workspace’s billing.";
  if (state === "unavailable") return "Subscription status is unavailable.";
  if (state === "no_subscription") return "No subscription on file for this workspace.";
  if (state === "payment_problem") return "There’s a problem with the payment on this subscription.";
  if (state === "expired_canceled") return "This subscription is no longer active.";
  if (state === "scheduled_cancellation") {
    return planLabel ? `${planLabel} is scheduled to cancel` : "Subscription is scheduled to cancel";
  }
  return planLabel ? `Current plan: ${planLabel}` : "You have an active subscription.";
}

export function billingStatusDetail(status: BillingStatusPayload | null, state: BillingUiPhase): string {
  if (state === "loading") return "Checking the server record for this workspace.";
  if (state === "signed_out") return "Billing is org-scoped and only shown after you sign in.";
  if (state === "unavailable") {
    return "We could not confirm subscription status from the server. Paid access is unchanged until status is confirmed.";
  }
  if (state === "no_subscription") {
    return "This workspace is on Guest access. Subscribe to LawDog Pro when you need watermark-free sends and monthly finalize quota.";
  }
  if (!status) return "";
  const date = formatAuthoritativeBillingDate(status.current_period_end);
  const cadence = formatAuthoritativeCadence(status.billing_interval);
  const bits: string[] = [];
  if (cadence) bits.push(cadence);
  if (state === "scheduled_cancellation") {
    bits.push(date ? `Access continues through ${date}.` : "Access continues through the paid period.");
  } else if (state === "active" && date) {
    bits.push(`Current period ends ${date}.`);
  } else if (state === "expired_canceled" && date) {
    bits.push(`Ended ${date}.`);
  } else if (state === "payment_problem" && date) {
    bits.push(`Period on file ends ${date}.`);
  }
  return bits.join(" ");
}

export function shouldOfferProCheckout(status: BillingStatusPayload | null, state: BillingUiPhase): boolean {
  if (state === "loading" || state === "signed_out" || state === "unavailable") return false;
  if (!status) return state === "no_subscription";
  return !status.entitled;
}
