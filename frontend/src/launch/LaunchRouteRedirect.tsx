import { useEffect } from "react";
import { useLaunchNav } from "./LaunchNavContext";

/** Client-side redirect for legacy bookmarks — shows a brief status while history updates. */
export function LaunchRouteRedirect(props: { to: string; label?: string }) {
  const { navigate } = useLaunchNav();
  const { to, label = "Redirecting…" } = props;

  useEffect(() => {
    navigate(to);
  }, [navigate, to]);

  return (
    <div className="px-4 py-16 text-center text-sm text-slate-400" role="status">
      {label}
    </div>
  );
}
