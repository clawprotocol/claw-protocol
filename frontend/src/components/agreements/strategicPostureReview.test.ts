/**
 * Heuristic + fixture coverage for the additive Strategic Posture Review layer.
 *
 * These tests exercise the deterministic detectors only. They never call out to the
 * network and are independent of the live review pipeline.
 *
 * Acceptance:
 *   • absent / empty input → fail-soft, no findings (panel will render nothing)
 *   • IP-bearing text without further-assurances surfaces an IP chain-of-title finding
 *   • work-for-hire without background-tech carveout surfaces that observation
 *   • compensation present without invoice/approval cadence surfaces a governance note
 *   • contributor-assignment-missing pattern surfaces the contributor packet finding
 *   • copy stays calm — never "invalid" / "unenforceable" / "noncompliant" / "critical"
 *   • banned internal-process language never appears in findings
 */

import { describe, expect, it } from "vitest";

import {
  STRATEGIC_POSTURE_DISCLAIMER,
  buildStrategicPostureReviewFromText,
} from "./strategicPostureReview";

/**
 * Canonical fixture: a services agreement that names IP ownership but omits the typical
 * companion clauses an experienced operator would expect for diligence (further
 * assurances, background-technology carveout, contributor assignment packet, ratification
 * of prior work, indemnity / liability framework, return-or-destroy mechanics, invoice
 * cadence, authority-to-bind for affiliated signatories).
 */
export const SERVICES_AGREEMENT_FIXTURE = `
SERVICES AGREEMENT — Acme Labs LLC and Beacon Studios Inc.

1. Scope. Beacon Studios will provide ongoing software services to Acme Labs and its
   affiliates, including continuing development of Project Helix, the existing platform
   originally built by Beacon Studios prior to this engagement.

2. Compensation. Acme Labs will pay a monthly retainer of $20,000 plus a discretionary
   project bonus.

3. Intellectual Property. Beacon Studios assigns all right, title, and interest in
   the deliverables to Acme Labs as work made for hire.

4. Confidentiality. Each party will maintain the confidentiality of materials shared
   under this agreement.

5. Signatures. Apollo Chen signs on behalf of Acme Labs LLC and on behalf of its
   affiliate Acme Studios LLC.
`.trim();

describe("buildStrategicPostureReviewFromText — fail-soft behavior", () => {
  it("returns a fail_soft review for empty input", () => {
    const review = buildStrategicPostureReviewFromText("");
    expect(review.fail_soft).toBe(true);
    expect(review.findings ?? []).toHaveLength(0);
  });

  it("returns a fail_soft review for null / undefined", () => {
    expect(buildStrategicPostureReviewFromText(null).fail_soft).toBe(true);
    expect(buildStrategicPostureReviewFromText(undefined).fail_soft).toBe(true);
  });

  it("returns no findings for plain non-legal text", () => {
    const review = buildStrategicPostureReviewFromText(
      "Quick note about lunch logistics, not a contract.",
    );
    expect(review.findings ?? []).toHaveLength(0);
    expect(review.missing_companion_documents ?? []).toHaveLength(0);
  });
});

describe("buildStrategicPostureReviewFromText — services agreement fixture", () => {
  const review = buildStrategicPostureReviewFromText(SERVICES_AGREEMENT_FIXTURE);

  it("surfaces a non-empty review with summary and findings", () => {
    expect(review.findings).toBeTruthy();
    expect((review.findings ?? []).length).toBeGreaterThanOrEqual(4);
    expect(review.summary).toBeTruthy();
  });

  it("flags IP chain-of-title (further assurances absent)", () => {
    const f = (review.findings ?? []).find((x) => x.category === "IP chain-of-title");
    expect(f).toBeTruthy();
    expect(f!.severity).toMatch(/medium|high/);
    expect(f!.suggested_update).toMatch(/further documents|further actions/i);
  });

  it("flags background-technology carveout (work-for-hire without carveout)", () => {
    const f = (review.findings ?? []).find((x) => x.category === "Background technology carveout");
    expect(f).toBeTruthy();
    expect(f!.suggested_update).toMatch(/background technology|background materials/i);
  });

  it("flags contributor assignment packet (entity-level only)", () => {
    const f = (review.findings ?? []).find((x) => x.category === "Contributor assignment packet");
    expect(f).toBeTruthy();
    expect(f!.suggested_update).toMatch(/contributor IP assignments/i);
  });

  it("flags ratification of prior work (Project Helix referenced, not ratified)", () => {
    const f = (review.findings ?? []).find((x) => x.category === "Ratification of prior work");
    expect(f).toBeTruthy();
    expect(f!.suggested_update).toMatch(/ratify|ratification/i);
  });

  it("flags compensation governance (monthly retainer without invoice cadence)", () => {
    const f = (review.findings ?? []).find((x) => x.category === "Compensation governance");
    expect(f).toBeTruthy();
    expect(f!.suggested_update).toMatch(/invoice|approval/i);
  });

  it("flags confidentiality return / destruction mechanics", () => {
    const f = (review.findings ?? []).find(
      (x) => x.category === "Confidentiality return / destruction mechanics",
    );
    expect(f).toBeTruthy();
    expect(f!.suggested_update).toMatch(/return or destroy|return.*destroy/i);
  });

  it("flags indemnification & liability structure absence", () => {
    const f = (review.findings ?? []).find(
      (x) => x.category === "Indemnification & liability structure",
    );
    expect(f).toBeTruthy();
    expect(f!.suggested_update).toMatch(/indemnif/i);
  });

  it("flags authority-to-bind across affiliated entities", () => {
    const f = (review.findings ?? []).find((x) => x.category === "Authority to bind");
    expect(f).toBeTruthy();
    expect(f!.suggested_update).toMatch(/duly authorized/i);
  });

  it("suggests companion documents (contributor packet + ratification resolution + intercompany memo)", () => {
    expect(review.missing_companion_documents).toBeTruthy();
    expect(review.missing_companion_documents!.join(" | ")).toMatch(/Contributor IP Assignment Packet/i);
    expect(review.missing_companion_documents!.join(" | ")).toMatch(/ratifying/i);
    expect(review.missing_companion_documents!.join(" | ")).toMatch(/Intercompany/i);
  });
});

describe("Strategic posture copy — calm, founder/operator language only", () => {
  const review = buildStrategicPostureReviewFromText(SERVICES_AGREEMENT_FIXTURE);
  const allCopy = [
    review.summary ?? "",
    STRATEGIC_POSTURE_DISCLAIMER,
    ...(review.findings ?? []).flatMap((f) => [f.observation, f.why_it_matters, f.suggested_update]),
    ...(review.missing_companion_documents ?? []),
  ].join("\n");

  it("never uses scary legal-conclusion words", () => {
    const banned = /\b(?:invalid|unenforceable|noncompliant|critical\s+failure)\b/i;
    expect(allCopy).not.toMatch(banned);
  });

  it("never leaks internal-process language", () => {
    const internal =
      /\b(?:parser|fallback|shell|internal|algorithm|threshold\s+logic|edit\s+in\s+review|specified\s+in\s+review|refined\s+in\s+review)\b/i;
    expect(allCopy).not.toMatch(internal);
  });

  it("disclaimer includes the 'software assistance, not legal advice' framing", () => {
    expect(STRATEGIC_POSTURE_DISCLAIMER).toMatch(/software assistance/i);
    expect(STRATEGIC_POSTURE_DISCLAIMER).toMatch(/not legal advice/i);
  });
});

describe("Detector restraint — does not flag clauses that are present", () => {
  const goodFixture = `
    The parties further agree to execute such further documents and take further actions as necessary.
    Each party retains its background technology and pre-existing materials.
    Upon termination each party will return or destroy all confidential materials.
    Invoices are submitted monthly and payment approval is required net 30 days from invoice.
    Each signatory represents that he or she is duly authorized to bind the entity.
    Each party will indemnify the other; aggregate liability is capped at fees paid in the prior 12 months.
    Contributor assignment agreements are required for all employees and contractors.
    The parties ratify all prior work performed on Project Helix.
  `;
  it("returns zero findings when the document already covers the typical companions", () => {
    const review = buildStrategicPostureReviewFromText(goodFixture);
    expect((review.findings ?? []).length).toBe(0);
  });
});
