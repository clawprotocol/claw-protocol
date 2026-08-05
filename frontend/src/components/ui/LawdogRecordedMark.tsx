import { LawdogEmblem } from "./LawdogEmblem";

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
 * Inherits success green from parent `color` (currentColor).
 */
export function LawdogRecordedMark({ size = "sm", className = "" }: Props) {
  const h = HEIGHT[size];
  return (
    <span
      className={`lawdog-recorded-mark ${className}`.trim()}
      style={{ width: h, height: h }}
      aria-hidden
    >
      <LawdogEmblem size={h} />
    </span>
  );
}
