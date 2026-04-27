import { describe, expect, it } from "vitest";
import {
  parseStarterProRefineCtaExperimentEnv,
  starterProRefineImpressionFunnelEvent,
  starterProRefineUpsellCtaLabel,
} from "./starterProRefineCtaExperiment";

describe("parseStarterProRefineCtaExperimentEnv", () => {
  it("treats empty and control as control", () => {
    expect(parseStarterProRefineCtaExperimentEnv(undefined)).toBe("control");
    expect(parseStarterProRefineCtaExperimentEnv("")).toBe("control");
    expect(parseStarterProRefineCtaExperimentEnv("control")).toBe("control");
    expect(parseStarterProRefineCtaExperimentEnv("  Control  ")).toBe("control");
  });

  it("maps variant flags", () => {
    expect(parseStarterProRefineCtaExperimentEnv("variant")).toBe("variant");
    expect(parseStarterProRefineCtaExperimentEnv("UPGRADE")).toBe("variant");
    expect(parseStarterProRefineCtaExperimentEnv("1")).toBe("variant");
    expect(parseStarterProRefineCtaExperimentEnv("true")).toBe("variant");
  });
});

describe("starterProRefineUpsellCtaLabel", () => {
  it("matches product CTA; experiment arms use same label for analytics-only variant", () => {
    expect(starterProRefineUpsellCtaLabel("control")).toBe("Upgrade to improve draft");
    expect(starterProRefineUpsellCtaLabel("variant")).toBe("Upgrade to improve draft");
  });
});

describe("starterProRefineImpressionFunnelEvent", () => {
  it("maps experiment arm to one impression name per CTA test", () => {
    expect(starterProRefineImpressionFunnelEvent("control")).toBe("starter_pro_refine_control_impression");
    expect(starterProRefineImpressionFunnelEvent("variant")).toBe("starter_pro_refine_variant_impression");
  });
});
