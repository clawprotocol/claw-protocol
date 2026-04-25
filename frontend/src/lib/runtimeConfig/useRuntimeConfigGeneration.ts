import { useSyncExternalStore } from "react";
import { getRuntimeConfigGeneration, subscribeRuntimeConfig } from "./runtimeConfigStore";

export function useRuntimeConfigGeneration(): number {
  return useSyncExternalStore(subscribeRuntimeConfig, getRuntimeConfigGeneration, getRuntimeConfigGeneration);
}
