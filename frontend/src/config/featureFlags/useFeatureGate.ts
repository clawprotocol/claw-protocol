import { useMemo } from "react";
import type { FeatureGateKey } from "./keys";
import { resolveFeatureGate } from "./resolveGate";
import { useRuntimeConfigGeneration } from "../../lib/runtimeConfig/useRuntimeConfigGeneration";

export function useFeatureGate(key: FeatureGateKey): boolean {
  const gen = useRuntimeConfigGeneration();
  return useMemo(() => resolveFeatureGate(key), [key, gen]);
}
