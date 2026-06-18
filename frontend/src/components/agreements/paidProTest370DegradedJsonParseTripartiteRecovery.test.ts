import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import {
  buildPremiumPostCheckoutLocalRecoveryProDraft,
  PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
} from "./premiumNetworkRecoveryLocalDraft";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  markCurrentSessionProEntitlementComplete,
  clearCurrentSessionProEntitlementMarkers,
} from "./paidProSessionEligibility";
import { bumpAgreementGenerationId } from "../../lib/agreementGenerationId";
import { PREMIUM_USABLE_BODY_MIN_LEN } from "./premiumPostCheckoutApplyEligible";
import { labeledPartyLegalEntities } from "./labeledPartyBlockParse";
import { previewPostCheckoutRecoverySotCommit } from "./paidProPostCheckoutRecoveryAuthority";
import {
  explainPaidProDegradedRecoveryDisplayRequirements,
  PAID_PRO_RECOVERY_MIN_DISPLAY_LEN,
} from "./paidProPostCheckoutRenderGate";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import { verifyIntakeEmailsPreserved } from "./paidProRenderPolish";
import { shouldBlockPaidProCanonicalFreezeOnApiFailure } from "./paidProApiFailureAuthorityGuard";
import { countSignatureBlockHeadingsInTail } from "./guidedDealCompletion/signatureRegion";

export const TEST370_TRIPARTITE_LABELED_PARTIES_INTAKE = `Create a TRIPARTITE AI PLATFORM DEVELOPMENT, ANALYTICS, AND REVENUE SHARING AGREEMENT.

Party 1
Legal Entity: Pioneer Freight Solutions LLC
Signer Name: Jennifer Lawson
Signer Title: President
Signer Email: jlawson@pioneerfreight.com

Party 2
Legal Entity: Summit Ridge Technologies LLC
Signer Name: Unknown
Signer Title: Unknown
Signer Email: legal@summitridgetech.com
Address: 2110 Crescent Park Drive, Plano, TX 75024

Party 3
Legal Entity: North Star Data Analytics LLC
Signer Name: Michael Carter
Signer Title: Director of Analytics
Signer Email: Unknown

Purpose: Development and maintenance of a custom AI freight optimization platform with analytics dashboard.

Term: thirty-six (36) months initial term with twenty-four (24) months exclusivity for platform features.

Payment: $185,000 in milestone payments to Summit Ridge Technologies LLC; $4,500 per month analytics fee to North Star Data Analytics LLC.

Revenue sharing: Pioneer Freight Solutions LLC 45%, Summit Ridge Technologies LLC 35%, North Star Data Analytics LLC 20%.

Each party will keep confidential information received from the other parties confidential.

Neither party may assign this Agreement without prior written consent of the other parties.

This Agreement shall be governed by and construed under the laws of the State of Texas.

Electronic execution via LawDog.`;

const TEST370_INTAKE = TEST370_TRIPARTITE_LABELED_PARTIES_INTAKE;
const TEST370_EMAILS = ["jlawson@pioneerfreight.com", "legal@summitridgetech.com"];

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

function buildTest370Draft() {
  return runIntakeDefaultsAndRoles(
    {
      title: "",
      jurisdiction: "",
      parties: [],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
    },
    TEST370_INTAKE,
    true,
    defaultIntakePartyRoleLabels(),
  );
}

function buildTinyRejectedDegradedBody(len = 583): string {
  let body = [
    "TRIPARTITE AI PLATFORM DEVELOPMENT, ANALYTICS, AND REVENUE SHARING AGREEMENT",
    "",
    "licensing revenue and information known at intake are not real parties.",
    "",
  ].join("\n");
  let i = 0;
  while (body.length < len) {
    body += `\nSection ${i + 1}. [claw_full_draft_expansion_v1] degraded filler. `;
    i += 1;
  }
  return body.slice(0, len);
}

const h = vi.hoisted(() => ({
  callIndex: 0,
  mockResults: [] as PremiumFullDraftResult[],
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () => {
      const r =
        h.mockResults[h.callIndex] ?? h.mockResults[h.mockResults.length - 1];
      h.callIndex += 1;
      return r
        ? Promise.resolve({ ok: true as const, result: r })
        : Promise.resolve({
            ok: false as const,
            failure_kind: "http" as const,
            retryable: false,
            error_code: "test_mode_skipped",
            document_text: "" as const,
            attemptCount: 0,
          });
    },
    postPremiumFullDraftOnce: () => {
      const r = h.mockResults[h.callIndex] ?? h.mockResults[h.mockResults.length - 1];
      h.callIndex += 1;
      return Promise.resolve(r);
    },
  };
});

function degradedJsonParseResult(doc: string): PremiumFullDraftResult {
  return {
    title: "Tripartite AI Platform Development, Analytics, and Revenue Sharing Agreement",
    agreement_family: "services_agreement",
    document_text: doc,
    server_full_document_text: "",
    key_terms_found: [],
    missing_material_info: [],
    generation_outcome: "degraded",
    server_generation_failure_code: "json_parse",
    server_generation_failure_message: "Structured intelligence JSON failed to parse.",
  };
}

describe("paidPro test370 degraded json_parse tripartite recovery", () => {
  beforeEach(() => {
    clearFrozenPremiumSessionBodiesForTests();
    clearPremiumParseSessionGuard();
    clearPremiumGenerationCallAudit();
    clearPaidProSourceOfTruth();
    clearCurrentSessionProEntitlementMarkers();
    bumpAgreementGenerationId();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
    h.callIndex = 0;
    const tiny = buildTinyRejectedDegradedBody(583);
    h.mockResults = [degradedJsonParseResult(tiny), degradedJsonParseResult(tiny)];
  });

  it("deterministic local recovery body is substantive with tripartite intake authority", () => {
    const draft = buildTest370Draft();
    const localRecovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft,
      rawIntake: TEST370_INTAKE,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(localRecovery.ok, JSON.stringify(localRecovery.reasons)).toBe(true);
    const body = localRecovery.body;
    const explained = explainPaidProDegradedRecoveryDisplayRequirements(body, TEST370_INTAKE);
    expect(explained.ok, explained.failedStep).toBe(true);

    expect(body).toMatch(/Tripartite AI Platform Development, Analytics, and Revenue Sharing Agreement/i);
    expect(body).toMatch(/Pioneer Freight Solutions LLC/i);
    expect(body).toMatch(/Summit Ridge Technologies LLC/i);
    expect(body).toMatch(/North Star Data Analytics LLC/i);
    expect(body).toMatch(/thirty-six\s*\(\s*36\s*\)\s*months/i);
    expect(body).toMatch(/twenty-four\s*\(\s*24\s*\)\s*months/i);
    expect(body).toMatch(/\$185,000|185,000/);
    expect(body).toMatch(/\$4,500|4,500/);
    expect(body).toMatch(/45%/);
    expect(body).toMatch(/35%/);
    expect(body).toMatch(/20%/);
    expect(body).toMatch(/Texas/i);
    expect(body).toMatch(/CLIENT:/i);
    expect(body).toMatch(/SERVICE PROVIDER:/i);
    expect(body).toMatch(/ANALYTICS PROVIDER:/i);
    expect(body).toMatch(/Jennifer Lawson/i);
    expect(body).toMatch(/legal@summitridgetech\.com/i);
    expect(body).toMatch(/Michael Carter/i);
    expect(body).not.toMatch(/licensing revenue/i);
    expect(countSignatureBlockHeadingsInTail(body)).toBe(3);
    expect((body.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);
  });

  it("free starter governing law recognizes State of Texas phrasing", () => {
    const structured = parseIntakeToStructuredAgreement(TEST370_INTAKE);
    expect(structured.governing_law).toMatch(/Texas/i);

    const draft = buildTest370Draft();
    expect(draft.jurisdiction).toMatch(/Texas/i);

    const starter = buildAgreementPreviewTextCore(draft, {
      starterPreview: true,
      intakeText: TEST370_INTAKE,
    });
    expect(starter).toMatch(/Texas/i);
    expect(starter).not.toMatch(/To be agreed by the parties unless otherwise agreed/i);
  });

  it("HTTP 200 degraded/json_parse on both attempts upgrades via intake local recovery", async () => {
    const draft = buildTest370Draft();
    const corruptedDraft = {
      ...draft,
      parties: [
        { name: "licensing revenue", role: "party" },
        { name: "information known at intake", role: "party" },
      ],
    };

    const localRecovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft: corruptedDraft,
      rawIntake: TEST370_INTAKE,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(localRecovery.ok).toBe(true);
    const recoveryPreview = previewPostCheckoutRecoverySotCommit({
      body: localRecovery.body,
      draft,
      intakeText: TEST370_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recoveryPreview.eligible).toBe(true);

    const out = await runPremiumCompletion({
      intakeText: TEST370_INTAKE,
      originalUserIntakeRawForMerge: TEST370_INTAKE,
      structuredDraft: corruptedDraft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test370",
      premiumRequestIntakeFingerprint: "fp-test370",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => corruptedDraft,
    });

    expect(h.callIndex).toBeGreaterThanOrEqual(1);
    expect(out.premiumDegradedServerLocalRecovery).toBe(true);
    expect(out.premiumRenderSource).toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThanOrEqual(PREMIUM_USABLE_BODY_MIN_LEN);
    expect(out.winningPremiumBodyText.length).toBeGreaterThanOrEqual(PAID_PRO_RECOVERY_MIN_DISPLAY_LEN);
    expect(out.proIntentGateMessage).toBeNull();
    expect(out.winningPremiumBodyText).not.toMatch(/licensing revenue/i);

    const emailGuard = verifyIntakeEmailsPreserved(TEST370_INTAKE, out.winningPremiumBodyText, TEST370_EMAILS);
    expect(emailGuard.finalExactEmailCount).toBe(TEST370_EMAILS.length);

    expect(
      shouldBlockPaidProCanonicalFreezeOnApiFailure({
        premiumRenderSource: out.premiumRenderSource,
        corpusLen: out.winningPremiumBodyText.length,
        hasEligibleRecoveryCorpus: true,
      }),
    ).toBe(false);

    expect(labeledPartyLegalEntities(TEST370_INTAKE)).toHaveLength(3);
  });
});
