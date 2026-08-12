import { describe, expect, it } from "vitest";
import { evaluatePreSoTSemanticInsertGate } from "./preSoTSemanticInsertValidation";

describe("evaluatePreSoTSemanticInsertGate", () => {
  it("flags 99.5% uptime inserted by client when absent from wire and intake", () => {
    const server = "The Provider will use commercially reasonable efforts to maintain availability of the Service.";
    const final =
      server +
      ", with a target monthly uptime availability of 99.5%, excluding scheduled maintenance, emergency maintenance, force majeure events, third-party failures outside a party’s reasonable control, and acts or omissions of other parties";
    const r = evaluatePreSoTSemanticInsertGate({
      serverWireText: server,
      finalFreezeCandidateText: final,
      intakeText: "SaaS between A Inc and B LLC. No SLA stated.",
    });
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.id === "uptime_99_5")).toBe(true);
    expect(r.gateMode).toBe("enforce");
    expect(r.blocked).toBe(true);
  });

  it("allows uptime language when present on server wire", () => {
    const body =
      "target monthly uptime availability of 99.5%, excluding scheduled maintenance";
    const r = evaluatePreSoTSemanticInsertGate({
      serverWireText: body,
      finalFreezeCandidateText: body,
      intakeText: "no sla",
    });
    expect(r.findings.filter((f) => f.id === "uptime_99_5")).toHaveLength(0);
  });

  it("allows attorneys fees when intake authorizes", () => {
    const clause =
      " The prevailing Party in any action or proceeding arising out of or relating to this Agreement is entitled to recover its reasonable attorneys’ fees and costs to the extent permitted by applicable law.";
    const r = evaluatePreSoTSemanticInsertGate({
      serverWireText: "Governing law Delaware. Disputes in court.",
      finalFreezeCandidateText: "Governing law Delaware. Disputes in court." + clause,
      intakeText: "Include prevailing party attorneys fees.",
    });
    expect(r.findings.filter((f) => f.id === "attorneys_fees_prevailing")).toHaveLength(0);
  });
});
