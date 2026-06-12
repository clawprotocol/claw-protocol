/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyPaidProDocumentBlocks,
  detectPaidProPlainParagraphHeadingLeaks,
  GLUED_MAIN_AND_SUBSECTION_HEADING_RE,
  summarizePaidProDocumentBlockClassifications,
} from "./paidProDocumentBlockClassifier";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import { resolveAuthoritativePartySlotCount } from "./partySlotIdentityNormalize";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST337_INTAKE = [
  `Create a services agreement between ${RED_MESA} and ${HARBOR_PEAK}.`,
  `${HARBOR_PEAK} will provide AI workflow consulting, implementation support,`,
  "process documentation, configuration assistance, staff training, and automation deployment services.",
  "12 months. Fixed fee of $48,000 paid monthly. Oklahoma law.",
].join(" ");

function test337Draft(): ParsedDraftShape {
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

/** test337 QA corpus: main section headings glued to first subsection on one line. */
export function buildTest337GluedHeadingProCorpus(): string {
  const operative = [
    "SERVICES AGREEMENT",
    'This Services Agreement (the "Agreement") is entered into as of the Effective Date by and between',
    `${RED_MESA} ("Client") and ${HARBOR_PEAK} ("Service Provider").`,
    "1. Services and Scope 1.1 Services Service Provider will provide AI workflow consulting, implementation support, process documentation, configuration assistance, staff training, and automation deployment services for Client.",
    "1.2 Standard of Performance. Service Provider will perform the Services in a professional and workmanlike manner.",
    "2. Term and Termination 2.1 Term. The term is twelve (12) months from the Effective Date.",
    "2.2 Termination. Either party may terminate on thirty (30) days written notice.",
    "3. Compensation and Payment 3.1 Fixed Fee. Client shall pay Service Provider a fixed fee of $48,000 paid monthly.",
    "3.2 Invoicing and Payment Cadence. Invoices are due within thirty (30) days of receipt.",
    "4. Project Coordination, Approvals, and Changes 4.1 Points of Contact. Each party will designate a project contact.",
    "4.2 Approvals and Feedback. Client will review deliverables in good faith.",
    "5. Intellectual Property and Work Product 5.1 Client Ownership of Paid Deliverables. Client owns paid deliverables upon payment.",
    "5.2 Provider Retained Materials. Provider retains pre-existing tools and templates.",
    "11.6 Entire Agreement; Amendments. This Agreement is the entire agreement between the parties.",
    "11.7 Governing Law. This Agreement is governed by the laws of Oklahoma.",
    "11.8 Counterparts. The parties may execute this Agreement electronically.",
  ].join(" ");

  const witness = [
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    RED_MESA,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
    "SERVICE PROVIDER:",
    HARBOR_PEAK,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
  ].join("\n");

  return `${operative}\n\n${witness}`;
}

function assertNoGluedHeadingLeaks(plain: string): void {
  const lines = plain.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    expect(t).not.toMatch(GLUED_MAIN_AND_SUBSECTION_HEADING_RE);
  }
  expect(plain).not.toMatch(/Services and Scope 1\.1/);
  expect(plain).not.toMatch(/Compensation and Payment 3\.1/);
  expect(plain).not.toMatch(/Project Coordination, Approvals, and Changes 4\.1/);
  expect(detectPaidProPlainParagraphHeadingLeaks(plain).plainParagraphHeadingLeakCount).toBe(0);

  const sectionOne = classifyPaidProDocumentBlocks(plain).find((b) =>
    /^1\.\s+Services and Scope\s*$/i.test(b.firstLine.trim()),
  );
  expect(sectionOne?.kind).toBe("main_section_heading");
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
});

describe("paidProTest337GluedHeadingRegression", () => {
  it("preparePaidProReviewDisplayPlain splits main heading from immediate subsection", () => {
    const raw = buildTest337GluedHeadingProCorpus();
    const prepared = preparePaidProReviewDisplayPlain(raw);
    const summary = summarizePaidProDocumentBlockClassifications(prepared.text);
    expect(summary.mainSectionHeadingCount).toBeGreaterThan(0);
    assertNoGluedHeadingLeaks(prepared.text);
  });

  it("establish + review render preserve split headings and SoT display parity", () => {
    const raw = buildTest337GluedHeadingProCorpus();
    const draft = test337Draft();
    const prep = preparePaidProServerDocumentForAcceptance(raw, draft, TEST337_INTAKE);
    markPaidProPipelineValidationPassed({ text: prep.text, source: "server_full_draft_retry" });
    const sot = establishPaidProSourceOfTruth({
      text: prep.text,
      source: "server_full_draft",
      draft,
      intakeText: TEST337_INTAKE,
    });

    const renderPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: TEST337_INTAKE });
    const copy = getPaidProDocumentForSurface("copy", { draft, intakeText: TEST337_INTAKE })!.text;
    const signerSetup = getPaidProDocumentForSurface("signer_setup", {
      draft,
      intakeText: TEST337_INTAKE,
    })!.text;

    assertNoGluedHeadingLeaks(renderPlain);
    assertNoGluedHeadingLeaks(copy);
    assertNoGluedHeadingLeaks(signerSetup);

    expect(countPaidProExecutionBlocks(renderPlain)).toBe(1);
    expect(renderPlain).toContain(RED_MESA);
    expect(renderPlain).toContain(HARBOR_PEAK);
    expect(
      resolveAuthoritativePartySlotCount({
        intakeText: TEST337_INTAKE,
        draftPartyNames: [RED_MESA, HARBOR_PEAK],
        rawPartyCount: 2,
      }),
    ).toBe(2);

    const parity = auditPaidProReviewRenderSotParity({ reviewPlain: renderPlain });
    expect(parity.invariantOk).toBe(true);
    expect(parity.signerFieldOnlyDelta).toBe(true);
    expect(hashPaidProCorpus(copy)).toBe(parity.reviewHash);
    expect(sot.text).toContain(RED_MESA);
  });
});
