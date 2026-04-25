import { AFFILIATE_DISCLOSURE_SHORT } from "../../compliance/disclosureCopy";

type Props = {
  /** e.g. `window.location.origin` */
  origin: string;
  className?: string;
  /** When false, only the three document links are shown. */
  showDisclosureReminder?: boolean;
};

/**
 * Compact affiliate-facing legal strip — disclosure duty + canonical policy links.
 */
export function AffiliateProgramLegalLinks(props: Props) {
  const { origin, className = "", showDisclosureReminder = true } = props;
  const base = origin.replace(/\/$/, "");
  const linkClass = "font-medium text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline";

  return (
    <nav className={className} aria-label="Affiliate legal links">
      {showDisclosureReminder ? (
        <p className="text-[10px] leading-relaxed text-slate-500">{AFFILIATE_DISCLOSURE_SHORT}</p>
      ) : null}
      <p className={`text-[10px] leading-relaxed text-slate-600 ${showDisclosureReminder ? "mt-2" : ""}`}>
        <a href={`${base}/affiliate-terms`} className={linkClass} target="_blank" rel="noopener noreferrer">
          Affiliate Terms
        </a>
        <span className="text-slate-700" aria-hidden>
          {" "}
          ·{" "}
        </span>
        <a href={`${base}/terms`} className={linkClass} target="_blank" rel="noopener noreferrer">
          Terms of Service
        </a>
        <span className="text-slate-700" aria-hidden>
          {" "}
          ·{" "}
        </span>
        <a href={`${base}/privacy`} className={linkClass} target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </a>
        <span className="text-slate-700" aria-hidden>
          {" "}
          ·{" "}
        </span>
        <a
          href={`${base}/privacy#privacy-contact`}
          className={linkClass}
          target="_blank"
          rel="noopener noreferrer"
        >
          Data &amp; privacy requests
        </a>
        <span className="text-slate-700" aria-hidden>
          {" "}
          ·{" "}
        </span>
        <a
          href={`${base}/privacy#privacy-cookies-choices`}
          className={linkClass}
          target="_blank"
          rel="noopener noreferrer"
        >
          Cookie &amp; storage choices
        </a>
      </p>
    </nav>
  );
}
