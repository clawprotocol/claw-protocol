/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { guardPaidProAcceptedServerFullDraftCommit } from "./paidProAcceptedServerFullDraftCommitGuard";
import { buildTest444ServerFullDraft, TEST444_INTAKE, test444Draft } from "./paidProTest444Fixtures";
import { buildPaidProStructuralRecoveryBody } from "./paidProStructuralRecovery";
import {
  TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
} from "./paidProTest429FourPartyNorthStarFixtures";
import { test433FourPartyDraft } from "./paidProTest433FourPartyLiveFreezeFixtures";
import {
  assessPaidProSubstantiveServerDraftCorpus,
  paidProServerFullDraftBelowSubstantiveMin,
} from "./paidProSubstantiveCorpusAssessment";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { latchAcceptedServerFullDraftAuthority, SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";

function padWitnessBlock(core: string, targetLen = 26_000): string {
  let t = core;
  while (t.length < targetLen) {
    t += "\n\nSupplemental operative provision. Each Party shall maintain commercially reasonable records.";
  }
  return t;
}

describe("TEST583 — substantive server-draft length authority at acceptance", () => {
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

  it("A — long complete server draft qualifies as substantive_full", () => {
    const body = buildTest444ServerFullDraft();
    expect(body.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    const assessment = assessPaidProSubstantiveServerDraftCorpus({
      text: body,
      source: "server_full_draft",
      intakeText: TEST444_INTAKE,
      draft: test444Draft(),
    });
    expect(assessment.classification).toBe("substantive_full");
    expect(assessment.qualifiesForServerFullDraftAcceptance).toBe(true);
    expect(
      paidProServerFullDraftBelowSubstantiveMin({
        text: body,
        source: "server_full_draft",
        intakeText: TEST444_INTAKE,
        draft: test444Draft(),
      }),
    ).toBe(false);
  });

  const conciseCommercialBody = [
    "SERVICES AGREEMENT",
    "",
    "This Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
    "",
    "1. Scope. Harbor Peak will provide AI workflow setup.",
    "",
    "2. Fees. Red Mesa will pay Harbor Peak $5,000.",
    "",
    "3. Governing Law. Texas law governs.",
    "",
    "4. Electronic Signatures. Electronic signatures are allowed.",
    "",
    "IN WITNESS WHEREOF, the parties execute this Agreement.",
    "",
    "CLIENT:",
    "Red Mesa Logistics LLC",
    "By: _________________________________",
    "",
    "SERVICE PROVIDER:",
    "Harbor Peak Automation LLC",
    "By: _________________________________",
    "",
    "Operative commercial clause. ".repeat(160),
  ].join("\n");
  const conciseCommercialIntake = [
    "Red Mesa Logistics LLC",
    "Harbor Peak Automation LLC",
    "AI workflow setup",
    "$5,000",
    "Texas law",
  ].join("\n");
  const conciseCommercialDraft = test444Draft();

  it("B — concise structurally complete agreement qualifies without length-only rejection", () => {
    expect(conciseCommercialBody.length).toBeLessThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    const assessment = assessPaidProSubstantiveServerDraftCorpus({
      text: conciseCommercialBody,
      source: "server_full_draft",
      intakeText: conciseCommercialIntake,
      draft: conciseCommercialDraft,
    });
    expect(assessment.classification).toBe("structurally_complete_concise");
    expect(assessment.qualifiesForServerFullDraftAcceptance).toBe(true);
    expect(
      paidProServerFullDraftBelowSubstantiveMin({
        text: conciseCommercialBody,
        source: "server_full_draft",
        intakeText: conciseCommercialIntake,
        draft: conciseCommercialDraft,
      }),
    ).toBe(false);
    establishPaidProSourceOfTruth({
      text: conciseCommercialBody,
      source: "server_full_draft",
      intakeText: conciseCommercialIntake,
      draft: conciseCommercialDraft,
    });
    expect(getPaidProSourceOfTruth()?.hash).toBeTruthy();
  });

  it("C — thin mislabeled server draft remains rejected", () => {
    const thin = "A. ".repeat(673).slice(0, 2018);
    const assessment = assessPaidProSubstantiveServerDraftCorpus({
      text: thin,
      source: "server_full_draft",
    });
    expect(assessment.qualifiesForServerFullDraftAcceptance).toBe(false);
    expect(["mislabeled", "partial", "truncated"]).toContain(assessment.classification);
    const guarded = guardPaidProAcceptedServerFullDraftCommit({
      candidateText: thin,
      candidateSource: "server_full_draft",
      generationOutcome: "degraded",
    });
    expect(guarded.rejected).toBe(true);
    expect(guarded.reason).toBe("mislabeled_server_full_draft_below_substantive_min");
  });

  it("D — authoritative body is assessed, not a shorter preview alias", () => {
    const authoritative = conciseCommercialBody;
    const preview = "SERVICES AGREEMENT\n\nPartial preview stub.";
    const authAssessment = assessPaidProSubstantiveServerDraftCorpus({
      text: authoritative,
      source: "server_full_draft",
      intakeText: conciseCommercialIntake,
      draft: conciseCommercialDraft,
    });
    const previewAssessment = assessPaidProSubstantiveServerDraftCorpus({
      text: preview,
      source: "server_full_draft",
      intakeText: conciseCommercialIntake,
      draft: conciseCommercialDraft,
    });
    expect(authAssessment.qualifiesForServerFullDraftAcceptance).toBe(true);
    expect(previewAssessment.qualifiesForServerFullDraftAcceptance).toBe(false);
    expect(authAssessment.corpusHash).not.toBe(previewAssessment.corpusHash);
    establishPaidProSourceOfTruth({
      text: authoritative,
      source: "server_full_draft",
      intakeText: conciseCommercialIntake,
      draft: conciseCommercialDraft,
    });
    const sot = getPaidProSourceOfTruth()!;
    expect(sot.text.length).toBeGreaterThan(preview.length);
    expect(sot.text).toContain("Red Mesa Logistics LLC");
    expect(sot.hash).toBe(fingerprintAgreementBody(sot.text));
  });

  it("E — json_parse degradation does not void substantive document_text body", () => {
    const body = conciseCommercialBody;
    const assessment = assessPaidProSubstantiveServerDraftCorpus({
      text: body,
      source: "server_full_draft_degraded",
      intakeText: conciseCommercialIntake,
      draft: conciseCommercialDraft,
      generationOutcome: "degraded",
    });
    expect(assessment.qualifiesForServerFullDraftAcceptance).toBe(true);
    expect(
      () =>
        establishPaidProSourceOfTruth({
          text: body,
          source: "server_full_draft_degraded",
          intakeText: conciseCommercialIntake,
          draft: conciseCommercialDraft,
          generationOutcome: "degraded",
        }),
    ).not.toThrow(/mislabeled_server_full_draft_below_substantive_min/);
  });

  it("F — numerically long but truncated corpus remains rejected", () => {
    const truncated = `${"Operative clause with payment, termination, and governing law. ".repeat(180)}\n\n1. Scope\n2. Payment`;
    expect(truncated.length).toBeGreaterThan(3000);
    const assessment = assessPaidProSubstantiveServerDraftCorpus({
      text: truncated,
      source: "server_full_draft",
    });
    expect(assessment.appearsTruncated).toBe(true);
    expect(assessment.qualifiesForServerFullDraftAcceptance).toBe(false);
  });

  it("G — long malformed corpus with unresolved placeholders remains rejected", () => {
    const malformed = padWitnessBlock(
      [
        "SERVICES AGREEMENT",
        "",
        "Between [ORG_1] and [ORG_2].",
        "",
        "1. Scope. Services.",
        "2. Payment. Fees.",
        "3. Termination.",
        "4. Governing Law. Texas.",
        "",
        "IN WITNESS WHEREOF, the parties execute this Agreement.",
      ].join("\n"),
      12_000,
    );
    const assessment = assessPaidProSubstantiveServerDraftCorpus({
      text: malformed,
      source: "server_full_draft",
    });
    expect(assessment.placeholderCount).toBeGreaterThan(0);
    expect(assessment.qualifiesForServerFullDraftAcceptance).toBe(false);
  });

  it("H — safe normalization does not shrink a substantive agreement below qualification", () => {
    const raw = conciseCommercialBody;
    const normalized = raw.replace(/\s+\n/g, "\n").trim();
    const assessment = assessPaidProSubstantiveServerDraftCorpus({
      text: raw,
      normalizedText: normalized,
      source: "server_full_draft",
      intakeText: conciseCommercialIntake,
      draft: conciseCommercialDraft,
    });
    expect(assessment.blockers).not.toContain("normalization_shrinkage");
    expect(assessment.qualifiesForServerFullDraftAcceptance).toBe(true);
  });

  it("I — substantive server corpus wins over shorter deterministic fallback candidate", () => {
    const server = conciseCommercialBody;
    latchAcceptedServerFullDraftAuthority(padWitnessBlock(server), "server_full_draft", {
      freezeEstablished: true,
    });
    const fallback = "Starter deterministic fallback preview.".repeat(40);
    const guarded = guardPaidProAcceptedServerFullDraftCommit({
      candidateText: fallback,
      candidateSource: "fallback_preview",
      renderSource: "server_full_draft",
      generationOutcome: "ok",
    });
    expect(guarded.rejected).toBe(true);
    expect(guarded.text.length).toBeGreaterThan(fallback.length);
  });

  it("J — genuine partial server response remains blocked", () => {
    const partial = "SERVICES AGREEMENT\n\n1. Scope only.";
    expect(
      paidProServerFullDraftBelowSubstantiveMin({
        text: partial,
        source: "server_full_draft",
      }),
    ).toBe(true);
  });

  it("K — repeated assessment is idempotent", () => {
    const body = conciseCommercialBody;
    const args = {
      text: body,
      source: "server_full_draft",
      intakeText: conciseCommercialIntake,
      draft: conciseCommercialDraft,
    };
    const first = assessPaidProSubstantiveServerDraftCorpus(args);
    const second = assessPaidProSubstantiveServerDraftCorpus(args);
    expect(second).toEqual(first);
  });

  it("L — structural recovery mislabeled as server_full_draft stays rejected", () => {
    const structural = buildPaidProStructuralRecoveryBody({
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draft: test433FourPartyDraft(),
    });
    expect(structural.ok).toBe(true);
    const guarded = guardPaidProAcceptedServerFullDraftCommit({
      candidateText: structural.body,
      candidateSource: "server_full_draft",
      renderSource: "server_full_draft",
      generationOutcome: "ok",
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draft: test433FourPartyDraft(),
    });
    expect(guarded.rejected).toBe(true);
    expect(guarded.reason).toBe("mislabeled_server_full_draft_below_substantive_min");
  });
});
