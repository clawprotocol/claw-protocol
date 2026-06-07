import type { ReactNode } from "react";
import { AccessAccountPanel } from "../components/access/AccessAccountPanel";

/** Low-risk promo on recipient approved/waiting screen — no account or billing language. */
export const RECIPIENT_APPROVED_LAWDOG_PROMO_LINE =
  "Reviewed with LawDog — plain-English agreements, review, and signing.";

export const RECIPIENT_REVIEW_ACCOUNT_HEADER_ASIDE = (
  <details className="vs01-access-disclosure text-left">
    <summary className="cursor-pointer list-none text-center text-sm text-slate-400 marker:content-none">
      <span className="inline-flex min-h-9 items-center rounded-full border border-slate-700/80 bg-slate-900/50 px-3 py-1.5 hover:border-slate-600">
        Account
      </span>
    </summary>
    <div className="mt-2">
      <AccessAccountPanel />
    </div>
  </details>
);

/** Hide plan/billing chrome for recipient reviewers after they approve. */
export function resolveRecipientReviewHeaderAside(hideAccountPanel: boolean): ReactNode | null {
  return hideAccountPanel ? null : RECIPIENT_REVIEW_ACCOUNT_HEADER_ASIDE;
}
