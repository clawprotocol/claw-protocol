import { FEATURE_GATE_ENV_KEYS, readBooleanEnv } from "./envMap";
import { FEATURE_GATE_REGISTRY, type FeatureGateKey } from "./keys";
import { getRuntimeGateOverride } from "../../lib/runtimeConfig/runtimeConfigStore";

export function resolveFeatureGate(key: FeatureGateKey): boolean {
  const o = getRuntimeGateOverride(key);
  if (o !== undefined) return o;
  const envK = FEATURE_GATE_ENV_KEYS[key];
  if (envK) return readBooleanEnv(envK, FEATURE_GATE_REGISTRY[key].default);
  return FEATURE_GATE_REGISTRY[key].default;
}

export function resolveFeatureGateStatic(key: FeatureGateKey): boolean {
  return resolveFeatureGate(key);
}
