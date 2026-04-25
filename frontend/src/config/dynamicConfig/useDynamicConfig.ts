import { useMemo } from "react";
import { getMergedDynamicConfig } from "../../lib/runtimeConfig/runtimeConfigStore";
import { useRuntimeConfigGeneration } from "../../lib/runtimeConfig/useRuntimeConfigGeneration";
import type { DynamicConfigRoot } from "./types";

export function useDynamicConfig(): DynamicConfigRoot {
  const gen = useRuntimeConfigGeneration();
  return useMemo(() => getMergedDynamicConfig(), [gen]);
}
