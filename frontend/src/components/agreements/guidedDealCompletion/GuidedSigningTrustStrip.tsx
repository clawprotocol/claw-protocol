export type GuidedSigningTrustStripProps = {
  /** Guided bulk apply finished — signing version includes updates. */
  agreementAuthoritativelyUpdated?: boolean;
  /** User prepared signing packet after a prior guided version. */
  packetStale?: boolean;
  /** Packet was prepared on current agreement version. */
  packetPreparedOnCurrentVersion?: boolean;
  className?: string;
};

export function GuidedSigningTrustStrip({
  agreementAuthoritativelyUpdated = false,
  packetStale = false,
  packetPreparedOnCurrentVersion = false,
  className = "",
}: GuidedSigningTrustStripProps) {
  if (!agreementAuthoritativelyUpdated && !packetStale && !packetPreparedOnCurrentVersion) {
    return null;
  }

  if (packetStale) {
    return (
      <p
        className={`rounded-md border border-amber-400/50 bg-amber-950/40 px-3 py-2 text-xs leading-relaxed text-amber-100 ${className}`}
        role="alert"
        data-testid="guided-packet-stale-banner"
      >
        <span className="font-semibold">Refresh signing packet.</span> The agreement changed after the packet
        was prepared. Re-prepare before you send for signature.
      </p>
    );
  }

  if (packetPreparedOnCurrentVersion) {
    return (
      <p
        className={`text-xs leading-relaxed text-slate-400 ${className}`}
        data-testid="guided-packet-prepared-trust"
      >
        Signing version ready — packet matches your latest agreement.
      </p>
    );
  }

  return (
    <p
      className={`text-xs leading-relaxed text-slate-400 ${className}`}
      data-testid="guided-signing-trust-copy"
    >
      Signing version will include all updates above.
    </p>
  );
}
