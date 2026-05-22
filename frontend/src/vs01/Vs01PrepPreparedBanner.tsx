type Vs01PrepPreparedBannerProps = {
  agreementTitle: string;
  signerCount: number;
  fieldCount: number;
  autoPrepared?: boolean;
  message?: string | null;
};

export function Vs01PrepPreparedBanner({
  agreementTitle,
  signerCount,
  fieldCount,
  autoPrepared = false,
  message,
}: Vs01PrepPreparedBannerProps) {
  if (fieldCount <= 0 && !message) return null;
  return (
    <div
      className="vs01-prep-prepared-banner mb-3 rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-3 py-2.5"
      role="status"
      data-testid="vs01-prep-prepared-banner"
    >
      <p className="text-sm font-semibold text-emerald-950">Signing packet prepared</p>
      <p className="mt-0.5 text-xs text-emerald-900/90">
        <span className="font-medium">{agreementTitle.trim() || "Your agreement"}</span>
        {" · "}
        {signerCount} signer{signerCount === 1 ? "" : "s"}
        {" · "}
        {fieldCount} field{fieldCount === 1 ? "" : "s"} placed
        {autoPrepared ? " · auto-prepared" : ""}
      </p>
      {message ? <p className="mt-1 text-[11px] text-emerald-800/95">{message}</p> : null}
      <p className="mt-1 text-[11px] text-emerald-800/80">Ready for signature — review placement, then send.</p>
    </div>
  );
}
