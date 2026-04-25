import { RUNTIME_UI_CONFIG_SCHEMA_VERSION, type RuntimeUiConfigV1 } from "./apiShapesV1";
import { hydrateRuntimeConfigFromPartial } from "./runtimeConfigStore";

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/**
 * Safe parse + hydrate. Unknown or partial payloads never wipe defaults.
 */
export function parseAndHydrateRuntimeUiConfigV1(raw: unknown): { ok: boolean; error?: string } {
  if (raw === null || raw === undefined) {
    return { ok: false, error: "empty payload" };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, error: "expected object" };
  }
  const sv = raw.schemaVersion;
  if (sv !== undefined && sv !== RUNTIME_UI_CONFIG_SCHEMA_VERSION) {
    return { ok: false, error: `unsupported schemaVersion ${String(sv)}` };
  }
  const payload = raw as RuntimeUiConfigV1;
  hydrateRuntimeConfigFromPartial({
    featureGates: payload.featureGates,
    dynamic: payload.dynamic,
    experimentVariants: payload.experiments?.overrides,
  });
  return { ok: true };
}
