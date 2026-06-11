import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../agreement/agreementTypes";
import { countPaidProExecutionBlocks } from "../components/agreements/paidProExecutionBlockAuthority";
import {
  buildOwnerAgreementReadOnlyDisplayHtml,
  buildOwnerAgreementReadOnlyPath,
} from "./ownerAgreementReadOnlyView";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";

function ownerReadOnlyFixturePlain(): string {
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is entered into by and between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
    "",
    "1. Services and Deliverables",
    "Service Provider shall deliver consulting and implementation services.",
    "",
    "2. Compensation",
    "Client shall pay fees within thirty (30) days after receipt of invoice.",
    "",
    ...Array.from(
      { length: 8 },
      (_, i) => `${i + 3}. Operative clause ${i + 1}.\n${"Professional performance is required. ".repeat(6)}`,
    ),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${BLUE}`,
    "Name: Sarah Mitchell",
    "Title: CEO",
    "Email for Notice: legal@bluecanyon.example",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "Name: Michael Torres",
    "Title: President",
    "Email for Notice: legal@ironvale.example",
  ].join("\n");
}

function ownerReadOnlyFixtureDraft(): AgreementDraft {
  return {
    id: "ag_owner_view",
    title: "Consulting Agreement",
    jurisdiction: "CA",
    parties: [
      { id: "p1", name: BLUE, role: "party" },
      { id: "p2", name: IRON, role: "reviewer", email: "iron@test.com" },
    ],
    purpose: ownerReadOnlyFixturePlain(),
    payment_terms: "Net 30",
    duration: "1y",
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    versions: [{ version: 1, created_at: "2026-01-01T00:00:00.000Z" }],
    audit_log: [{ event_type: "review_sent", at: "2026-01-02T00:00:00.000Z" }],
  } as AgreementDraft;
}

describe("ownerAgreementReadOnlyView", () => {
  it("builds read-only owner agreement path", () => {
    expect(buildOwnerAgreementReadOnlyPath("ag-1")).toBe("/app/agreements/ag-1/view");
  });

  it("renders Pro title and numbered section headings via canonical review-first renderer", () => {
    const plain = ownerReadOnlyFixturePlain();
    const draft = ownerReadOnlyFixtureDraft();
    const corpusBefore = plain;
    const { html, corpusText, usesPremiumDocument } = buildOwnerAgreementReadOnlyDisplayHtml({
      draft,
      corpus: { text: plain, source: "authoritative_signing_snapshot", hash: "fixture" },
    });

    expect(usesPremiumDocument).toBe(true);
    expect(corpusText).toBe(corpusBefore);
    expect(html).toContain("<h1>MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT</h1>");
    expect((html.match(/class="premium-doc-section-heading"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/1\.\s+Services and Deliverables/);
    expect(html).toMatch(/2\.\s+Compensation/);
    expect(html).not.toContain("<pre");
  });

  it("preserves a single execution block in rendered html", () => {
    const plain = ownerReadOnlyFixturePlain();
    const draft = ownerReadOnlyFixtureDraft();
    expect(countPaidProExecutionBlocks(plain)).toBe(1);

    const { html } = buildOwnerAgreementReadOnlyDisplayHtml({
      draft,
      corpus: { text: plain, source: "authoritative_signing_snapshot", hash: "fixture" },
    });

    expect(html.match(/IN WITNESS WHEREOF/gi)?.length ?? 0).toBe(1);
    expect(html).toMatch(/CLIENT:/i);
    expect(html).toMatch(/SERVICE PROVIDER:/i);
    expect(html).toMatch(/Blue Canyon Analytics LLC/i);
    expect(html).toMatch(/Iron Vale Systems Inc/i);
  });

  it("does not mutate source corpus text during display html build", () => {
    const plain = ownerReadOnlyFixturePlain();
    const draft = ownerReadOnlyFixtureDraft();
    const snapshot = plain;
    buildOwnerAgreementReadOnlyDisplayHtml({
      draft,
      corpus: { text: plain, source: "authoritative_signing_snapshot", hash: "fixture" },
    });
    expect(plain).toBe(snapshot);
  });
});
