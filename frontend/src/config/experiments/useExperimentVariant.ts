import { useEffect, useMemo, useRef } from "react";
import { assignVariantIndex } from "../../lib/experimentation/assignVariant";
import { logExperimentExposureOnce } from "../../lib/experimentation/exposureLog";
import { getOrCreateExperimentSubjectId } from "../../lib/experimentation/subjectId";
import { getRuntimeExperimentOverride } from "../../lib/runtimeConfig/runtimeConfigStore";
import { useRuntimeConfigGeneration } from "../../lib/runtimeConfig/useRuntimeConfigGeneration";
import { EXPERIMENT_DEFS, type ExperimentKey } from "./registry";

type VariantFor<K extends ExperimentKey> = (typeof EXPERIMENT_DEFS)[K]["variants"][number];

export function useExperimentVariant<K extends ExperimentKey>(key: K): { variant: VariantFor<K> } {
  const gen = useRuntimeConfigGeneration();
  const def = EXPERIMENT_DEFS[key];

  const variant = useMemo((): VariantFor<K> => {
    if (!def.enabled) return def.variants[0] as VariantFor<K>;
    const o = getRuntimeExperimentOverride(key);
    if (o && (def.variants as readonly string[]).includes(o)) return o as VariantFor<K>;
    const idx = assignVariantIndex(key, getOrCreateExperimentSubjectId(), def.variants.length);
    return def.variants[idx] as VariantFor<K>;
  }, [key, gen, def.enabled]);

  const exposureSent = useRef(false);
  useEffect(() => {
    if (!def.enabled) return;
    if (exposureSent.current) return;
    exposureSent.current = true;
    logExperimentExposureOnce(key, variant);
  }, [key, variant, def.enabled]);

  return { variant };
}
