import type { ReactNode } from "react";
import { useLaunchNav } from "./LaunchNavContext";

/** Same-origin path + optional hash; uses client nav unless the user opens a new tab or uses modified clicks. */
export function SpaLink(props: { to: string; className?: string; children: ReactNode }) {
  const { navigate } = useLaunchNav();
  const { to, className, children } = props;
  return (
    <a
      href={to}
      className={[className, "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/70"].filter(Boolean).join(" ")}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
