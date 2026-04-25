import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveFeatureGate } from "../../config/featureFlags/resolveGate";
import { DYNAMIC_CONFIG_DEFAULTS } from "../../config/dynamicConfig/defaults";
import { assignVariantIndex } from "../experimentation/assignVariant";
import { drainProductEventsForTests } from "../experimentation/productEvents";
import { exposureWasLogged, logExperimentExposureOnce, resetExposureForTests } from "../experimentation/exposureLog";
import { parseAndHydrateRuntimeUiConfigV1 } from "./parseRuntimeUiConfigV1";
import {
  getMergedDynamicConfig,
  getRuntimeExperimentOverride,
  hydrateRuntimeConfigFromPartial,
  resetRuntimeConfigForTests,
} from "./runtimeConfigStore";

describe("control plane", () => {
  beforeEach(() => {
    resetRuntimeConfigForTests();
    drainProductEventsForTests();
    resetExposureForTests();
  });

  afterEach(() => {
    resetRuntimeConfigForTests();
    resetExposureForTests();
  });

  it("merged dynamic config falls back to defaults", () => {
    const m = getMergedDynamicConfig();
    expect(m.home.heroTitle).toBe(DYNAMIC_CONFIG_DEFAULTS.home.heroTitle);
  });

  it("partial server dynamic merge does not blank unrelated keys", () => {
    hydrateRuntimeConfigFromPartial({
      dynamic: { home: { heroTitle: "Override title" } },
    });
    const m = getMergedDynamicConfig();
    expect(m.home.heroTitle).toBe("Override title");
    expect(m.home.microSteps.length).toBeGreaterThan(0);
  });

  it("feature gate respects runtime override", () => {
    expect(resolveFeatureGate("affiliate_leaderboard_enabled")).toBe(true);
    hydrateRuntimeConfigFromPartial({ featureGates: { affiliate_leaderboard_enabled: false } });
    expect(resolveFeatureGate("affiliate_leaderboard_enabled")).toBe(false);
  });

  it("experiment assignment is stable for same subject", () => {
    const a = assignVariantIndex("ready_to_send_cta_framing", "subject_1", 2);
    const b = assignVariantIndex("ready_to_send_cta_framing", "subject_1", 2);
    expect(a).toBe(b);
  });

  it("exposure logs once per session key", () => {
    if (typeof sessionStorage === "undefined") return;
    logExperimentExposureOnce("home_hero_subtitle", "control");
    logExperimentExposureOnce("home_hero_subtitle", "control");
    expect(exposureWasLogged("home_hero_subtitle")).toBe(true);
    const ev = drainProductEventsForTests().filter((e) => e.name === "experiment_exposure");
    expect(ev.length).toBe(1);
  });

  it("parseAndHydrate rejects unknown schema version", () => {
    const titleBefore = getMergedDynamicConfig().home.heroTitle;
    const bad = parseAndHydrateRuntimeUiConfigV1({ schemaVersion: "999", dynamic: { home: { heroTitle: "nope" } } });
    expect(bad.ok).toBe(false);
    expect(getMergedDynamicConfig().home.heroTitle).toBe(titleBefore);
  });

  it("parseAndHydrate accepts v1 payload", () => {
    const ok = parseAndHydrateRuntimeUiConfigV1({
      schemaVersion: "1",
      dynamic: { opportunity: { shellTitle: "Pack HUD" } },
    });
    expect(ok.ok).toBe(true);
    expect(getMergedDynamicConfig().opportunity.shellTitle).toBe("Pack HUD");
  });

  it("hydrate maps experiment variant overrides", () => {
    hydrateRuntimeConfigFromPartial({
      experimentVariants: { ready_to_send_cta_framing: "trial_emphasis" },
    });
    expect(getRuntimeExperimentOverride("ready_to_send_cta_framing")).toBe("trial_emphasis");
  });
});
