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
          ? "vs01-prep-prepared-banner mb-3 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2.5"
          : "vs01-prep-prepared-banner mb-3 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2.5"
      }
      role="status"
      data-testid="vs01-prep-prepared-banner"
    >
      <p className={ready ? "text-sm font-semibold text-slate-950" : "text-sm font-semibold text-slate-950"}>
        {ready ? "Links created—share when ready." : "Preparing agreement."}
      </p>
      <p className={ready ? "mt-0.5 text-xs text-slate-600" : "mt-0.5 text-xs text-slate-600"}>
        {ready
          ? "Signature fields are placed for each signer."
          : "The signing packet will appear when the agreement is ready."}
      </p>
      <p className={ready ? "mt-1.5 text-[11px] text-slate-500" : "mt-1.5 text-[11px] text-slate-500"}>
        <span className="font-medium">{agreementTitle.trim() || "Your agreement"}</span>
        {" · "}
        {signerCount} signer{signerCount === 1 ? "" : "s"}
        {" · "}
        {fieldCount} field{fieldCount === 1 ? "" : "s"} placed
        {autoPrepared ? " · latest version" : ""}
      </p>
      {message ? (
        <p className={ready ? "mt-1 text-[11px] text-slate-500" : "mt-1 text-[11px] text-slate-500"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
