import { DISCLOSURE_COPY } from "./disclosureCopy";

export type DisclosureBannerVariant = "legalAdjacentAi" | "esign" | "productTerms";

const TITLES: Record<DisclosureBannerVariant, string> = {
  legalAdjacentAi: "Assistive AI — you stay in charge",
  esign: "E-sign and records",
  productTerms: "What LawDog is (and isn’t)",
};

const BODIES: Record<DisclosureBannerVariant, string> = {
  legalAdjacentAi: DISCLOSURE_COPY.notLegalAdviceWorkproduct,
  esign: DISCLOSURE_COPY.esignBaseline,
  productTerms: DISCLOSURE_COPY.notLawFirmShort,
};

export function DisclosureBanner(props: {
  variant: DisclosureBannerVariant;
  className?: string;
}) {
  const { variant, className = "" } = props;
  return (
    <aside
      role="note"
      className={`rounded-lg border border-violet-800/40 bg-violet-950/25 px-3 py-2.5 text-left text-[11px] leading-snug text-violet-100/95 sm:text-xs ${className}`}
      aria-label={TITLES[variant]}
    >
      <p className="font-semibold text-violet-200/95">{TITLES[variant]}</p>
      <p className="mt-1 text-violet-100/85">{BODIES[variant]}</p>
    </aside>
  );
}
