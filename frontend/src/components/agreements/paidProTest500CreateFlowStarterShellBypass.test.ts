/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { markPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { buildPaidProFreezeCandidate } from "./paidProFreezeCandidate";
import { isLikelyFiveSectionStarterShellPro } from "./premiumFullDraftClientAcceptance";
import {
  resolveCreateFlowPaidAcceptedCorpusPlain,
  shouldSuppressPremiumNetworkRecoverableForPaidCreateFlow,
} from "./paidProCreateFlowReviewHandoff";
import {
  shouldApplyCreateFlowPaidFirstReviewRouting,
} from "./paidProAcceptanceRouting";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "./simpleProFinalReviewCorpus";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

const STARTER_PREVIEW =
  "1. Scope of Services / Purpose\nRed Mesa and Harbor Peak.\n2. Payment Terms\n$48,000.\n3. Term and Effective Date\n12 months.\n4. Governing Law\nDelaware.\n5. Termination\nEither party.\n".repeat(
    3,
  );

const STARTER_SHELL_SERVER_BODY = [
  "1. Scope of Services / Purpose",
  "Red Mesa Logistics LLC engages Harbor Peak Automation LLC for automation services.",
  "2. Payment Terms",
  "Total fee of $48,000 payable in installments.",
  "3. Term and Effective Date",
  "Twelve (12) months from the effective date.",
  "4. Governing Law",
  "State of Delaware.",
  "5. Termination",
  "Either party may terminate with thirty days notice.",
  // Parent + contiguous subsections (avoid trailing `clause N.` indexes that fusion/display
  // parsers misread as glued section markers).
  "6. Additional Terms",
  ...Array.from({ length: 40 }, (_, i) => `6.${i + 1} Additional operative detail for subsection ${i + 1}.`),
].join("\n");

const PREMIUM_DELIVERABLE = `PROFESSIONAL SERVICES AGREEMENT

This Professional Services Agreement ("Agreement") is entered into between Red Mesa Logistics LLC ("Client") and Harbor Peak Automation LLC ("Service Provider").

1. Services
Service Provider shall perform workflow automation and integration services for Client.

2. Compensation
Client shall pay Service Provider a total fee of $48,000 in two installments.

3. Term
The term of this Agreement shall be twelve (12) months.

4. Confidentiality
Each party shall maintain confidentiality of proprietary information.

5. Intellectual Property
Deliverables shall be owned by Client upon payment.

6. Acceptance and Review
Client shall review deliverables and provide written acceptance or rejection within ten (10) days.

7. Termination
Either party may terminate this Agreement for convenience upon thirty (30) days' written notice.

8. Governing Law
This Agreement shall be governed by the laws of Delaware.

9. Signatures
IN WITNESS WHEREOF, the parties execute this Agreement.

${"Additional operative clause with commercial detail. ".repeat(55)}`;

function test500Draft(): ParsedDraftShape {
  return {
    parties: [
      { name: "Red Mesa Logistics LLC", role: "Client" },
      { name: "Harbor Peak Automation LLC", role: "Service Provider" },
    ],
    purpose: STARTER_PREVIEW,
    premium_server_full_document_text: PREMIUM_DELIVERABLE,
    premium_full_document_text: PREMIUM_DELIVERABLE,
  } as unknown as ParsedDraftShape;
}

const TEST500_INTAKE = `
Draft a Professional Services Agreement between Red Mesa Logistics LLC (Client) and Harbor Peak Automation LLC (Service Provider).
Total fee: $48,000. Term: 12 months. Governing law: Delaware.
`.trim();

describe("TEST500 — returning paid create must not dead-end on starter-shell validation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "entitled_rewrite" });
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    sessionStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidProPostAcceptanceValidatorCache();
    vi.restoreAllMocks();
  });

  it("server body may match starter-shell heuristic but freeze still passes", () => {
    expect(STARTER_SHELL_SERVER_BODY.length).toBeGreaterThan(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    expect(isLikelyFiveSectionStarterShellPro(STARTER_SHELL_SERVER_BODY)).toBe(true);
    const freeze = buildPaidProFreezeCandidate({
      text: STARTER_SHELL_SERVER_BODY,
      draft: test500Draft(),
      intakeText: TEST500_INTAKE,
      source: "server_full_draft",
      surface: "test500",
    });
    expect(freeze.ok, freeze.rejectReason ?? "freeze_failed").toBe(true);
  });

  it("validatePaidProOutput accepts substantive server corpus when freeze passes", () => {
    const validation = validatePaidProOutput({
      text: PREMIUM_DELIVERABLE,
      rawIntake: TEST500_INTAKE,
      draft: test500Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok, validation.reasons.join(", ")).toBe(true);
  });

  it("resolveCreateFlowPaidAcceptedCorpusPlain prefers premium deliverable over starter preview", () => {
    markPaidProPipelineValidationPassed({ text: PREMIUM_DELIVERABLE, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(PREMIUM_DELIVERABLE);
    const plain = resolveCreateFlowPaidAcceptedCorpusPlain({
      winningBody: STARTER_PREVIEW,
      snapshotPlain: STARTER_PREVIEW,
      premiumDeliverablePlain: PREMIUM_DELIVERABLE,
      draft: test500Draft(),
    });
    expect(plain.length).toBeGreaterThan(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    expect(plain.length).toBeGreaterThan(STARTER_PREVIEW.length);
  });

  it("first review routing requires substantive corpus, not 866-char starter", () => {
    markPaidProPipelineValidationPassed({ text: PREMIUM_DELIVERABLE, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(PREMIUM_DELIVERABLE);
    expect(
      shouldApplyCreateFlowPaidFirstReviewRouting({
        alreadyOpened: false,
        premiumRenderSource: "server_full_draft",
        corpusPlain: STARTER_PREVIEW,
      }),
    ).toBe(false);
    expect(
      shouldApplyCreateFlowPaidFirstReviewRouting({
        alreadyOpened: false,
        premiumRenderSource: "server_full_draft",
        corpusPlain: PREMIUM_DELIVERABLE,
      }),
    ).toBe(true);
  });

  it("final review corpus uses pipeline body when authoritative hydrated is starter-length", () => {
    const res = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "",
      pickerPlain: STARTER_PREVIEW,
      pipelineWinningPlain: PREMIUM_DELIVERABLE,
      finalReviewAuthorityOnly: true,
      appliedAnswerCount: 0,
    });
    expect(res.plainText.length).toBeGreaterThan(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    expect(res.corpusBlocked).toBeFalsy();
  });

  it("intake blocks starter baseline and promotes pipeline corpus after acceptance", () => {
    const corpusAcceptance = readFileSync(join(__dirname, "paidProCorpusAcceptance.ts"), "utf8");
    expect(corpusAcceptance).toContain("shouldBypassStarterShellRenderRejection");
    expect(intake).toContain("resolveCreateFlowPaidAcceptedCorpusPlain");
    expect(intake).toContain("hasPaidCreateFlowPipelineAcceptance()) return \"\"");
    const guidedIdx = intake.indexOf("const guidedFinalReviewAuthoritativeResolution = useMemo");
    const guidedBlock = intake.slice(guidedIdx, guidedIdx + 2200);
    expect(guidedBlock).toContain("resolveCreateFlowPaidAcceptedCorpusPlain");
    expect(guidedBlock).toContain("GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN");
  });

  it("suppresses network recoverable panel when pipeline acceptance has substantive corpus", () => {
    markPaidProPipelineValidationPassed({ text: PREMIUM_DELIVERABLE, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(PREMIUM_DELIVERABLE);
    expect(
      shouldSuppressPremiumNetworkRecoverableForPaidCreateFlow({
        draft: test500Draft(),
        pipelineWinningBody: PREMIUM_DELIVERABLE,
      }),
    ).toBe(true);
  });
});
