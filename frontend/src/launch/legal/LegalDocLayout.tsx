import type { ReactNode } from "react";
import { useEffect } from "react";
import { DisclosureFooter } from "../../compliance/DisclosureFooter";
import { LAWDOG_COLORS } from "../../design/tokens";
import { useLaunchNav } from "../LaunchNavContext";
import "../../vs01/vs01.css";
import { LEGAL_OPERATING_ENTITY, LEGAL_PRODUCT_NAME } from "./legalConstants";

const accent = LAWDOG_COLORS.cta_primary;
const accentMuted = LAWDOG_COLORS.cta_hover;

export function LegalSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="text-[11px] font-semibold uppercase tracking-[0.14em]"
      style={{ color: accent }}
    >
      {children}
    </h2>
  );
}

type Props = {
  title: string;
  /** Shown under the H1 — effective date or version note */
  meta?: string;
  children: ReactNode;
  /** When false, omits the trust strip (e.g. if redundant on a short page). */
  showTrustLine?: boolean;
  /** Stable id on the page header for SPA scroll-to-top when the URL has no hash. */
  documentTopId: string;
};

export function LegalDocLayout(props: Props) {
  const { navigate, pathname, hash } = useLaunchNav();
  const { title, meta, children, showTrustLine = true, documentTopId } = props;

  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const raw = (hash || (typeof window !== "undefined" ? window.location.hash : "") || "").replace(/^#/, "").trim();
        if (raw) {
          const target = document.getElementById(raw);
          if (target) {
            target.scrollIntoView({ block: "start", behavior: "auto" });
            return;
          }
        }
        const topEl = document.getElementById(documentTopId);
        if (topEl) {
          topEl.scrollIntoView({ block: "start", behavior: "auto" });
        }
        window.scrollTo(0, 0);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [pathname, hash, documentTopId]);

  return (
    <div className="min-h-screen text-slate-200" style={{ backgroundColor: LAWDOG_COLORS.bg_primary }}>
      <div className="vs01-accent-strip" aria-hidden />
      <div
        className="mx-auto w-full max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl px-4 pb-20 pt-8 sm:px-6 md:px-8 lg:px-10"
        style={{ borderTop: `1px solid ${LAWDOG_COLORS.bg_secondary}` }}
      >
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--compact mb-8"
          onClick={() => navigate("/app")}
        >
          ← Workspace
        </button>
        <article className="space-y-8">
          <header id={documentTopId} className="scroll-mt-8 w-full border-b border-slate-800/90 pb-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {LEGAL_OPERATING_ENTITY} · {LEGAL_PRODUCT_NAME}
            </p>
            <h1 className="mt-3 font-semibold tracking-tight text-slate-50" style={{ fontSize: "1.5rem" }}>
              {title}
            </h1>
            {meta ? (
              <p className="mt-2 text-xs text-slate-500">{meta}</p>
            ) : null}
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              {LEGAL_OPERATING_ENTITY} operates {LEGAL_PRODUCT_NAME}. These materials summarize how the service works
              and are not a substitute for advice from a licensed attorney in your jurisdiction.
            </p>
            {showTrustLine ? (
              <p
                className="mt-4 rounded-lg border border-slate-800/90 px-3 py-2.5 text-sm leading-snug text-slate-400"
                style={{ backgroundColor: LAWDOG_COLORS.bg_secondary }}
              >
                <span style={{ color: accentMuted }}>You own what you create.</span> {LEGAL_PRODUCT_NAME} records it.
              </p>
            ) : null}
          </header>
          <div className="mx-auto w-full max-w-none md:max-w-[78ch] lg:max-w-[88ch] xl:max-w-[96ch] space-y-7 text-sm leading-relaxed text-slate-300">
            {children}
          </div>
          <footer className="mt-10 w-full min-w-0 border-t border-slate-800/80 pt-6">
            <DisclosureFooter slim dense className="w-full max-w-none border-0 pt-0" />
          </footer>
        </article>
      </div>
    </div>
  );
}
