import type { DynamicConfigRoot } from "./types";

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function mergeAny(base: unknown, patch: unknown): unknown {
  if (patch === undefined) return base;
  if (Array.isArray(patch)) return patch;
  if (isPlainObject(patch) && isPlainObject(base)) {
    const out: Record<string, unknown> = { ...base };
    for (const k of Object.keys(patch)) {
      const pv = patch[k];
      if (pv === undefined) continue;
      out[k] = mergeAny(base[k], pv);
    }
    return out;
  }
  return patch;
}

export function mergeDynamicConfig(base: DynamicConfigRoot, patch: Partial<DynamicConfigRoot>): DynamicConfigRoot {
  return mergeAny(base, patch) as DynamicConfigRoot;
}

export function mergeDynamicOverrides<T extends object>(a: Partial<T>, b: Partial<T>): Partial<T> {
  return mergeAny(a, b) as Partial<T>;
}

export function interpolateTemplate(template: string, vars: Record<string, string>): string {
  let s = template;
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{{${k}}}`).join(v);
  }
  return s;
}
