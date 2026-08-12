import { afterEach, describe, expect, it } from "vitest";
import { applyEnterpriseClausePolish } from "./paidProAgreementPolish";
import { applyMutualConsultingProfessionalQualityFloor } from "./paidProMutualConsultingQualityFloor";
import { applyAiWorkflowServicesQualityFloorToFallback } from "./premiumReadonlyRenderCorpus";
import { applyMilestoneTableGeneration } from "./proOperationalSynthesis/milestoneTableGeneration";
import { evaluatePreSoTSemanticInsertGate } from "./preSoTSemanticInsertValidation";
import {
  resetUnauthorizedSemanticInsertsForTests,
  setUnauthorizedSemanticInsertsForTests,
  unauthorizedSemanticInsertsAllowed,
} from "./unauthorizedSemanticInsertPolicy";

afterEach(() => {
  resetUnauthorizedSemanticInsertsForTests();
});

describe("unauthorized semantic insert policy (P0)", () => {
  it("disables inventing floors by default", () => {
    expect(unauthorizedSemanticInsertsAllowed()).toBe(false);
  });

  it("enterprise polish does not invent 99.5% / fees / 15-day without authority", () => {
    const body =
      "This SaaS Agreement includes dispute resolution and governing law. " +
      "Provider will use commercially reasonable efforts to maintain availability of the Service.";
    const { text, log } = applyEnterpriseClausePolish(body);
    expect(text).toBe(body);
    expect(log.uptimeTargetAdded).toBe(false);
    expect(log.attorneysFeesAdded).toBe(false);
    expect(log.disputeWindowAdded).toBe(false);
    expect(log.survivalPolished).toBe(false);
    expect(text).not.toMatch(/99\.5%/);
    expect(text).not.toMatch(/attorneys[’']\s+fees/i);
    expect(text).not.toMatch(/fifteen\s*\(\s*15\s*\)\s+business\s+days/i);
  });

  it("mutual consulting floor does not append liability / Delaware defaults", () => {
    const thin =
      "1. PARTIES\nAcme LLC and Beta Inc.\n\n2. SERVICES\nConsulting.\n\nIN WITNESS WHEREOF\n";
    const { text, repairs } = applyMutualConsultingProfessionalQualityFloor(
      thin,
      {
        parties: [
          { name: "Acme LLC", role: "client" },
          { name: "Beta Inc.", role: "provider" },
        ],
        jurisdiction: "",
      } as never,
      "mutual consulting and implementation services between Acme LLC and Beta Inc.",
    );
    expect(repairs).toEqual([]);
    expect(text).not.toMatch(/LIMITATION OF LIABILITY/i);
    expect(text).not.toMatch(/State of Delaware/i);
    expect(text).not.toMatch(/twelve\s*\(\s*12\s*\)\s+months/i);
  });

  it("AI-workflow floor does not invent acceptance sections", () => {
    const base = "1. SERVICES\nAI workflow configuration.\n\nIN WITNESS WHEREOF\n";
    const out = applyAiWorkflowServicesQualityFloorToFallback(
      base,
      {
        parties: [
          { name: "Client Co", role: "client" },
          { name: "Provider Co", role: "provider" },
        ],
      } as never,
      "AI workflow automation setup and acceptance demo services",
    );
    expect(out).not.toMatch(/ACCEPTANCE AND DEMONSTRATION REVIEW/i);
  });

  it("milestone generator does not invent acceptance language", () => {
    const body = "Services Agreement.\n\nIN WITNESS WHEREOF\n";
    const { text, inserted } = applyMilestoneTableGeneration(
      body,
      "Implementation milestones and deliverables with payment upon acceptance",
      "payment upon acceptance",
      [],
    );
    expect(inserted).toBe(false);
    expect(text).toBe(body);
    expect(text).not.toMatch(/deemed accepted/i);
  });

  it("allows inventing only when test opt-in is set", () => {
    setUnauthorizedSemanticInsertsForTests(true);
    expect(unauthorizedSemanticInsertsAllowed()).toBe(true);
    const body =
      "Dispute resolution and governing law. Provider will use commercially reasonable efforts to maintain availability of the Service.";
    const { log } = applyEnterpriseClausePolish(body);
    // At least one inventing polish may fire when opted in.
    expect(
      log.uptimeTargetAdded ||
        log.attorneysFeesAdded ||
        log.disputeWindowAdded ||
        log.survivalPolished ||
        log.effectiveDateAdded,
    ).toBe(true);
  });

  it("pre-SoT gate enforces in test/prod policy and preserves authorized terms", () => {
    const server = "target monthly uptime availability of 99.5%, excluding scheduled maintenance";
    const r = evaluatePreSoTSemanticInsertGate({
      serverWireText: server,
      finalFreezeCandidateText: server,
      intakeText: "no sla",
    });
    expect(r.findings.filter((f) => f.id === "uptime_99_5")).toHaveLength(0);

    const invented = evaluatePreSoTSemanticInsertGate({
      serverWireText: "commercially reasonable efforts to maintain availability",
      finalFreezeCandidateText:
        "commercially reasonable efforts to maintain availability, with a target monthly uptime availability of 99.5%, excluding scheduled maintenance",
      intakeText: "SaaS deal",
    });
    expect(invented.blocked).toBe(true);
    expect(invented.gateMode).toBe("enforce");
  });

  it("explicitly supplied attorneys fees in intake survive detection", () => {
    const clause =
      " The prevailing Party in any action or proceeding arising out of or relating to this Agreement is entitled to recover its reasonable attorneys’ fees and costs to the extent permitted by applicable law.";
    const r = evaluatePreSoTSemanticInsertGate({
      serverWireText: "Governing law. Disputes.",
      finalFreezeCandidateText: "Governing law. Disputes." + clause,
      intakeText: "Include prevailing party attorneys fees.",
    });
    expect(r.findings.filter((f) => f.id === "attorneys_fees_prevailing")).toHaveLength(0);
  });
});
