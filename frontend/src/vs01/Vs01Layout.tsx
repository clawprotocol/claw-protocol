import type { ReactNode } from "react";
import "./vs01.css";

export type Vs01LayoutProps = {
  children: ReactNode;
};

/**
 * VS01 pilot shell: accent strip, header, main slot, footer/disclaimer.
 * API-free; children typically {@link Vs01Wizard}.
 */
export function Vs01Layout({ children }: Vs01LayoutProps) {
  return (
    <div className="vs01-root">
      <div className="vs01-accent-strip" aria-hidden />
      <div className="vs01-shell">
        <header>
          <h1 className="vs01-header-title">CLAW · VS01</h1>
          <p className="vs01-header-subtitle">
            Finalize a document, bind a sign session, and download a verification bundle.
          </p>
          <p className="vs01-header-tagline">
            Proof you can verify — keep it human, keep it honest.
          </p>
        </header>
        {children}
        <footer className="vs01-footer">
          <p>
            <strong>Disclaimer:</strong> This interface is informational. It is not legal advice.
            CLAW outputs are evidence records; verification is cryptographic and file-based.
          </p>
          <p>
            VS01 receipt ids often look like <code>rcpt_…</code>. They are{" "}
            <strong>not</strong> the same namespace as timeline receipts under{" "}
            <code>/v1/timeline/receipts/…</code>.
          </p>
        </footer>
      </div>
    </div>
  );
}
