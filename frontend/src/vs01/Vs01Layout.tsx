import type { ReactNode } from "react";
import { DisclosureFooter } from "../compliance/DisclosureFooter";
import { NOT_LEGAL_ADVICE, PRODUCT_NOT_LAW_FIRM } from "../compliance/disclosureCopy";
import { LawdogLogoLink } from "../components/ui/LawdogLogoLink";
import "./vs01.css";

export type Vs01LayoutHero = {
  /** Omitted on surfaces where no product eyebrow is shown (e.g. public recipient review). */
  eyebrow?: string;
  title: string;
  subtitle: string;
  tagline?: string;
};

export type Vs01LayoutProps = {
  children: ReactNode;
  /** When set, overrides the default VS01 marketing header copy. */
  hero?: Vs01LayoutHero;
  /** Optional control shown under the header (e.g. return to launch). */
  productNav?: { label: string; onClick: () => void } | null;
  /** e.g. plan / usage summary — kept visually secondary to hero copy. */
  headerAside?: ReactNode;
  /**
   * First sentence after the disclaimer lead-in (evidence / verification).
   * Default references CLAW for legacy VS01 surfaces; recipient-facing flows should pass LawDog wording.
   */
  footerEvidenceSentence?: string;
  /**
   * Public recipient review: two-line trust strip + collapsible full legal stack (DisclosureFooter, VS01 note).
   */
  recipientPublicFooter?: boolean;
  /** Logo target — public recipient flows use `/`; creator workspace uses `/app`. */
  logoHomeHref?: string;
};

const DEFAULT_HERO: Vs01LayoutHero = {
  eyebrow: "CLAW",
  title: "VS01",
  subtitle:
    "Finalize a document, run signing, then download a verification bundle you can check locally.",
  tagline: "Proof you can verify yourself — cryptographic, file-based, independent of operators.",
};

/**
 * VS01 pilot shell: accent strip, header, main slot, footer/disclaimer.
 * API-free; children typically {@link Vs01Wizard}.
 */
const DEFAULT_FOOTER_EVIDENCE_SENTENCE =
  "CLAW outputs are evidence records; verification is cryptographic and file-based.";

const VERIFICATION_SHORT_LINE = "Verification is cryptographic and file-based.";

export function Vs01Layout({
  children,
  hero,
  productNav,
  headerAside,
  footerEvidenceSentence,
  recipientPublicFooter,
  logoHomeHref,
}: Vs01LayoutProps) {
  const h = hero ?? DEFAULT_HERO;
  const evidenceSentence = footerEvidenceSentence ?? DEFAULT_FOOTER_EVIDENCE_SENTENCE;
  const resolvedLogoHomeHref = logoHomeHref ?? (recipientPublicFooter ? "/" : "/app");
  return (
    <div className="vs01-root">
      <div className="vs01-accent-strip" aria-hidden />
      <div className="vs01-shell">
        <div className="flex items-center border-b border-slate-800/60 pb-3 pt-1">
          <LawdogLogoLink homeHref={resolvedLogoHomeHref} wordmark surface="dark" />
        </div>
        <header className="vs01-header" role="banner" aria-labelledby="vs01-shell-title">
          <div className="vs01-header-panel">
            {productNav ? (
              <div className="vs01-header-product-nav">
                <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact" onClick={productNav.onClick}>
                  {productNav.label}
                </button>
              </div>
            ) : null}
            {headerAside ? <div className="vs01-header-aside">{headerAside}</div> : null}
            <div className="vs01-header-brand">
              {h.eyebrow ? <span className="vs01-header-eyebrow">{h.eyebrow}</span> : null}
              <h1 id="vs01-shell-title" className="vs01-header-title">
                {h.title}
              </h1>
            </div>
            <p className="vs01-header-subtitle">{h.subtitle}</p>
            {h.tagline ? <p className="vs01-header-tagline">{h.tagline}</p> : null}
          </div>
        </header>
        <main className="vs01-main">{children}</main>
        <footer className="vs01-footer">
          {recipientPublicFooter ? (
            <>
              <p className="m-0 text-xs leading-relaxed text-slate-400">{PRODUCT_NOT_LAW_FIRM}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{VERIFICATION_SHORT_LINE}</p>
              <details className="mt-3 rounded-md border border-slate-800/70 bg-slate-950/30 px-3 py-2">
                <summary className="cursor-pointer list-none text-xs font-medium text-sky-400/95 marker:content-none hover:text-sky-300 [&::-webkit-details-marker]:hidden">
                  Legal disclosures
                </summary>
                <div className="mt-2 space-y-2 border-t border-slate-800/60 pt-2 text-xs leading-relaxed text-slate-500">
                  <p className="m-0">
                    <strong>Disclaimer:</strong> This interface is informational. {NOT_LEGAL_ADVICE}
                    {evidenceSentence}
                  </p>
                  <p className="m-0">
                    VS01 receipt ids often look like <code>rcpt_…</code>. They are{" "}
                    <strong>not</strong> the same namespace as timeline receipts under{" "}
                    <code>/v1/timeline/receipts/…</code>.
                  </p>
                  <DisclosureFooter slim dense className="border-0 pt-1" />
                </div>
              </details>
            </>
          ) : (
            <>
              <p>
                <strong>Disclaimer:</strong> This interface is informational. {NOT_LEGAL_ADVICE}
                {evidenceSentence}
              </p>
              <p>
                VS01 receipt ids often look like <code>rcpt_…</code>. They are{" "}
                <strong>not</strong> the same namespace as timeline receipts under{" "}
                <code>/v1/timeline/receipts/…</code>.
              </p>
              <DisclosureFooter slim dense className="border-0 pt-3" />
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
