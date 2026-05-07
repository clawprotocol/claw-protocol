export type ProofBadgeState = "draft" | "pending" | "signed" | "verified";

const LABEL: Record<ProofBadgeState, string> = {
  draft: "Draft",
  pending: "Pending",
  signed: "Signed",
  /** Fully executed record — avoid “Verified” (implies third-party attestation). */
  verified: "Record complete",
};

const STYLE: Record<ProofBadgeState, string> = {
  draft: "border-slate-600/90 bg-slate-900/55 text-slate-300",
  pending: "border-amber-700/45 bg-amber-950/25 text-amber-100",
  signed: "border-emerald-700/40 bg-emerald-950/25 text-emerald-100",
  verified: "border-sky-700/45 bg-sky-950/28 text-sky-100",
};

type Props = {
  state: ProofBadgeState;
  className?: string;
  /** Hover / SR context; recipient review uses shorter wording. */
  title?: string;
};

/** Record state for agreements and public verification views. */
export function ProofBadge({ state, className = "", title = "Agreement record status (LawDog)" }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${STYLE[state]} ${className}`}
      title={title}
    >
      {LABEL[state]}
    </span>
  );
}
