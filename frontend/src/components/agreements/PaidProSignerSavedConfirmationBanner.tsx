import {
  formatPaidProSignerSavedMappings,
  PAID_PRO_SIGNER_SAVED_BANNER_HEADLINE,
  type PaidProSignerSavedMapping,
} from "./paidProReviewTrustUx";

type Props = {
  mappings: readonly PaidProSignerSavedMapping[];
};

export function PaidProSignerSavedConfirmationBanner({ mappings }: Props) {
  const lines = formatPaidProSignerSavedMappings(mappings);
  if (!lines.length) return null;

  return (
    <div
      className="rounded-md border border-emerald-300/80 bg-emerald-50/90 px-3 py-2.5 sm:px-3.5"
      role="status"
      aria-live="polite"
      data-testid="paid-pro-signer-saved-confirmation"
    >
      <p className="text-xs font-semibold text-emerald-950">{PAID_PRO_SIGNER_SAVED_BANNER_HEADLINE}</p>
      <ul className="mt-2 space-y-1.5" data-testid="paid-pro-signer-saved-mappings">
        {lines.map((line, idx) => {
          const [party, signer] = line.split("\n→ ");
          return (
            <li key={`${party}-${idx}`} className="text-xs leading-snug text-emerald-950/95">
              <span className="font-medium">{party}</span>
              <span className="mt-0.5 block pl-0.5 text-emerald-900/90" aria-hidden>
                →
              </span>
              <span className="block font-semibold text-emerald-950">{signer}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
