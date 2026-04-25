import { LAWDOG_EMBLEM_SRC } from "../../design/tokens";

type Props = {
  /** ~22px height */
  size?: "sm" | "md";
  className?: string;
};

const HEIGHT: Record<NonNullable<Props["size"]>, number> = {
  sm: 22,
  md: 28,
};

/**
 * Small inline LawDog mark for “recorded” / success surfaces — entrance animation via `.lawdog-recorded-mark`.
 */
export function LawdogRecordedMark({ size = "sm", className = "" }: Props) {
  const h = HEIGHT[size];
  return (
    <span
      className={`lawdog-recorded-mark ${className}`.trim()}
      style={{ width: h, height: h }}
      aria-hidden
    >
      <img
        src={LAWDOG_EMBLEM_SRC}
        alt=""
        width={h}
        height={h}
        className="object-contain brightness-0 invert"
        decoding="async"
      />
    </span>
  );
}
