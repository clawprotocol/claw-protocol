import { useEffect, useState } from "react";

const QUICK_KEY = "lawdog_first_hint_quick_v1";
const CREATE_KEY = "lawdog_first_hint_create_v1";

/**
 * Show one-time (per browser tab session) micro-hints; then mark seen so repeats stay clean.
 */
export function useFirstSessionHint(surface: "quick" | "create"): boolean {
  const key = surface === "quick" ? QUICK_KEY : CREATE_KEY;
  const [show] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(key) !== "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!show) return;
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }, [key, show]);

  return show;
}
