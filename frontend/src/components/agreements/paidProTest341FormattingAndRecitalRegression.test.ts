/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  buildStarterAgreementPreviewForReview,
} from "./agreementPreviewFromDraft";
import {
  detectPaidProPlainParagraphHeadingLeaks,
  GLUED_MAIN_AND_SUBSECTION_HEADING_RE,
} from "./paidProDocumentBlockClassifier";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { detectPaidProMalformedServicesOpening } from "./paidProOpeningRecitalGuard";
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
} from "./paidProSourceOfTruth";
import { repairMalformedPaidProAgreementRecital } from "./paidProAgreementRecitalRepair";
import { manifestRecordsForPaidProAcceptance } from "./paidProAcceptanceExecutionBlockInvariant";
import {
  formatStarterPreviewForDisplay,
  starterPreviewHasGluedSectionHeadings,
  starterPreviewHasParagraphSectionBreaks,
} from "./starterPreviewFormatting";
import { enrichStarterPreviewPartiesFromIntake } from "./starterOpeningPartyPreserve";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST341_INTAKE = [
  `Create a services agreement between ${RED_MESA} and ${HARBOR_PEAK}.`,
  `${HARBOR_PEAK} will provide AI workflow consulting, implementation support,`,
  "process documentation, configuration assistance, staff training, and automation deployment services",
  `for ${RED_MESA}. The engagement term is 12 months. Fixed fee of $48,000 paid monthly.`,
  "Oklahoma law. Both parties must review before signing.",
].join(" ");

function test341Draft(): ParsedDraftShape {
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

/** QA free starter corpus with glued section headings (test341 screenshot). */
export function buildTest341GluedFreeStarterCorpus(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is between ${RED_MESA} ("Client") and ${HARBOR_PEAK} ("Service Provider").`,
    "",
    "1. Scope of Services / Purpose AI workflow consulting, implementation support, process documentation, configuration assistance, staff training, and automation deployment services for Red Mesa Logistics LLC.",
    "",
    "2. Payment Terms Fixed fee of $48,000 paid monthly.",
    "",
    "3. Services Term and Effective Date Services Term: is 12 months from the Effective Date.",
    "",
    "4. Governing Law This Agreement shall be governed by the laws of Oklahoma.",
    "",
    "5. Termination Termination terms to be agreed by the parties.",
    "",
    "This agreement may be executed electronically via LawDog.",
  ].join("\n");
}

/** QA Pro corpus: duplicate openings, glued headings, truncated Party 2 LLC in signature. */
export function buildTest341GluedProCorpus(): string {
  const operative = [
    "CONSULTING AND IMPLEMENTATION AGREEMENT",
    `This Consulting and Implementation Agreement (the "Agreement") is entered into as of the Effective Date by and between ${RED_MESA} ("Client") and Harbor Peak Automation ("Service Provider").`,
    `This Agreement is between ${RED_MESA} ("Client") and Harbor Peak Automation ("Service Provider").`,
    `SERVICES AGREEMENT This Agreement is between ${RED_MESA} ("Client") and Harbor Peak Automation ("Service Provider").`,
    "1. Services and Scope Service Provider will provide AI workflow consulting, implementation support, process documentation, configuration assistance, staff training, and automation deployment services for Client.",
    "4. Fees, Invoicing and Payment Fixed Fee. Client shall pay Service Provider a fixed fee of $48,000 paid monthly.",
    "4.1 Invoicing. Service Provider will invoice Client monthly in advance.",
    "10. Termination and Effect of Termination Termination for Convenience. Either party may terminate this Agreement for convenience on thirty (30) days' prior written notice to the other party.",
    "10.2 Termination for Cause. Either party may terminate upon material breach.",
    "11. Governing Law. This Agreement is governed by the laws of Oklahoma.",
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
    "Harbor Peak Automation",
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
  for (const line of plain.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    expect(t).not.toMatch(GLUED_MAIN_AND_SUBSECTION_HEADING_RE);
  }
  expect(plain).not.toMatch(/Services and Scope Service Provider/);
  expect(plain).not.toMatch(/Fees, Invoicing and Payment Fixed Fee/);
  expect(plain).not.toMatch(/Termination and Effect of Termination Termination for Convenience/);
  expect(detectPaidProPlainParagraphHeadingLeaks(plain).plainParagraphHeadingLeakCount).toBe(0);
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
});

describe("paidProTest341FormattingAndRecitalRegression", () => {
  it("free starter splits glued section headings and keeps Client / Service Provider roles", () => {
    const raw = buildTest341GluedFreeStarterCorpus();
    expect(starterPreviewHasGluedSectionHeadings(raw)).toBe(true);

    const formatted = formatStarterPreviewForDisplay(raw);
    expect(starterPreviewHasGluedSectionHeadings(formatted)).toBe(false);
    expect(starterPreviewHasParagraphSectionBreaks(formatted)).toBe(true);
    expect(formatted).toMatch(/\n\n1\.\s+Scope of Services \/ Purpose\n\n/);
    expect(formatted).toMatch(/\n\n2\.\s+Payment Terms\n\n/);
    expect(formatted).not.toMatch(/Payment Terms Fixed fee/);
    expect(formatted).not.toMatch(/Scope of Services \/ Purpose AI workflow/);

    const draft = enrichStarterPreviewPartiesFromIntake(test341Draft(), TEST341_INTAKE);
    expect(draft.parties?.map((p) => p.role)).toEqual(["Client", "Service Provider"]);
    const preview = buildStarterAgreementPreviewForReview(draft, { intakeText: TEST341_INTAKE });
    expect(preview).toMatch(/\("Client"\)|\("Service Provider"\)/);
    expect(starterPreviewHasGluedSectionHeadings(preview)).toBe(false);
  });

  it("Pro dedupes competing openings and repairs glued headings with full legal entity names", () => {
    const raw = buildTest341GluedProCorpus();
    const draft = test341Draft();
    const records = manifestRecordsForPaidProAcceptance({ draft, intakeText: TEST341_INTAKE });
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(detectPaidProMalformedServicesOpening(raw, records)).toBe(true);

    const signerParties = records.map((rec, partyIndex) => ({
      partyIndex,
      partyLegalName: rec.fullLegalName,
      signerEmail: "",
      signerName: "",
      signerTitle: "",
      partyAddress: "",
    }));
    const recital = repairMalformedPaidProAgreementRecital(raw, signerParties);
    expect(recital.repairs.length).toBeGreaterThan(0);
    expect(recital.text).not.toMatch(/SERVICES AGREEMENT This Agreement is between/);
    expect(recital.text.match(/entered\s+into/gi)?.length ?? 0).toBeLessThanOrEqual(1);

    const display = preparePaidProReviewDisplayPlain(recital.text);
    assertNoGluedHeadingLeaks(display.text);
    expect(display.text).toContain("1. Services and Scope");

    const prep = preparePaidProServerDocumentForAcceptance(raw, draft, TEST341_INTAKE);
    markPaidProPipelineValidationPassed({ text: prep.text, source: "server_full_draft_retry" });
    establishPaidProSourceOfTruth({
      text: prep.text,
      source: "server_full_draft",
      draft,
      intakeText: TEST341_INTAKE,
    });

    const renderPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: TEST341_INTAKE });
    const copy = getPaidProDocumentForSurface("copy", { draft, intakeText: TEST341_INTAKE })!.text;

    assertNoGluedHeadingLeaks(renderPlain);
    assertNoGluedHeadingLeaks(copy);

    const opening = renderPlain.slice(0, 1_200);
    expect(opening).not.toMatch(/SERVICES AGREEMENT This Agreement is between/);
    expect((opening.match(/entered\s+into/gi) ?? []).length).toBeLessThanOrEqual(1);
    expect(renderPlain).toContain(HARBOR_PEAK);
    expect(renderPlain).not.toMatch(/SERVICE PROVIDER:\s*\n\s*Harbor Peak Automation\s*\n/i);

    expect(countPaidProExecutionBlocks(renderPlain)).toBe(1);

    const parity = auditPaidProReviewRenderSotParity({ reviewPlain: renderPlain });
    expect(parity.invariantOk).toBe(true);
    expect(
      resolveAuthoritativePartySlotCount({
        intakeText: TEST341_INTAKE,
        draftPartyNames: [RED_MESA, HARBOR_PEAK],
        rawPartyCount: 2,
      }),
    ).toBe(2);
  });
});
