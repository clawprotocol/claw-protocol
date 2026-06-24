import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessStarterComplexityGate } from "./starterMultiPartyProGate";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { collectForbiddenTemplateFragments, finalizeUserVisibleAgreementPlainText } from "./agreementTemplatePlaceholderSafety";
import { validateClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import { extractOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  mergeLabeledPartyAuthorityIntoParties,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import { consumeAuthoritativeSignerCount, resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import {
  markCurrentSessionProEntitlementComplete,
  clearCurrentSessionProEntitlementMarkers,
} from "./paidProSessionEligibility";
import { bumpAgreementGenerationId } from "../../lib/agreementGenerationId";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import {
  TEST396_QUAD_PARTY_INTAKE,
  test396Draft,
  test396Parties,
} from "./paidProTest396Fixtures";
import { buildCanonicalAgreementSnapshot } from "./canonicalAgreementSnapshot";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc.";

const premiumApiMock = vi.hoisted(() => ({
  mockResponses: [] as PremiumFullDraftResult[],
  callIndex: 0,
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () => {
      const r =
        premiumApiMock.mockResponses[premiumApiMock.callIndex] ??
        premiumApiMock.mockResponses[premiumApiMock.mockResponses.length - 1];
      premiumApiMock.callIndex += 1;
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
    postPremiumFullDraftOnce: () => Promise.reject(new Error("no_mock")),
  };
});

function buildTest397ServerDraft(targetLen = 15_794): string {
  const preamble = [
    "MULTI-PARTY REVENUE SHARING AGREEMENT",
    "",
    `This Agreement is among ${RED} (Party A), ${BLUE} (Party B), ${HARBOR} (Party C), and ${IRON} (Party D).`,
    "",
    "1. Services",
    "The parties will collaborate on logistics automation and analytics services.",
    "",
    "2. Revenue Sharing",
    "Licensing revenue will be shared among Party A, Party B, Party C, and Party D.",
    "",
    "3. Payment",
    "Provider fees are payable monthly.",
    "",
    "4. Confidentiality",
    "Each party shall protect confidential information.",
    "",
    "5. Notices",
    "Notices must be in writing and may be delivered by email or certified mail.",
    `If to ${RED}, with a copy to contracts@redmesa-logistics.com.`,
    `If to ${BLUE}, with a copy to legal@bluecanyonanalytics.com.`,
    `If to ${HARBOR}, with a copy to legal@harborpeakautomation.com.`,
    `If to ${IRON}, with a copy to rstone@ironvale.com.`,
    "",
    "6. Governing Law",
    "This Agreement is governed by Oklahoma law.",
  ];
  const witness = [
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `${RED}:`,
    RED,
    "By: _________________________________",
    "Name: [Name]",
    "Title: [Title]",
    "",
    `${BLUE}:`,
    BLUE,
    "By: _________________________________",
    "Name: [Name]",
    "Title: [Title]",
    "",
    `${HARBOR}:`,
    HARBOR,
    "By: _________________________________",
    "Name: [Name]",
    "Title: [Title]",
    "",
    `${IRON}:`,
    IRON,
    "By: _________________________________",
    "Name: [Name]",
    "Title: [Title]",
  ];
  let body = preamble.join("\n");
  let i = 7;
  while (body.length + witness.join("\n").length < targetLen) {
    body += `\n${i}. Additional operative clause ${i} regarding revenue sharing and provider fees among the parties.`;
    i += 1;
  }
  body += witness.join("\n");
  return body;
}

function countIfToStanzas(corpus: string): number {
  const witness = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  const noticesIdx = corpus.search(/\bNotices\b/i);
  if (noticesIdx < 0) return 0;
  const region = corpus.slice(noticesIdx, witness >= 0 ? witness : corpus.length);
  const blob = extractOperativeIfToNoticeStanzas(region);
  if (!blob.trim()) return 0;
  return blob.split(/\n\n(?=If to\s+)/i).filter((s) => s.trim()).length;
}

beforeEach(() => {
  premiumApiMock.callIndex = 0;
  premiumApiMock.mockResponses = [];
  clearFrozenPremiumSessionBodiesForTests();
  clearPremiumParseSessionGuard();
  clearPremiumGenerationCallAudit();
  clearCurrentSessionProEntitlementMarkers();
  bumpAgreementGenerationId();
  markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
});

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
});

describe("TEST397 — multi-party placeholder freeze + VS01 drift regression", () => {
  it("accept path repairs placeholders with all 4 canonical party names — not draft slice(0,2)", () => {
    const server = buildTest397ServerDraft();
    const accepted = applyAcceptedProCorpusSafeDisplay(server, {
      draft: test396Draft(),
      intakeText: TEST396_QUAD_PARTY_INTAKE,
    }).text;
    const gate = finalizeUserVisibleAgreementPlainText(accepted, {
      intakeRaw: TEST396_QUAD_PARTY_INTAKE,
      partyNames: [RED, BLUE, HARBOR, IRON],
      surface: "test397_accept_path",
    });
    expect(gate.ok).toBe(true);
    expect(gate.remainingFatal).toHaveLength(0);
    expect(accepted.length).toBeGreaterThan(10_000);
    expect(gate.text).not.toMatch(/\[Title\]|\[Name\]|\[EMAIL_1\]|\[ADDRESS_1\]/);
  });

  it("VS01 corpus gate stays at 4 when draft.parties has only 2 but intake has 4", () => {
    const vs01Count = consumeAuthoritativeSignerCount(
      "vs01_corpus_gate",
      {
        intakeText: TEST396_QUAD_PARTY_INTAKE,
        draftParties: test396Draft().parties.slice(0, 2),
      },
      2,
    );
    expect(vs01Count).toBe(4);
    expect(
      resolveAuthoritativeSignerCount({
        intakeText: TEST396_QUAD_PARTY_INTAKE,
        draftParties: test396Draft().parties.slice(0, 2),
      }).count,
    ).toBe(4);
  });

  it("frozen SoT has integrityOk true and zero fatal placeholders for 15k quad-party body", () => {
    setConsumedPaidProSignerMetadataAuthority({
      parties: test396Parties(),
      source: "live_ui",
      hash: "test397",
      updatedAt: 0,
    });
    const server = buildTest397ServerDraft();
    const accepted = applyAcceptedProCorpusSafeDisplay(server, {
      draft: test396Draft(),
      intakeText: TEST396_QUAD_PARTY_INTAKE,
    }).text;
    markPaidProPipelineValidationPassed({ text: accepted, source: "server_full_draft" });

    establishPaidProSourceOfTruth({
      text: accepted,
      source: "server_full_draft",
      draft: test396Draft(),
      intakeText: TEST396_QUAD_PARTY_INTAKE,
    });
    const sot = getPaidProSourceOfTruthText();
    expect(sot.length).toBeGreaterThan(10_000);

    const reviewParties = resolvePartiesForReviewRender({
      draft: test396Draft(),
      intakeText: TEST396_QUAD_PARTY_INTAKE,
    });
    const snapshot = buildCanonicalAgreementSnapshot({
      surface: "test397_post_freeze",
      tier: "pro",
      candidates: [{ source: "server_full_document_text", text: sot }],
      intakeText: TEST396_QUAD_PARTY_INTAKE,
      parties: reviewParties.map((p) => ({
        name: p.partyLegalName,
        email: p.signerEmail,
        partyAddress: p.partyAddress,
      })),
      signerState: { complete: false, signerCount: 4 },
      forceAuthoritativePreservation: true,
    });
    expect(snapshot.integrityOk).toBe(true);
    expect(snapshot.placeholderIssues).toHaveLength(0);
    expect(countIfToStanzas(sot)).toBe(4);
    expect(validateClauseFamilyStructuralIntegrity(sot, { parties: test396Parties() }).ok).toBe(true);

    const fatal = collectForbiddenTemplateFragments(sot, TEST396_QUAD_PARTY_INTAKE, {
      partyNames: [RED, BLUE, HARBOR, IRON],
    });
    expect(fatal).toHaveLength(0);
    expect(sot).not.toMatch(/\[Title\]|\[Name\]|\[Address\]|\[EMAIL|\bParty\s+[AB]\b/i);
  });

  it("premium completion accepts long server draft — no preserved dirty corpus after soft reject", async () => {
    const genId = bumpAgreementGenerationId();
    const serverBody = buildTest397ServerDraft();
    premiumApiMock.mockResponses = [
      {
        generation_outcome: "ok",
        document_text: serverBody,
        authoritative_draft: serverBody,
        server_full_document_text: serverBody,
        title: "Multi-Party Revenue Sharing Agreement",
        agreement_family: "consulting_agreement",
        key_terms_found: ["Oklahoma law", "provider fees"],
        missing_material_info: [],
        schema_validation_reasons: [],
        server_generation_failure_code: "",
        server_repair_document_text: "",
      } satisfies PremiumFullDraftResult,
    ];

    const gate = assessStarterComplexityGate(TEST396_QUAD_PARTY_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.partyCount).toBe(4);

    const out = await runPremiumCompletion({
      intakeText: TEST396_QUAD_PARTY_INTAKE,
      originalUserIntakeRawForMerge: TEST396_QUAD_PARTY_INTAKE,
      structuredDraft: test396Draft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: genId,
      premiumRequestIntakeFingerprint: "fp-test397",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test396Draft(),
    });

    const doc = (out.winningPremiumBodyText || out.premiumDraft.premium_full_document_text || "").trim();
    expect(doc.length).toBeGreaterThan(10_000);
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
    const ph = finalizeUserVisibleAgreementPlainText(doc, {
      intakeRaw: TEST396_QUAD_PARTY_INTAKE,
      partyNames: mergeLabeledPartyAuthorityIntoParties([], TEST396_QUAD_PARTY_INTAKE).map(
        (p) => p.partyLegalName,
      ),
      surface: "test397_premium_completion",
    });
    expect(ph.ok).toBe(true);
    expect(ph.remainingFatal).toHaveLength(0);
    expect(doc).not.toMatch(/\[Title\]|\[Name\]|\[EMAIL_1\]/);
  });
});
