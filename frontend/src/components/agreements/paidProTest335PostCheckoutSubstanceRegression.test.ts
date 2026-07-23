/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  clearFrozenPremiumSessionBodiesForTests,
  getLatchedAcceptedServerFullDraftAuthority,
  latchAcceptedServerFullDraftAuthority,
  LONG_PREMIUM_AUTHORITATIVE_MIN_LEN,
} from "./premiumAcceptancePolicy";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  hasCanonicalReviewCorpusForRender,
  resolveCanonicalReviewCorpusLenForRender,
} from "./paidProDocumentBodyRouter";
import {
  clearDisplayReviewSnapshotAuthority,
  sha256CorpusDigest,
  storeVerifiedCommercialDisplayCorpus,
} from "../../agreement/canonicalReviewSnapshotApi";
import { resolvePaidProFirstReviewVisibleDisplayPlain } from "./paidProFirstReviewDisplayAuthority";
import {
  assessConciseCommercialServicesProQuality,
  validateProMinimumSubstance,
} from "./paidProConciseServicesQuality";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { pickPremiumPaidReadonlyPlainText } from "./premiumReadonlyRenderCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST335_INTAKE = [
  `Create a services agreement between ${RED_MESA} and ${HARBOR_PEAK}.`,
  `${HARBOR_PEAK} will provide AI workflow consulting, implementation support,`,
  "process documentation, configuration assistance, staff training, and automation deployment services",
  `for ${RED_MESA}. The engagement term is 12 months. Fixed fee of $48,000 paid monthly.`,
  "Oklahoma law. Both parties must review before signing.",
].join(" ");

function test335Draft(): ParsedDraftShape {
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

function buildTest335ServerBody(): string {
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
    "Provider will perform professional services under a written statement of work. ".repeat(420);
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
  return `${header}${filler}\n${footer}`;
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
  clearFrozenPremiumSessionBodiesForTests();
  clearDisplayReviewSnapshotAuthority();
});

describe("paidProTest335PostCheckoutSubstanceRegression", () => {
  it("raw minimum-substance validator flags malformed opening as missingSections unknown", () => {
    const body = buildTest335ServerBody();
    expect(body.length).toBeGreaterThanOrEqual(LONG_PREMIUM_AUTHORITATIVE_MIN_LEN);
    const raw = assessConciseCommercialServicesProQuality({
      text: body,
      rawIntake: TEST335_INTAKE,
      draft: test335Draft(),
    });
    expect(raw.ok).toBe(false);
    expect(raw.malformedOpening).toBe(true);
    expect(raw.missingSections).toEqual([]);
    expect(validateProMinimumSubstance({
      text: body,
      rawIntake: TEST335_INTAKE,
      draft: test335Draft(),
      source: "server_full_draft",
    }).ok).toBe(false);
  });

  it("pipeline-accepted server_full_draft_retry still establishes SoT when establish uses server_full_draft", () => {
    const body = buildTest335ServerBody();
    markPaidProPipelineValidationPassed({ text: body, source: "server_full_draft_retry" });
    const record = establishPaidProSourceOfTruth({
      text: body,
      source: "server_full_draft",
      draft: test335Draft(),
      intakeText: TEST335_INTAKE,
    });
    expect(record.text.length).toBeGreaterThanOrEqual(LONG_PREMIUM_AUTHORITATIVE_MIN_LEN);
    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(countPaidProExecutionBlocks(record.text)).toBe(1);
  });

  it("premium_readonly_pick renders latched accepted corpus when SoT is not yet established", () => {
    const body = buildTest335ServerBody();
    latchAcceptedServerFullDraftAuthority(body, "server_full_draft");
    markPaidProPipelineValidationPassed({ text: body, source: "server_full_draft" });
    const pick = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      agreementDocumentText: "",
      draft: test335Draft(),
      intakeText: TEST335_INTAKE,
      premiumCheckoutCompleted: true,
      lastPremiumPipelineRenderSource: "server_full_draft",
      premiumWinningBodyText: body,
    });
    expect(pick.plainText.length).toBeGreaterThanOrEqual(LONG_PREMIUM_AUTHORITATIVE_MIN_LEN);
    expect(pick.sourceUsed).toBe("server_full_document_text");
    expect(pick.audit.candidates[0]?.reason).toBe("latched_pipeline_accepted_server_full_draft");
  });

  it("first-review display authority paints verified GET corpus (not latched local fallback)", async () => {
    const body = buildTest335ServerBody();
    latchAcceptedServerFullDraftAuthority(body, "server_full_draft");
    // Latched local alone must not paint commercial review.
    expect(
      resolvePaidProFirstReviewVisibleDisplayPlain({
        agreementId: "ag_test335",
        draft: test335Draft(),
        intakeText: TEST335_INTAKE,
        premiumPaidDocumentSurface: true,
        premiumCheckoutCompleted: true,
        premiumRenderSource: "server_full_draft",
      }).plain,
    ).toBe("");
    const sha = await sha256CorpusDigest(body);
    storeVerifiedCommercialDisplayCorpus({
      agreementId: "ag_test335",
      snapshotId: "crs_test335",
      corpusSha256: sha,
      corpusLength: body.length,
      status: "pending",
      corpusPlain: body,
    });
    const visible = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: "ag_test335",
      draft: test335Draft(),
      intakeText: TEST335_INTAKE,
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: true,
      premiumRenderSource: "server_full_draft",
    });
    expect(visible.plain.length).toBeGreaterThanOrEqual(LONG_PREMIUM_AUTHORITATIVE_MIN_LEN);
    expect(visible.source).toBe("verified_server_canonical_review_snapshot");
    expect(visible.fallbackReason).toBeNull();
  });

  it("latched accepted authority is retained before SoT commit (render gate is pipeline/SoT)", () => {
    const body = buildTest335ServerBody();
    latchAcceptedServerFullDraftAuthority(body, "server_full_draft");
    // Latch alone is recovery/handoff state; canonical render still requires SoT or validated pipeline.
    expect(hasCanonicalReviewCorpusForRender()).toBe(false);
    expect(getLatchedAcceptedServerFullDraftAuthority()?.body.length).toBe(body.length);
    expect(resolveCanonicalReviewCorpusLenForRender()).toBe(0);
  });

  it("still blocks thin 3-section corpus without pipeline acceptance", () => {
    const thin = [
      "# Services Agreement",
      "",
      `This Services Agreement ("Agreement") is between ${RED_MESA} ("Client") and ${HARBOR_PEAK} ("Service Provider").`,
      "",
      "1. Services",
      "Provider shall perform AI workflow consulting services.",
      "",
      "2. Payment",
      "Client shall pay Provider $48,000 monthly.",
      "",
      "3. Governing Law",
      "Oklahoma law governs.",
    ].join("\n");
    expect(() =>
      establishPaidProSourceOfTruth({
        text: thin,
        draft: test335Draft(),
        intakeText: TEST335_INTAKE,
      }),
    ).toThrow(/\[(pro-minimum-substance-blocked|paid-pro-sot-establishment-blocked)\]/);
  });
});
