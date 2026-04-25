import type { FeatureGateKey } from "../../config/featureFlags/keys";
import type { DynamicConfigRoot } from "../../config/dynamicConfig/types";
import { DYNAMIC_CONFIG_DEFAULTS } from "../../config/dynamicConfig/defaults";
import { mergeDynamicConfig, mergeDynamicOverrides } from "../../config/dynamicConfig/mergeDynamic";
import type { DeepPartialConfig } from "./apiShapesV1";

type Listener = () => void;
const listeners = new Set<Listener>();

let gateOverrides: Partial<Record<FeatureGateKey, boolean>> = {};
let dynamicLayer: Partial<DynamicConfigRoot> = {};
let experimentOverrides: Record<string, string> = {};
let generation = 0;

export function subscribeRuntimeConfig(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRuntimeConfigGeneration(): number {
  return generation;
}

export function bumpRuntimeConfigGeneration(): void {
  generation += 1;
  listeners.forEach((l) => l());
}

export function patchRuntimeGateOverrides(p: Partial<Record<FeatureGateKey, boolean>>): void {
  gateOverrides = { ...gateOverrides, ...p };
  bumpRuntimeConfigGeneration();
}

export function patchRuntimeDynamic(p: DeepPartialConfig<DynamicConfigRoot>): void {
  dynamicLayer = mergeDynamicOverrides(dynamicLayer, p as Partial<DynamicConfigRoot>);
  bumpRuntimeConfigGeneration();
}

export function resetRuntimeConfigForTests(): void {
  dynamicLayer = {};
  gateOverrides = {};
  experimentOverrides = {};
  bumpRuntimeConfigGeneration();
}

export function getRuntimeExperimentOverride(experimentKey: string): string | undefined {
  return experimentOverrides[experimentKey];
}

export function getRuntimeGateOverride(key: FeatureGateKey): boolean | undefined {
  return gateOverrides[key];
}

export function getMergedDynamicConfig(): DynamicConfigRoot {
  return mergeDynamicConfig(DYNAMIC_CONFIG_DEFAULTS, dynamicLayer);
}

export function hydrateRuntimeConfigFromPartial(p: {
  featureGates?: Partial<Record<FeatureGateKey, boolean>>;
  dynamic?: DeepPartialConfig<DynamicConfigRoot>;
  experimentVariants?: Record<string, string>;
}): void {
  if (p.featureGates) gateOverrides = { ...gateOverrides, ...p.featureGates };
  if (p.dynamic) {
    dynamicLayer = mergeDynamicOverrides(dynamicLayer, p.dynamic as Partial<DynamicConfigRoot>);
  }
  if (p.experimentVariants) {
    experimentOverrides = { ...experimentOverrides, ...p.experimentVariants };
  }
  bumpRuntimeConfigGeneration();
}
