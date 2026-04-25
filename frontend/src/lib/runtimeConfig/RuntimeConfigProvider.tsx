import { type ReactNode, useEffect } from "react";
import { bumpRuntimeConfigGeneration } from "./runtimeConfigStore";

/**
 * Bumps config generation on visibility for post-launch live refresh (fetch can hook same signal later).
 */
export function RuntimeConfigProvider(props: { children: ReactNode }) {
  useEffect(() => {
    const onVis = (): void => {
      if (document.visibilityState === "visible") bumpRuntimeConfigGeneration();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return props.children;
}
