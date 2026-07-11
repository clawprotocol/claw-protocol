/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { guardPaidProAcceptedServerFullDraftCommit } from "./paidProAcceptedServerFullDraftCommitGuard";
import {
  assessProfessionalProClauseCoverage,
  PROFESSIONAL_PRO_INTAKE_MIN_CORPUS_LEN,
  shouldRejectProfessionalProCorpus,
} from "./paidProProfessionalClauseCoverage";
import { assessPaidProSubstantiveServerDraftCorpus } from "./paidProSubstantiveCorpusAssessment";
import {
  buildTest518ConciseServerBody,
  TEST518_PRODUCTION_QUAD_PARTY_INTAKE,
  test518Draft,
} from "./paidProTest518Fixtures";
import { buildTest519MalformedProfessionalServerBody } from "./paidProTest519Fixtures";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { latchAcceptedServerFullDraftAuthority } from "./premiumAcceptancePolicy";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";

function padBoilerplate(core: string, targetLen = 2600): string {
  let t = core;
  while (t.length < targetLen) {
    t += "\n\nSupplemental commercial provision. Each Party shall maintain commercially reasonable records.";
  }
  return t;
}

describe("TEST584 — professional intake concise corpus authority", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    clearPaidProSourceOfTruth();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
    getOrInitSessionAgreementGenerationId();
    globalThis.sessionStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      length: 0,
      clear: () => storage.clear(),
      key: () => null,
    } as Storage;
  });

  it("A — TEST518 concise complete professional intake qualifies as complete_concise", () => {
    const body = buildTest518ConciseServerBody();
    const intake = TEST518_PRODUCTION_QUAD_PARTY_INTAKE;
    expect(body.length).toBeLessThan(PROFESSIONAL_PRO_INTAKE_MIN_CORPUS_LEN);
    const professional = assessProfessionalProClauseCoverage({ text: body, intake });
    expect(professional.materialClausesMissing).toHaveLength(0);
    expect(professional.classification).toBe("complete_concise");
    expect(professional.ok).toBe(true);
    const substantive = assessPaidProSubstantiveServerDraftCorpus({
      text: body,
      source: "server_full_draft",
      intakeText: intake,
      draft: test518Draft(),
    });
    expect(substantive.qualifiesForServerFullDraftAcceptance).toBe(true);
    establishPaidProSourceOfTruth({
      text: body,
      source: "server_full_draft",
      intakeText: intake,
      draft: test518Draft(),
    });
    const sot = getPaidProSourceOfTruth();
    expect(sot?.text.length).toBeGreaterThanOrEqual(body.length);
    expect(sot?.text).toContain("Redwood Biologics");
    expect(sot?.hash).toBeTruthy();
  });

  it("B — long but incomplete agreement remains blocked", () => {
    const malformed = buildTest519MalformedProfessionalServerBody();
    expect(malformed.length).toBeGreaterThanOrEqual(PROFESSIONAL_PRO_INTAKE_MIN_CORPUS_LEN);
    const professional = assessProfessionalProClauseCoverage({
      text: malformed,
      intake: TEST518_PRODUCTION_QUAD_PARTY_INTAKE,
    });
    expect(professional.materialClausesMissing.length).toBeGreaterThan(0);
    expect(shouldRejectProfessionalProCorpus(professional)).toBe(true);
    expect(() =>
      establishPaidProSourceOfTruth({
        text: malformed,
        source: "server_full_draft",
        intakeText: TEST518_PRODUCTION_QUAD_PARTY_INTAKE,
        draft: test518Draft(),
      }),
    ).toThrow(/professional-pro-clause-coverage-blocked/);
  });

  it("C — short genuinely incomplete agreement remains blocked", () => {
    const thin = "SERVICES AGREEMENT\n\n1. Scope only.\n2. Payment.";
    const professional = assessProfessionalProClauseCoverage({
      text: thin,
      intake: TEST518_PRODUCTION_QUAD_PARTY_INTAKE,
    });
    expect(professional.ok).toBe(false);
    expect(shouldRejectProfessionalProCorpus(professional)).toBe(true);
  });

  it("D — canonical agreement is measured, not a shorter preview excerpt", () => {
    const canonical = buildTest518ConciseServerBody();
    const preview = "MULTI-PARTY SERVICES AGREEMENT\n\nPreview stub only.";
    const canonicalAssessment = assessProfessionalProClauseCoverage({
      text: canonical,
      intake: TEST518_PRODUCTION_QUAD_PARTY_INTAKE,
    });
    const previewAssessment = assessProfessionalProClauseCoverage({
      text: preview,
      intake: TEST518_PRODUCTION_QUAD_PARTY_INTAKE,
    });
    expect(canonicalAssessment.ok).toBe(true);
    expect(previewAssessment.ok).toBe(false);
    expect(canonicalAssessment.corpusHash).not.toBe(previewAssessment.corpusHash);
  });

  it("E — ownership intake maps to intellectual property heading synonym", () => {
    const body = [
      "SERVICES AGREEMENT",
      "",
      "Between Alpha Labs LLC and Beta Consulting LLC.",
      "",
      "1. Scope. Services.",
      "2. Payment. $10,000.",
      "3. Intellectual Property. Provider assigns all work product and deliverables to Client.",
      "4. Confidentiality. Mutual confidentiality applies.",
      "5. Limitation of Liability. Liability is capped.",
      "6. Termination. Either party may terminate for convenience.",
      "7. Governing Law. Delaware law governs.",
      "8. Notices. Written notices required.",
      "9. Electronic Signatures. Counterparts and e-sign permitted.",
      "",
      "IN WITNESS WHEREOF, the parties execute this Agreement.",
      "CLIENT: Alpha Labs LLC",
      "SERVICE PROVIDER: Beta Consulting LLC",
      "",
      "Operative commercial clause. ".repeat(80),
    ].join("\n");
    const intake = [
      "Alpha Labs LLC",
      "Beta Consulting LLC",
      "consulting",
      "ownership of work product",
      "confidentiality",
      "limitation of liability",
      "termination",
      "governing law Delaware",
      "notices",
      "electronic signature",
    ].join("\n");
    const professional = assessProfessionalProClauseCoverage({ text: body, intake });
    expect(professional.materialClausesMissing).not.toContain("intellectual_property");
    expect(professional.ok).toBe(true);
  });

  it("F — heading without substantive body does not satisfy coverage", () => {
    const body = padBoilerplate(
      [
        "SERVICES AGREEMENT",
        "",
        "Between Alpha Labs LLC and Beta Consulting LLC.",
        "",
        "1. Confidentiality",
        "2. Intellectual Property",
        "3. Limitation of Liability",
        "4. Termination",
        "5. Governing Law",
        "6. Notices",
        "7. Electronic Signatures",
        "",
        "IN WITNESS WHEREOF, the parties execute this Agreement.",
      ].join("\n"),
    );
    const intake = [
      "Alpha Labs LLC",
      "Beta Consulting LLC",
      "confidentiality",
      "intellectual property",
      "limitation of liability",
      "termination",
      "governing law Delaware",
      "notices",
      "electronic signature",
    ].join("\n");
    const professional = assessProfessionalProClauseCoverage({ text: body, intake });
    expect(professional.materialClausesMissing.length).toBeGreaterThan(0);
    expect(professional.ok).toBe(false);
  });

  it("G — keyword only in notice stanza does not count as operative coverage", () => {
    const body = padBoilerplate(
      [
        "SERVICES AGREEMENT",
        "",
        "Between Alpha Labs LLC and Beta Consulting LLC.",
        "",
        "1. Scope. Services only.",
        "2. Payment. Fees.",
        "3. Termination. For convenience.",
        "4. Governing Law. Texas.",
        "5. Notices. Confidential information may be sent to notice addresses.",
        "6. Electronic Signatures. Permitted.",
        "",
        "IN WITNESS WHEREOF, the parties execute this Agreement.",
      ].join("\n"),
    );
    const intake = [
      "Alpha Labs LLC",
      "Beta Consulting LLC",
      "confidentiality",
      "intellectual property",
      "limitation of liability",
      "termination",
      "governing law Texas",
      "notices",
      "electronic signature",
    ].join("\n");
    const professional = assessProfessionalProClauseCoverage({ text: body, intake });
    expect(professional.materialClausesMissing).toContain("confidentiality");
    expect(professional.materialClausesMissing).toContain("intellectual_property");
    expect(professional.materialClausesMissing).toContain("limitation_of_liability");
  });

  it("H — optional clause not requested does not block qualification", () => {
    const body = buildTest518ConciseServerBody();
    const shortIntake = [
      "Redwood Biologics, Inc.",
      "Summit AI Consulting LLC",
      "AI services",
      "$450,000",
      "Texas law",
    ].join("\n");
    const professional = assessProfessionalProClauseCoverage({ text: body, intake: shortIntake });
    expect(professional.applies).toBe(false);
    expect(professional.ok).toBe(true);
  });

  it("K — boilerplate inflation without material coverage remains blocked", () => {
    const inflated = padBoilerplate("SERVICES AGREEMENT\n\n1. Scope.\n2. Payment.\n3. Term.\n");
    const intake = [
      "Alpha Labs LLC",
      "Beta Consulting LLC",
      "confidentiality",
      "intellectual property",
      "limitation of liability",
      "termination",
      "governing law Delaware",
      "notices",
      "electronic signature",
    ].join("\n");
    const professional = assessProfessionalProClauseCoverage({ text: inflated, intake });
    expect(inflated.length).toBeGreaterThanOrEqual(PROFESSIONAL_PRO_INTAKE_MIN_CORPUS_LEN);
    expect(professional.ok).toBe(false);
  });

  it("L — complete concise server corpus wins over shorter fallback when long latch exists", () => {
    const server = buildTest518ConciseServerBody();
    let padded = server;
    while (padded.length < 26_000) {
      padded += "\n\nSupplemental operative provision. Each Party shall maintain commercially reasonable records.";
    }
    latchAcceptedServerFullDraftAuthority(padded, "server_full_draft", { freezeEstablished: true });
    const fallback = "Deterministic fallback preview.".repeat(50);
    const guarded = guardPaidProAcceptedServerFullDraftCommit({
      candidateText: fallback,
      candidateSource: "fallback_preview",
      renderSource: "server_full_draft",
    });
    expect(guarded.rejected).toBe(true);
    expect(guarded.text).toBe(padded);
  });

  it("M — repeated assessment is idempotent", () => {
    const body = buildTest518ConciseServerBody();
    const args = { text: body, intake: TEST518_PRODUCTION_QUAD_PARTY_INTAKE };
    const first = assessProfessionalProClauseCoverage(args);
    const second = assessProfessionalProClauseCoverage(args);
    expect(second).toEqual(first);
    expect(first.corpusHash).toBe(fingerprintAgreementBody(body));
  });
});
