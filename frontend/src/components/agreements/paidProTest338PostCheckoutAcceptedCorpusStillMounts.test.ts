/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  hasCanonicalReviewCorpusForRender,
  PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN,
  resolveCanonicalReviewCorpusLenForRender,
} from "./paidProDocumentBodyRouter";
import { resolvePaidProFirstReviewVisibleDisplayPlain } from "./paidProFirstReviewDisplayAuthority";
import {
  assessConciseCommercialServicesProQuality,
  validateProMinimumSubstance,
} from "./paidProConciseServicesQuality";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProPipelineAcceptedCorpusHashForTests,
  markPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import { pickPremiumPaidReadonlyPlainText } from "./premiumReadonlyRenderCorpus";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolveAuthoritativePartySlotCount } from "./partySlotIdentityNormalize";
import {
  clearCurrentSessionProEntitlementMarkers,
  evaluatePaidProSourceOfTruthEstablishment,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  latchAcceptedServerFullDraftAuthority,
  LONG_PREMIUM_AUTHORITATIVE_MIN_LEN,
} from "./premiumAcceptancePolicy";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  enablePaidProReviewInstrumentationForTests,
  resolvePaidProReviewBranchPath,
  resetPaidProReviewBranchInstrumentationForTests,
} from "./paidProReviewBranchInstrumentation";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST338_INTAKE = [
  `Create a services agreement between ${RED_MESA} and ${HARBOR_PEAK}.`,
  `${HARBOR_PEAK} will provide AI workflow consulting, implementation support,`,
  "process documentation, configuration assistance, staff training, and automation deployment services.",
  "12 months. Fixed fee of $48,000 paid monthly. Oklahoma law.",
].join(" ");

function test338Draft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "services_agreement",
    parties: [
      { name: RED_MESA, role: "Client" },
      { name: HARBOR_PEAK, role: "Service Provider" },
    ],
    purpose:
      "AI workflow consulting, implementation support, process documentation, configuration assistance, staff training, and automation deployment services.",
    payment_terms: "Fixed fee of $48,000 paid monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 48000, cadence: "monthly", valid: true },
  };
}

/** test338 QA: long server_full_draft with markdown opening (.signature → malformedOpening, empty missingSections). */
function buildTest338PipelineAcceptedBody(): string {
  const header = [
    "# SERVICES AGREEMENT",
    "",
    `This Services Agreement ("Agreement") is between ${RED_MESA} ("Client") and ${HARBOR_PEAK} ("Service Provider").`,
    "",
    "## Scope of Services",
    "Service Provider shall provide AI workflow consulting, implementation support, process documentation, configuration assistance, staff training, and automation deployment services.",
    "",
  ].join("\n");
  const filler =
    "Provider will perform professional services under a written statement of work. ".repeat(400);
  const footer = [
    "## Payment",
    "Client shall pay Service Provider a fixed fee of $48,000 paid monthly.",
    "",
    "## Governing Law",
    "This Agreement is governed by the laws of the State of Oklahoma.",
    "",
    "## Acceptance Review",
    "Client will review deliverables and identify any material nonconformity or defect.",
    "",
    "## Termination",
    "Either party may terminate this Agreement on written notice.",
    "",
    "## Confidentiality",
    "Each party shall keep non-public information confidential.",
    "",
    "## Work Product",
    "Client owns final deliverables and work product after payment.",
    "",
    "## Electronic Signatures",
    "The parties may execute this Agreement using electronic signatures and counterparts.",
    "",
    "See .signature below for authorized signers.",
  ].join("\n");
  const body = `${header}${filler}\n${footer}`;
  expect(body.length).toBeGreaterThanOrEqual(LONG_PREMIUM_AUTHORITATIVE_MIN_LEN);
  return body;
}

beforeEach(() => {
  sessionStorage.clear();
  clearCurrentSessionProEntitlementMarkers();
  getOrInitSessionAgreementGenerationId();
  markCurrentSessionProIntent();
  markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
});

afterEach(() => {
  sessionStorage.clear();
  clearCurrentSessionProEntitlementMarkers();
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
  clearPaidProPipelineAcceptedCorpusHashForTests();
  resetPaidProReviewBranchInstrumentationForTests();
});

describe("paidProTest338PostCheckoutAcceptedCorpusStillMounts", () => {
  it("pipeline-accepted server_full_draft variant still establishes SoT and mounts review", () => {
    const draft = test338Draft();
    const pipelineAcceptedBody = buildTest338PipelineAcceptedBody();
    const establishVariant = applyAcceptedProCorpusSafeDisplay(pipelineAcceptedBody, {
      draft,
      intakeText: TEST338_INTAKE,
      surface: "test338_establish_variant",
    }).text;
    expect(establishVariant.length).toBeGreaterThanOrEqual(LONG_PREMIUM_AUTHORITATIVE_MIN_LEN);
    expect(establishVariant).not.toBe(pipelineAcceptedBody);

    const rawSubstance = assessConciseCommercialServicesProQuality({
      text: pipelineAcceptedBody,
      rawIntake: TEST338_INTAKE,
      draft,
    });
    expect(rawSubstance.ok).toBe(false);
    expect(rawSubstance.missingSections).toEqual([]);
    expect(
      validateProMinimumSubstance({
        text: pipelineAcceptedBody,
        rawIntake: TEST338_INTAKE,
        draft,
        source: "server_full_draft",
      }).ok,
    ).toBe(false);

    markPaidProPipelineValidationPassed({
      text: pipelineAcceptedBody,
      source: "server_full_draft",
    });
    markPaidProPipelineAcceptedCorpusHash(pipelineAcceptedBody);
    latchAcceptedServerFullDraftAuthority(pipelineAcceptedBody, "server_full_draft");

    const establishmentGate = evaluatePaidProSourceOfTruthEstablishment({
      source: "server_full_draft",
    });
    expect(establishmentGate.allowed).toBe(true);
    expect(establishmentGate.reason).toBe("current_session_pro_entitlement");

    const sot = establishPaidProSourceOfTruth({
      text: establishVariant,
      source: "server_full_draft",
      draft,
      intakeText: TEST338_INTAKE,
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(sot.text.length).toBeGreaterThanOrEqual(LONG_PREMIUM_AUTHORITATIVE_MIN_LEN);

    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: TEST338_INTAKE });
    expect(reviewPlain.length).toBeGreaterThanOrEqual(LONG_PREMIUM_AUTHORITATIVE_MIN_LEN);
    expect(countPaidProExecutionBlocks(reviewPlain)).toBe(1);
    expect(
      resolveAuthoritativePartySlotCount({
        intakeText: TEST338_INTAKE,
        draftPartyNames: [RED_MESA, HARBOR_PEAK],
        rawPartyCount: 2,
      }),
    ).toBe(2);

    const pick = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      agreementDocumentText: "",
      draft,
      intakeText: TEST338_INTAKE,
      premiumCheckoutCompleted: true,
      lastPremiumPipelineRenderSource: "server_full_draft",
      premiumWinningBodyText: pipelineAcceptedBody,
      authoritativeHydratedPlainText: establishVariant,
    });
    expect(pick.plainText.length).toBeGreaterThanOrEqual(LONG_PREMIUM_AUTHORITATIVE_MIN_LEN);

    const visible = resolvePaidProFirstReviewVisibleDisplayPlain({
      draft,
      intakeText: TEST338_INTAKE,
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: true,
      premiumRenderSource: "server_full_draft",
    });
    expect(visible.plain.length).toBeGreaterThanOrEqual(LONG_PREMIUM_AUTHORITATIVE_MIN_LEN);

    expect(hasCanonicalReviewCorpusForRender()).toBe(true);
    expect(resolveCanonicalReviewCorpusLenForRender()).toBeGreaterThanOrEqual(
      PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN,
    );

    enablePaidProReviewInstrumentationForTests();
    const branch = resolvePaidProReviewBranchPath({
      premiumPaidDocumentSurface: true,
      showPaidProReviewDocumentCard: true,
      proUpgradeUseStarterView: false,
      paidProForcedFirstReviewActive: true,
      guidedPreReviewSignerSetupActive: false,
      paidProAwaitingRuntimeAuthority: false,
      simpleProFinalReviewShellActive: false,
      failedPremiumCorpusActive: false,
      premiumReturnWaitActive: false,
    });
    expect(branch.path).toBe("forced_embedded");
  });
});
