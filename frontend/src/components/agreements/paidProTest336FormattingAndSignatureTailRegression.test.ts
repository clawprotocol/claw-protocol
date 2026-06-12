/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyPaidProDocumentBlocks,
  detectPaidProPlainParagraphHeadingLeaks,
  summarizePaidProDocumentBlockClassifications,
} from "./paidProDocumentBlockClassifier";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { ensurePaidProAcceptanceExecutionBlockInvariant } from "./paidProAcceptanceExecutionBlockInvariant";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import {
  preparePaidProServerDocumentForAcceptance,
} from "./paidProConciseServicesQuality";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolveAuthoritativePartySlotCount } from "./partySlotIdentityNormalize";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST336_INTAKE = [
  `Create a services agreement between ${RED_MESA} and ${HARBOR_PEAK}.`,
  `${HARBOR_PEAK} will provide AI workflow consulting, implementation support,`,
  "process documentation, configuration assistance, staff training, and automation deployment services.",
  "12 months. Fixed fee of $48,000 paid monthly. Oklahoma law.",
].join(" ");

function test336Draft(): ParsedDraftShape {
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

/** Flattened server Pro body with inline stale SIGNATURES block before LawDog witness (test336 QA). */
export function buildTest336FlattenedProCorpus(): string {
  const operative = [
    "SERVICES AGREEMENT",
    'This Services Agreement (the "Agreement") is entered into upon full execution by both parties',
    `by and between ${RED_MESA} and ${HARBOR_PEAK}.`,
    "1. Services",
    "1.1 Scope of Services. Service Provider will provide professional services including AI workflow consulting, implementation support, and automation deployment.",
    "1.2 Standard of Performance. Service Provider will perform the Services in a professional manner.",
    "2. Payment. Client shall pay Service Provider a fixed fee of $48,000 paid monthly.",
    "3. Term. The term is twelve months.",
    "4. Confidentiality. Mutual confidentiality obligations apply to non-public information.",
    "5. Work Product. Client owns final deliverables and work product after payment.",
    "6. Acceptance Review. Client will review deliverables and identify material nonconformity.",
    "7. Termination. Either party may terminate on written notice.",
    "8. Electronic Signatures. The parties may execute using electronic signatures and counterparts.",
    "11.6 Survival. Certain obligations survive termination.",
    "11.7 Governing Law and Venue. This Agreement is governed by Oklahoma law.",
    "11.8 Counterparts and Electronic Signatures. The parties may execute electronically.",
  ].join(" ");

  const staleSig = [
    "SIGNATURES",
    "The parties have caused this Services Agreement to be signed as of the Effective Date.",
    "CLIENT: Red Mesa",
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
    "SERVICE PROVIDER: Harbor Peak",
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
  ].join(" ");

  const lawdogWitness = [
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "PARTY: Red Mesa Logistics LLC",
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
    "PARTY: Harbor Peak Automation LLC",
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
  ].join("\n");

  return `${operative} ${staleSig}\n\n${lawdogWitness}`;
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
});

describe("paidProTest336FormattingAndSignatureTailRegression", () => {
  it("preparePaidProReviewDisplayPlain promotes headings and strips stale inline SIGNATURES tail", () => {
    const raw = buildTest336FlattenedProCorpus();
    const prepared = preparePaidProReviewDisplayPlain(raw);
    const summary = summarizePaidProDocumentBlockClassifications(prepared.text);
    expect(summary.mainSectionHeadingCount).toBeGreaterThan(0);
    expect(summary.titleCount).toBeGreaterThan(0);
    expect(detectPaidProPlainParagraphHeadingLeaks(prepared.text).plainParagraphHeadingLeakCount).toBe(0);
    expect(prepared.text).not.toMatch(/\bSIGNATURES\b\s+The\s+parties\s+have\s+caused/i);
    expect(prepared.text).toMatch(/\bIN WITNESS WHEREOF\b/i);
    expect(countPaidProExecutionBlocks(prepared.text)).toBe(1);
    expect(prepared.text).toContain(RED_MESA);
    expect(prepared.text).toContain(HARBOR_PEAK);
  });

  it("preparePaidProServerDocumentForAcceptance normalizes flattened Pro server body", () => {
    const raw = buildTest336FlattenedProCorpus();
    const prep = preparePaidProServerDocumentForAcceptance(raw, test336Draft(), TEST336_INTAKE);
    expect(prep.text).not.toMatch(/\bSIGNATURES\b\s+The\s+parties\s+have\s+caused/i);
    expect(summarizePaidProDocumentBlockClassifications(prep.text).mainSectionHeadingCount).toBeGreaterThan(0);
    expect(countPaidProExecutionBlocks(prep.text)).toBe(1);
  });

  it("SoT establishment freezes normalized corpus with one execution block and full legal names", () => {
    const raw = buildTest336FlattenedProCorpus();
    const prep = preparePaidProServerDocumentForAcceptance(raw, test336Draft(), TEST336_INTAKE);
    markPaidProPipelineValidationPassed({ text: prep.text, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: prep.text,
      draft: test336Draft(),
      intakeText: TEST336_INTAKE,
      source: "server_full_draft",
    });
    const sot = getPaidProSourceOfTruthText();
    expect(sot).not.toMatch(/\bSIGNATURES\b\s+The\s+parties\s+have\s+caused/i);
    expect(sot).toContain(RED_MESA);
    expect(sot).toContain(HARBOR_PEAK);
    expect(countPaidProExecutionBlocks(sot)).toBe(1);
    const headings = classifyPaidProDocumentBlocks(sot)
      .filter((b) => b.kind === "main_section_heading")
      .map((b) => b.firstLine);
    expect(headings.length).toBeGreaterThan(0);
  });

  it("resolvePaidProReviewRenderPlain renders section headings instead of flattened body-only blocks", () => {
    const raw = buildTest336FlattenedProCorpus();
    const prep = preparePaidProServerDocumentForAcceptance(raw, test336Draft(), TEST336_INTAKE);
    markPaidProPipelineValidationPassed({ text: prep.text, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: prep.text,
      draft: test336Draft(),
      intakeText: TEST336_INTAKE,
      source: "server_full_draft",
    });
    const renderPlain = resolvePaidProReviewRenderPlain({
      draft: test336Draft(),
      intakeText: TEST336_INTAKE,
    });
    const summary = summarizePaidProDocumentBlockClassifications(renderPlain);
    expect(summary.mainSectionHeadingCount).toBeGreaterThan(0);
    expect(renderPlain).not.toMatch(/\bSIGNATURES\b\s+The\s+parties\s+have\s+caused/i);
    expect(countPaidProExecutionBlocks(renderPlain)).toBe(1);
  });

  it("partySlotCount remains 2 after normalization and acceptance", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      intakeText: TEST336_INTAKE,
      recipient1Name: RED_MESA,
      recipient2Name: HARBOR_PEAK,
      recipient1Email: "",
      recipient2Email: "",
      draftPartyNames: [RED_MESA, HARBOR_PEAK],
      partySignerNames: ["", ""],
      extraPartyReviewEmails: [],
      sendMode: "review",
      recipientsDeferred: false,
    });
    expect(manifest.parties).toHaveLength(2);
    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      intakeText: TEST336_INTAKE,
      draftPartyNames: [RED_MESA, HARBOR_PEAK],
      partySignerNames: ["", ""],
      recipient1Name: RED_MESA,
      recipient2Name: HARBOR_PEAK,
      recipient1Email: "",
      recipient2Email: "",
      extraPartyReviewEmails: [],
    });
    expect(gate.requiredCount).toBe(2);
    expect(
      resolveAuthoritativePartySlotCount({
        intakeText: TEST336_INTAKE,
        draftPartyNames: [RED_MESA, HARBOR_PEAK],
        rawPartyCount: gate.requiredCount,
      }),
    ).toBe(2);
  });

  it("ensurePaidProAcceptanceExecutionBlockInvariant strips stale tail before canonical witness", () => {
    const raw = buildTest336FlattenedProCorpus();
    const records = [
      {
        fullLegalName: RED_MESA,
        roleLabel: "Client",
        displayAlias: "Red Mesa",
        signerName: null,
        signerTitle: null,
        partyAddress: null,
      },
      {
        fullLegalName: HARBOR_PEAK,
        roleLabel: "Service Provider",
        displayAlias: "Harbor Peak",
        signerName: null,
        signerTitle: null,
        partyAddress: null,
      },
    ];
    const out = ensurePaidProAcceptanceExecutionBlockInvariant(raw, records);
    expect(out.text).not.toMatch(/\bSIGNATURES\b\s+The\s+parties\s+have\s+caused/i);
    expect(countPaidProExecutionBlocks(out.text)).toBe(1);
    expect(out.text).toContain(RED_MESA);
    expect(out.text).toContain(HARBOR_PEAK);
  });
});
