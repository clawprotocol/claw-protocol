/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { detectPaidProOrphanSubsections, normalizePaidProOrphanSubsections } from "./normalizePaidProOrphanSubsections";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolveAuthoritativePartySlotCount } from "./partySlotIdentityNormalize";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST342_INTAKE = [
  `Create a services agreement between ${RED_MESA} and ${HARBOR_PEAK}.`,
  `${HARBOR_PEAK} will provide AI workflow consulting, implementation support,`,
  "process documentation, configuration assistance, staff training, and automation deployment services",
  `for ${RED_MESA}. The engagement term is 12 months. Fixed fee of $48,000 paid monthly.`,
  "Oklahoma law. Both parties must review before signing.",
].join(" ");

function test342Draft(): ParsedDraftShape {
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

/** test342 QA corpus: Section 1 has lone synthetic 1.1; Section 2 keeps true multi-subsection structure. */
export function buildTest342LoneSubsectionProCorpus(): string {
  const operative = [
    "CONSULTING AND IMPLEMENTATION AGREEMENT",
    `This Consulting and Implementation Agreement (the "Agreement") is entered into as of the Effective Date by and between ${RED_MESA} ("Client") and ${HARBOR_PEAK} ("Service Provider").`,
    "1. Services and Scope 1.1 Services. During the Term, Service Provider will provide AI workflow consulting, implementation support, process documentation, configuration assistance, staff training, and automation deployment services for Client.",
    "2. Deliverables, Reviews and Changes 2.1 Deliverables. Client will review deliverables in good faith. 2.2 Review and Feedback. Client will provide timely feedback on submitted deliverables.",
    "3. Governing Law. This Agreement is governed by the laws of Oklahoma.",
  ].join(" ");

  const witness = [
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    RED_MESA,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
    "SERVICE PROVIDER:",
    HARBOR_PEAK,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
  ].join("\n");

  return `${operative}\n\n${witness}`;
}

function assertSectionOneHasNoLoneSubsection(plain: string): void {
  expect(plain).toMatch(/\n1\.\s+Services and Scope\n/);
  expect(plain).not.toMatch(/^1\.1\s+Services\.?\s*$/m);
  expect(plain).not.toMatch(/\n1\.1\s+Services\.?\s*\n/);
  expect(plain).toMatch(/During the Term, Service Provider will provide/);
  const sectionOneRegion = plain.split(/\n2\.\s+Deliverables/)[0] ?? plain;
  expect(sectionOneRegion).not.toMatch(/\b1\.1\b/);
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
});

describe("paidProTest342LoneSubsectionRegression", () => {
  it("preparePaidProReviewDisplayPlain collapses lone 1.1 but preserves multi-subsection section 2", () => {
    const raw = buildTest342LoneSubsectionProCorpus();
    const prepared = preparePaidProReviewDisplayPlain(raw);
    assertSectionOneHasNoLoneSubsection(prepared.text);
    expect(prepared.text).toMatch(/\n2\.1\s+Deliverables/);
    expect(prepared.text).toMatch(/\n2\.2\s+Review and Feedback/);
    expect(detectPaidProOrphanSubsections(prepared.text).sectionNumbers).not.toContain(1);
  });

  it("normalizePaidProOrphanSubsections collapses label-only 1.1 with body on following lines", () => {
    const input = [
      "1. Services and Scope",
      "1.1 Services.",
      "During the Term, Service Provider will provide professional services.",
      "2. Deliverables",
      "2.1 First deliverable.",
      "2.2 Second deliverable.",
    ].join("\n\n");
    const result = normalizePaidProOrphanSubsections(input, { source: "test342" });
    expect(result.sectionNumbers).toEqual([1]);
    expect(result.text).toContain("During the Term, Service Provider will provide professional services.");
    expect(result.text).not.toMatch(/^1\.1\s/m);
    expect(result.text).toMatch(/^2\.1\s/m);
    expect(result.text).toMatch(/^2\.2\s/m);
  });

  it("establish + review render keep LLC names, one witness block, and collapsed section 1", () => {
    const raw = buildTest342LoneSubsectionProCorpus();
    const draft = test342Draft();
    const prep = preparePaidProServerDocumentForAcceptance(raw, draft, TEST342_INTAKE);
    markPaidProPipelineValidationPassed({ text: prep.text, source: "server_full_draft_retry" });
    establishPaidProSourceOfTruth({
      text: prep.text,
      source: "server_full_draft",
      draft,
      intakeText: TEST342_INTAKE,
    });

    const renderPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: TEST342_INTAKE });
    assertSectionOneHasNoLoneSubsection(renderPlain);
    expect(renderPlain).toContain(RED_MESA);
    expect(renderPlain).toContain(HARBOR_PEAK);
    expect(renderPlain).not.toMatch(/SERVICE PROVIDER:\s*\n\s*Harbor Peak Automation\s*\n/i);
    expect(countPaidProExecutionBlocks(renderPlain)).toBe(1);
    expect((renderPlain.match(/\bIN WITNESS WHEREOF\b/gi) ?? []).length).toBe(1);
    expect(
      resolveAuthoritativePartySlotCount({
        intakeText: TEST342_INTAKE,
        draftPartyNames: [RED_MESA, HARBOR_PEAK],
        rawPartyCount: 2,
      }),
    ).toBe(2);
  });
});
