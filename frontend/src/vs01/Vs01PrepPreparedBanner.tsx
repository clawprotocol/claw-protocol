type Vs01PrepPreparedBannerProps = {
  agreementTitle: string;
  signerCount: number;
  fieldCount: number;
  autoPrepared?: boolean;
  message?: string | null;
  ready?: boolean;
};

export function Vs01PrepPreparedBanner({
  agreementTitle,
  signerCount,
  fieldCount,
  autoPrepared = false,
  message,
  ready = true,
}: Vs01PrepPreparedBannerProps) {
  if (fieldCount <= 0 && !message) return null;
  return (
    <div
      className={
        ready
          ? "vs01-prep-prepared-banner mb-3 rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-3 py-2.5"
          : "vs01-prep-prepared-banner mb-3 rounded-lg border border-amber-300/80 bg-amber-50/95 px-3 py-2.5"
      }
      role="status"
      data-testid="vs01-prep-prepared-banner"
    >
      <p className={ready ? "text-sm font-semibold text-emerald-950" : "text-sm font-semibold text-amber-950"}>
        {ready ? "LawDog prepared your signing packet" : "Review required before sending"}
      </p>
      <p className={ready ? "mt-0.5 text-xs text-emerald-900/90" : "mt-0.5 text-xs text-amber-900/90"}>
        {ready
          ? "Signature fields were placed automatically. Review once, then send."
          : "Initials or signature fields overlap the document. Rebuild placement before creating signing links."}
      </p>
      <p className={ready ? "mt-1.5 text-[11px] text-emerald-800/90" : "mt-1.5 text-[11px] text-amber-900/90"}>
        <span className="font-medium">{agreementTitle.trim() || "Your agreement"}</span>
        {" · "}
        {signerCount} signer{signerCount === 1 ? "" : "s"}
        {" · "}
        {fieldCount} field{fieldCount === 1 ? "" : "s"} placed
        {autoPrepared ? " · latest version" : ""}
      </p>
      {message ? (
        <p className={ready ? "mt-1 text-[11px] text-emerald-800/95" : "mt-1 text-[11px] text-amber-900/95"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
