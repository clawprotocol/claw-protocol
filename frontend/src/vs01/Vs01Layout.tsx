import type { ReactNode } from "react";
import { DisclosureFooter } from "../compliance/DisclosureFooter";
import { NOT_LEGAL_ADVICE } from "../compliance/disclosureCopy";
import { LawdogLogoLink } from "../components/ui/LawdogLogoLink";
import "./vs01.css";

export type Vs01LayoutHero = {
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
export function Vs01Layout({ children, hero, productNav, headerAside }: Vs01LayoutProps) {
  const h = hero ?? DEFAULT_HERO;
  return (
    <div className="vs01-root">
      <div className="vs01-accent-strip" aria-hidden />
      <div className="vs01-shell">
        <div className="flex items-center border-b border-slate-800/60 pb-3 pt-1">
          <LawdogLogoLink homeHref="/app" wordmark surface="dark" />
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
              <span className="vs01-header-eyebrow">{h.eyebrow}</span>
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
          <p>
            <strong>Disclaimer:</strong> This interface is informational. {NOT_LEGAL_ADVICE}
            CLAW outputs are evidence records; verification is cryptographic and file-based.
          </p>
          <p>
            VS01 receipt ids often look like <code>rcpt_…</code>. They are{" "}
            <strong>not</strong> the same namespace as timeline receipts under{" "}
            <code>/v1/timeline/receipts/…</code>.
          </p>
          <DisclosureFooter slim dense className="border-0 pt-3" />
        </footer>
      </div>
    </div>
  );
}
