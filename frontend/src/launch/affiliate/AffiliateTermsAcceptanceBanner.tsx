import { useState } from "react";
import { LAWDOG_COLORS } from "../../design/tokens";
import { acceptAffiliateTerms, readAffiliateTermsAccepted } from "../legal/affiliateTermsAcceptance";
import { AffiliateProgramLegalLinks } from "./AffiliateProgramLegalLinks";

/**
 * First visit / unlock acknowledgment — one checkbox, no modal wall.
 */
export function AffiliateTermsAcceptanceBanner() {
  const [show, setShow] = useState(
    () => typeof window !== "undefined" && !readAffiliateTermsAccepted(),
  );
  const [checked, setChecked] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  if (!show) return null;

  return (
    <div
      className="rounded-xl border px-4 py-4 text-left"
      style={{
        borderColor: `${LAWDOG_COLORS.cta_primary}33`,
        backgroundColor: LAWDOG_COLORS.bg_secondary,
      }}
      role="region"
      aria-label="Affiliate program terms"
    >
      <p className="text-sm font-medium text-slate-100">Affiliate program</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        One-time acknowledgment — then your dashboard and link work as usual.
      </p>
      <AffiliateProgramLegalLinks origin={origin} className="mt-3" />
      <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed text-slate-300">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 focus:ring-offset-slate-950"
          style={{ accentColor: LAWDOG_COLORS.cta_primary }}
        />
        <span>
          I have read and agree to the{" "}
          <span className="font-medium text-slate-200">Affiliate Terms</span>,{" "}
          <span className="font-medium text-slate-200">Terms of Service</span>,{" "}
          <span className="font-medium text-slate-200">Privacy Policy</span>, and the data-request / cookie notices
          linked above.
        </span>
      </label>
      <button
        type="button"
        className="vs01-btn vs01-btn--primary vs01-btn--compact mt-4"
        disabled={!checked}
        onClick={() => {
          acceptAffiliateTerms();
          setShow(false);
        }}
      >
        Continue
      </button>
    </div>
  );
}
