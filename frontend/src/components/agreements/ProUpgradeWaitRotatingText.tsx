import { useEffect, useRef, useState } from "react";

type Props = {
  lines: readonly string[];
  intervalMs?: number;
  active: boolean;
  className?: string;
  onLineChange?: (line: string) => void;
};

/**
 * Cycles through calm progress lines (accessibility: polite live region).
 */
export function ProUpgradeWaitRotatingText({
  lines,
  intervalMs = 5000,
  active,
  className,
  onLineChange,
}: Props) {
  const [i, setI] = useState(0);
  const safe = lines.length ? i % lines.length : 0;
  const line = lines[safe] ?? "";
  const onLineChangeRef = useRef(onLineChange);
  onLineChangeRef.current = onLineChange;

  useEffect(() => {
    if (!active || lines.length < 2) return;
    const t = window.setInterval(() => setI((j) => j + 1), intervalMs);
    return () => window.clearInterval(t);
  }, [active, intervalMs, lines.length]);

  useEffect(() => {
    if (active) setI(0);
  }, [active]);

  useEffect(() => {
    if (!line || !active) return;
    onLineChangeRef.current?.(line);
  }, [line, active]);

  if (!line) return null;
  return (
    <p className={className} role="status" aria-live="polite" aria-atomic>
      {line}
    </p>
  );
}
