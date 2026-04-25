import {
  NO_ATTORNEY_CLIENT,
  NO_GUARANTEE_ENFORCEABILITY,
  NOT_LEGAL_ADVICE,
  PRICING_NO_GUARANTEE,
  PRODUCT_NOT_LAW_FIRM,
} from "./disclosureCopy";
import { SpaLink } from "../launch/SpaLink";

/**
 * Persistent compliance strip for marketing / app shell footers.
 */
export function DisclosureFooter(props: {
  className?: string;
  dense?: boolean;
  /** Light marketing pages need higher-contrast links on pale backgrounds. */
  tone?: "dark" | "light";
  /**
   * Product lane + legal links only — omits pricing and cookie note for flow shells where a shorter strip is enough.
   */
  slim?: boolean;
}) {
  const { className = "", dense, tone = "dark", slim = false } = props;
  const linkClass =
    tone === "light"
      ? "inline-flex min-h-10 items-center font-semibold text-emerald-900 underline-offset-2 hover:text-emerald-950 hover:underline"
      : "font-medium text-emerald-400/95 underline-offset-2 hover:text-emerald-200 hover:underline";
  const metaClass = tone === "light" ? "text-slate-600" : "text-slate-600";
  const borderClass = tone === "light" ? "border-slate-200" : "border-slate-800/80";
  const rootTypography =
    tone === "light"
      ? "space-y-3 pt-4 text-base leading-relaxed"
      : dense
        ? "space-y-2 pt-3 text-xs leading-relaxed"
        : "space-y-2 pt-4 text-sm leading-relaxed";
  const cookieTypography = tone === "light" ? "text-sm leading-relaxed" : "text-xs leading-relaxed";
  const laneClass =
    tone === "light"
      ? "text-slate-600"
      : dense
        ? "text-slate-500"
        : "text-slate-500";
  return (
    <div className={`border-t ${borderClass} text-slate-500 ${rootTypography} ${className}`}>
      <div className={`space-y-1.5 ${laneClass}`} role="note" aria-label="Product and legal notices">
        <p className="m-0">{PRODUCT_NOT_LAW_FIRM}</p>
        <p className="m-0">{NOT_LEGAL_ADVICE}</p>
        <p className="m-0">{NO_ATTORNEY_CLIENT}</p>
        <p className="m-0">{NO_GUARANTEE_ENFORCEABILITY}</p>
      </div>
      {!slim ? <p className="m-0">{PRICING_NO_GUARANTEE}</p> : null}
      <p className={`m-0 flex flex-wrap gap-x-4 gap-y-2 ${metaClass}`}>
        <SpaLink to="/terms" className={linkClass}>
          Terms of Service
        </SpaLink>
        <SpaLink to="/privacy" className={linkClass}>
          Privacy Policy
        </SpaLink>
        <SpaLink to="/privacy#privacy-contact" className={linkClass}>
          Data &amp; privacy requests
        </SpaLink>
        <SpaLink to="/privacy#privacy-cookies-choices" className={linkClass}>
          Cookie &amp; storage choices
        </SpaLink>
      </p>
      {!slim ? (
        <>
          <p className={`m-0 ${cookieTypography} ${metaClass}`}>
            First-party cookies and local storage keep sign-in and core features working. Core product use does not
            depend on non-essential third-party advertising cookies. There is no in-app cookie preferences panel — manage
            cookies and site data in your browser or device settings. See{" "}
            <SpaLink to="/privacy#privacy-cookies-choices" className={linkClass}>
              Cookie &amp; storage choices
            </SpaLink>{" "}
            in the Privacy Policy.
          </p>
        </>
      ) : null}
    </div>
  );
}
