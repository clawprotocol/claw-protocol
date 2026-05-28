import { describe, expect, it } from "vitest";
import {
  buildCommercialFactGraph,
  commercialFactGraphToGuidanceLines,
  extractJointVentureEconomicsAnchors,
  isJointVentureEconomicsIntake,
} from "./commercialFactGraph";

const JV_INTAKE =
  "Joint venture LLC between Stone Ridge Developer LLC and Atlas Capital Fund II for a 180-unit workforce housing rehab in Columbus Ohio. Atlas provides pref equity $18M; Stone Ridge manages construction and leasing. Waterfall: 8% preferred return to Atlas, then 50/50 profit split. Capital calls require 10 business days notice with cure for missed calls. Deadlock on major decisions resolved by mutual buy-sell mechanism. Books audited annually. Mutual confidentiality on underwriting model.";

describe("commercialFactGraph joint venture economics", () => {
  it("detects JV / profit-share economics intake", () => {
    expect(isJointVentureEconomicsIntake(JV_INTAKE)).toBe(true);
    const anchors = extractJointVentureEconomicsAnchors(JV_INTAKE);
    expect(anchors.some((a) => /50\/50|profit split/i.test(a))).toBe(true);
    expect(anchors.some((a) => /capital calls/i.test(a))).toBe(true);
    expect(anchors.some((a) => /\$18m/i.test(a))).toBe(true);
  });

  it("builds joint_venture_economics graph and guidance without inventing timelines", () => {
    const graph = buildCommercialFactGraph(JV_INTAKE);
    expect(graph.agreementKind).toBe("joint_venture_economics");
    const lines = commercialFactGraphToGuidanceLines(graph, JV_INTAKE);
    expect(lines.join("\n")).toMatch(/profit\s+split|waterfall|capital calls/i);
    expect(lines.join("\n")).not.toMatch(/90[-\s]?day implementation timeline/i);
  });
});
