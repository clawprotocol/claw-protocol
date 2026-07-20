import { MANAGE_BILLING_FROM_BILLING_SHORT } from "../compliance/disclosureCopy";
import { LAWDOG_SUPPORT_EMAIL, LAWDOG_SUPPORT_MAILTO } from "./supportContact";

/**
 * Support-backed cancellation — no self-serve Stripe Customer Portal in this build.
 */
export function BillingCancellationPanel(props: { workspaceId?: string | null }) {
  const workspaceId = (props.workspaceId || "").trim();
  const subject = workspaceId
    ? encodeURIComponent(`LawDog subscription cancellation — workspace ${workspaceId}`)
    : encodeURIComponent("LawDog subscription cancellation");

  return (
    <section
      className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-5 sm:p-6"
      aria-labelledby="billing-cancel-heading"
      data-testid="billing-cancellation-panel"
    >
      <h2 id="billing-cancel-heading" className="text-sm font-semibold text-white">
        Cancel or change your plan
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{MANAGE_BILLING_FROM_BILLING_SHORT}</p>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">
        Include your workspace id{workspaceId ? " (shown below)" : ""} and the email used at checkout so we can locate
        your subscription. We do not offer a self-serve billing portal in this release.
      </p>
      <a
        href={`${LAWDOG_SUPPORT_MAILTO}?subject=${subject}`}
        className="mt-4 inline-flex items-center rounded-lg border border-emerald-800/40 bg-emerald-950/25 px-4 py-2.5 text-sm font-medium text-emerald-200 hover:bg-emerald-950/40"
      >
        Email {LAWDOG_SUPPORT_EMAIL} to cancel
      </a>
    </section>
  );
}
