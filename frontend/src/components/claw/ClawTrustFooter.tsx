import { agreementPublicVerifyPath } from "../../agreement/agreementPublicVerify";

type Props = {
  agreementId: string;
  className?: string;
  /** Softer, agreement-focused wording for recipient review (no “proof record” jargon). */
  variant?: "default" | "recipient";
};

/**
 * Subtle trust-first footer — not an ad; reinforces verifiability.
 */
export function ClawTrustFooter({ agreementId, className = "", variant = "default" }: Props) {
  const id = String(agreementId || "").trim();
  if (!id) return null;
  const path = agreementPublicVerifyPath(id);
  const href = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
  if (variant === "recipient") {
    return (
      <footer
        className={`border-t border-slate-800/70 pt-3 text-center ${className}`}
        aria-label="Agreement record with LawDog"
      >
        <p className="text-[10px] leading-relaxed text-slate-500">
          <span className="text-slate-400">Recorded with LawDog</span>
          <span className="mx-1.5 text-slate-600">·</span>
          <span>Version history</span>
          <span className="mx-1.5 text-slate-600">·</span>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-sky-500/95 underline-offset-2 hover:text-sky-400 hover:underline"
          >
            View status page
          </a>
        </p>
      </footer>
    );
  }
  return (
    <footer
      className={`border-t border-slate-800/70 pt-4 text-center ${className}`}
      aria-label="LawDog proof record attribution"
    >
      <p className="text-[10px] leading-relaxed text-slate-500">
        <span className="text-slate-400">Recorded with LawDog</span>
        <span className="mx-1.5 text-slate-600">·</span>
        <span>Proof record · Version history</span>
        <span className="mx-1.5 text-slate-600">·</span>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-sky-500/95 underline-offset-2 hover:text-sky-400 hover:underline"
        >
          View verification
        </a>
      </p>
    </footer>
  );
}
